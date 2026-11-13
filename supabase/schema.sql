-- =====================================================================
--  مجید تل — اسکیمای دیتابیس (Supabase / PostgreSQL)
--  نحوه اجرا: Supabase → SQL Editor → New query → کل این فایل را Paste و Run کنید.
--  اجرای مجدد این فایل امن است (داده‌ها پاک نمی‌شوند).
--
--  امنیت: هیچ جدولی مستقیماً از سمت مرورگر قابل خواندن/نوشتن نیست (RLS بدون policy).
--  همه کارها فقط از طریق توابع زیر انجام می‌شود که خودشان رمز مدیر و توکن همکار را
--  روی سرور بررسی می‌کنند. کسر موجودی اتمی است؛ دو همکار هم‌زمان یک گوشی آخر را نمی‌خرند.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- جداول ----------
create table if not exists settings (
  key   text primary key,
  value text not null
);

create table if not exists products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  brand      text not null default 'Other',
  specs      text not null default '',
  price      bigint not null check (price >= 0),
  stock      int not null default 0 check (stock >= 0),
  image      text,
  created_at timestamptz not null default now()
);

create table if not exists partners (
  id         uuid primary key default gen_random_uuid(),
  token      uuid not null unique default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  shop       text not null default '',
  phone      text not null unique,
  address    text not null,
  created_at timestamptz not null default now()
);

create table if not exists cart_items (
  partner_id  uuid not null references partners(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  qty         int  not null check (qty > 0),
  reserved_at timestamptz not null default now(),
  primary key (partner_id, product_id)
);

create sequence if not exists order_seq start 1001;
create table if not exists orders (
  id         text primary key default ('MT-' || nextval('order_seq')),
  partner_id uuid references partners(id) on delete set null,
  partner    jsonb not null,
  items      jsonb not null,
  total      bigint not null,
  status     text not null default 'pending' check (status in ('pending','paid','shipped','canceled')),
  created_at timestamptz not null default now()
);

create table if not exists admin_attempts (
  at timestamptz not null default now()
);

alter table settings       enable row level security;
alter table products       enable row level security;
alter table partners       enable row level security;
alter table cart_items     enable row level security;
alter table orders         enable row level security;
alter table admin_attempts enable row level security;

-- رمز پیش‌فرض مدیر: 1988 (از داخل پنل قابل تغییر است)
insert into settings(key, value)
values ('admin_pin_hash', encode(extensions.digest('1988', 'sha256'), 'hex'))
on conflict (key) do nothing;
-- مدت رزرو گوشی در سبد (دقیقه). بعد از این مدت اگر فاکتور ثبت نشود، به انبار برمی‌گردد.
insert into settings(key, value) values ('reserve_minutes', '120') on conflict (key) do nothing;
alter table partners add column if not exists is_guest boolean not null default false;

-- ---------- توابع کمکی داخلی ----------
create or replace function _release_expired() returns void
language plpgsql security definer set search_path = public as $$
declare mins int := coalesce((select value::int from settings where key = 'reserve_minutes'), 120);
begin
  with expired as (
    delete from cart_items where reserved_at < now() - make_interval(mins => mins)
    returning product_id, qty
  )
  update products p set stock = p.stock + e.total
  from (select product_id, sum(qty) total from expired group by product_id) e
  where p.id = e.product_id;
  -- مهمان‌های قدیمی بدون سبد پاک می‌شوند
  delete from partners pa where pa.is_guest and pa.created_at < now() - interval '1 day'
    and not exists (select 1 from cart_items c where c.partner_id = pa.id);
end $$;

-- خروجی: null یعنی رمز درست است؛ در غیر این صورت کد خطا.
-- (exception نمی‌دهد تا ثبت تلاش ناموفق rollback نشود)
drop function if exists _check_admin(text);
create or replace function _check_admin(p_pin text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from admin_attempts where at > now() - interval '10 minutes') >= 8 then
    return 'LOCKED';
  end if;
  if encode(extensions.digest(coalesce(p_pin, ''), 'sha256'), 'hex')
     is distinct from (select value from settings where key = 'admin_pin_hash') then
    insert into admin_attempts default values;
    return 'BAD_PIN';
  end if;
  delete from admin_attempts where at < now() - interval '1 day';
  return null;
end $$;

create or replace function _partner(p_token uuid) returns partners
language plpgsql security definer set search_path = public as $$
declare r partners;
begin
  select * into r from partners where token = p_token;
  if not found then raise exception 'NO_PARTNER'; end if;
  return r;
end $$;

create or replace function _partner_json(r partners) returns jsonb
language sql immutable as $$
  select jsonb_build_object('first', r.first_name, 'last', r.last_name, 'shop', r.shop,
                            'phone', r.phone, 'address', r.address, 'token', r.token);
$$;

create or replace function _cart(p_partner uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'price', p.price, 'image', p.image, 'qty', c.qty,
           'reserved_at', c.reserved_at) order by c.reserved_at), '[]'::jsonb)
  from cart_items c join products p on p.id = c.product_id
  where c.partner_id = p_partner;
$$;

-- ---------- API عمومی (همکاران) ----------
drop function if exists list_products();
-- p_light = true: بدون عکس (برای به‌روزرسانی سبک و دوره‌ای موجودی)
create or replace function list_products(p_light boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _release_expired();
  return coalesce((select jsonb_agg(case when p_light then to_jsonb(p) - 'image' else to_jsonb(p) end
                   order by (p.stock > 0) desc, p.created_at desc) from products p), '[]'::jsonb);
end $$;

-- مهمان: بدون ثبت‌نام می‌تواند گوشی را در سبد رزرو کند؛ ثبت‌نام هنگام ثبت نهایی سفارش.
create or replace function create_guest() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  insert into partners(first_name, last_name, phone, address, is_guest)
  values ('', '', 'guest:' || gen_random_uuid(), '', true) returning token into t;
  return jsonb_build_object('token', t);
end $$;

create or replace function register_partner(p_first text, p_last text, p_shop text, p_phone text, p_address text, p_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r partners; cur partners; other partners;
begin
  if p_phone !~ '^09[0-9]{9}$' then raise exception 'BAD_PHONE'; end if;
  if length(trim(p_first)) = 0 or length(trim(p_last)) = 0 or length(trim(p_address)) = 0 then raise exception 'MISSING'; end if;

  if p_token is not null then select * into cur from partners where token = p_token; end if;
  select * into other from partners where phone = p_phone and (cur.id is null or id <> cur.id);

  if cur.id is not null and other.id is not null then
    -- این شماره قبلاً ثبت شده: سبد مهمان/حساب فعلی به حساب قبلی منتقل می‌شود
    insert into cart_items(partner_id, product_id, qty, reserved_at)
    select other.id, product_id, qty, reserved_at from cart_items where partner_id = cur.id
    on conflict (partner_id, product_id) do update set qty = cart_items.qty + excluded.qty, reserved_at = now();
    delete from cart_items where partner_id = cur.id;
    if cur.is_guest then delete from partners where id = cur.id; end if;
    update partners set first_name = trim(p_first), last_name = trim(p_last), shop = trim(coalesce(p_shop, '')),
                        address = trim(p_address)
    where id = other.id returning * into r;
  elsif cur.id is not null then
    update partners set first_name = trim(p_first), last_name = trim(p_last), shop = trim(coalesce(p_shop, '')),
                        phone = p_phone, address = trim(p_address), is_guest = false
    where id = cur.id returning * into r;
  end if;
  if r.id is null then
    insert into partners(first_name, last_name, shop, phone, address)
    values (trim(p_first), trim(p_last), trim(coalesce(p_shop, '')), p_phone, trim(p_address))
    on conflict (phone) do update set first_name = excluded.first_name, last_name = excluded.last_name,
                                      shop = excluded.shop, address = excluded.address
    returning * into r;
  end if;
  return _partner_json(r);
end $$;

create or replace function get_cart(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r partners := _partner(p_token);
begin
  perform _release_expired();
  return _cart(r.id);
end $$;

-- افزودن/کم کردن از سبد با کسر/برگشت اتمی موجودی
create or replace function cart_add(p_token uuid, p_product uuid, p_delta int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r partners := _partner(p_token); cur int;
begin
  perform _release_expired();
  if p_delta > 0 then
    update products set stock = stock - p_delta where id = p_product and stock >= p_delta;
    if not found then raise exception 'OUT_OF_STOCK'; end if;
    insert into cart_items(partner_id, product_id, qty) values (r.id, p_product, p_delta)
    on conflict (partner_id, product_id) do update set qty = cart_items.qty + p_delta, reserved_at = now();
  elsif p_delta < 0 then
    select qty into cur from cart_items where partner_id = r.id and product_id = p_product for update;
    if cur is null then return _cart(r.id); end if;
    p_delta := greatest(p_delta, -cur);
    update products set stock = stock - p_delta where id = p_product;
    if cur + p_delta <= 0 then delete from cart_items where partner_id = r.id and product_id = p_product;
    else update cart_items set qty = qty + p_delta where partner_id = r.id and product_id = p_product; end if;
  end if;
  return _cart(r.id);
end $$;

create or replace function checkout(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r partners := _partner(p_token); items jsonb; tot bigint; oid text;
begin
  if r.is_guest then raise exception 'NOT_REGISTERED'; end if;
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'qty', c.qty)),
         sum(p.price * c.qty)
  into items, tot
  from cart_items c join products p on p.id = c.product_id where c.partner_id = r.id;
  if items is null then raise exception 'EMPTY_CART'; end if;

  insert into orders(partner_id, partner, items, total)
  values (r.id, _partner_json(r) - 'token', items, tot) returning id into oid;
  delete from cart_items where partner_id = r.id;
  return jsonb_build_object('id', oid, 'total', tot);
end $$;

create or replace function my_orders(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r partners := _partner(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ts', created_at, 'items', items, 'total', total, 'status', status) order by created_at desc)
                   from orders where partner_id = r.id), '[]'::jsonb);
end $$;

-- ---------- API مدیر (همه با رمز؛ خطا به صورت {"error": "..."}) ----------
drop function if exists admin_login(text);
drop function if exists admin_adjust_stock(text,uuid,int);
drop function if exists admin_delete_product(text,uuid);
drop function if exists admin_set_status(text,text,text);
drop function if exists admin_change_pin(text,text);

create or replace function admin_login(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin);
begin return case when e is null then '{"ok":true}'::jsonb else jsonb_build_object('error', e) end; end $$;

create or replace function admin_data(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  perform _release_expired();
  return jsonb_build_object(
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'image' order by p.created_at desc) from products p), '[]'::jsonb),
    'orders',   coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'ts', o.created_at, 'partner', o.partner,
                          'items', o.items, 'total', o.total, 'status', o.status) order by o.created_at desc) from orders o), '[]'::jsonb),
    'reserved', coalesce((select jsonb_agg(jsonb_build_object('partner', pa.first_name || ' ' || pa.last_name, 'phone', pa.phone,
                          'name', p.name, 'qty', c.qty, 'at', c.reserved_at) order by c.reserved_at)
                          from cart_items c join partners pa on pa.id = c.partner_id join products p on p.id = c.product_id), '[]'::jsonb),
    'partners', (select count(*) from partners where not is_guest)
  );
end $$;

create or replace function admin_save_product(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin); r products;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if nullif(p->>'id', '') is not null then
    update products set name = p->>'name', brand = p->>'brand', specs = coalesce(p->>'specs', ''),
           price = (p->>'price')::bigint, stock = greatest(0, (p->>'stock')::int), image = p->>'image'
    where id = (p->>'id')::uuid returning * into r;
  else
    insert into products(name, brand, specs, price, stock, image)
    values (p->>'name', p->>'brand', coalesce(p->>'specs', ''), (p->>'price')::bigint, greatest(0, (p->>'stock')::int), p->>'image')
    returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function admin_adjust_stock(p_pin text, p_id uuid, p_delta int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin); s int;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  update products set stock = greatest(0, stock + p_delta) where id = p_id returning stock into s;
  return jsonb_build_object('stock', s);
end $$;

create or replace function admin_delete_product(p_pin text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  delete from products where id = p_id;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function admin_set_status(p_pin text, p_id text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin); o orders; it jsonb; sgn int := 0;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  select * into o from orders where id = p_id for update;
  if not found then return '{"error":"NO_ORDER"}'::jsonb; end if;
  if p_status = 'canceled' and o.status <> 'canceled' then sgn := 1;     -- لغو: برگشت به انبار
  elsif o.status = 'canceled' and p_status <> 'canceled' then sgn := -1; -- برگشت از لغو
  end if;
  if sgn <> 0 then
    for it in select * from jsonb_array_elements(o.items) loop
      update products set stock = greatest(0, stock + sgn * (it->>'qty')::int) where id = (it->>'id')::uuid;
    end loop;
  end if;
  update orders set status = p_status where id = p_id;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function admin_change_pin(p_pin text, p_new text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := _check_admin(p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if p_new !~ '^[0-9]{4,8}$' then return '{"error":"BAD_NEW_PIN"}'::jsonb; end if;
  update settings set value = encode(extensions.digest(p_new, 'sha256'), 'hex') where key = 'admin_pin_hash';
  return '{"ok":true}'::jsonb;
end $$;

-- ---------- دسترسی‌ها ----------
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function list_products(boolean), create_guest(), register_partner(text,text,text,text,text,uuid), get_cart(uuid),
  cart_add(uuid,uuid,int), checkout(uuid), my_orders(uuid), admin_login(text), admin_data(text),
  admin_save_product(text,jsonb), admin_adjust_stock(text,uuid,int), admin_delete_product(text,uuid),
  admin_set_status(text,text,text), admin_change_pin(text,text)
to anon, authenticated;

-- چند گوشی نمونه (فقط اگر انبار خالی است)
insert into products(name, brand, specs, price, stock)
select * from (values
  ('iPhone 13 Pro 256GB', 'Apple', 'ZAA • باتری ۹۲٪ • Grade A++ بدون بازشدگی', 54800000::bigint, 3),
  ('Samsung Galaxy S23 Ultra', 'Samsung', '256GB رم ۱۲ • در حد آکبند با کارتن', 49200000, 1),
  ('iPhone 11 128GB', 'Apple', 'LLA • باتری ۸۶٪ • تمیز و پلمپ', 26500000, 4),
  ('Xiaomi 13T Pro 512GB', 'Xiaomi', 'رم ۱۲ • دوربین لایکا • شارژر اصلی', 28900000, 2)
) v where not exists (select 1 from products);
