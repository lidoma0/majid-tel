/* =========================================================
   مجید تل — منطق برنامه
   لایه API: اگر Supabase تنظیم شده باشد از سرور، وگرنه «دمو» داخل مرورگر.
   هر دو یک مجموعه تابع یکسان دارند تا بعداً جابه‌جایی به لیارا ساده باشد.
   ========================================================= */
'use strict';
const CFG = window.MAJIDTEL_CONFIG || {};
const KEY = 'majidtel_v4';
const BRANDS = { Apple: 'اپل', Samsung: 'سامسونگ', Xiaomi: 'شیائومی', Huawei: 'هوآوی', Nokia: 'نوکیا', Other: 'سایر' };
const STATUS = {
  pending:  { t: 'در انتظار تسویه', c: 'bg-amber-500/15 text-amber-300 border-amber-500/30', b: 'border-r-amber-400' },
  paid:     { t: 'تسویه شده',       c: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', b: 'border-r-emerald-500' },
  shipped:  { t: 'ارسال شده',       c: 'bg-sky-500/15 text-sky-400 border-sky-500/30', b: 'border-r-sky-500' },
  canceled: { t: 'لغو شده',         c: 'bg-rose-500/15 text-rose-400 border-rose-500/30', b: 'border-r-rose-500' }
};
const ERRORS = {
  OUT_OF_STOCK: 'موجودی این گوشی همین الان تمام شد', NO_PARTNER: 'حساب همکاری پیدا نشد؛ دوباره ثبت‌نام کنید',
  BAD_PHONE: 'شماره موبایل معتبر نیست', MISSING: 'همه فیلدهای ستاره‌دار را پر کنید', EMPTY_CART: 'سبد خرید خالی است',
  BAD_PIN: 'رمز اشتباه است', LOCKED: 'به دلیل تلاش‌های زیاد، ورود مدیر ۱۰ دقیقه قفل شد', BAD_NEW_PIN: 'رمز جدید باید ۴ تا ۸ رقم باشد',
  NETWORK: 'اتصال به سرور برقرار نشد؛ اینترنت را بررسی کنید', NO_ORDER: 'فاکتور پیدا نشد', NOT_REGISTERED: 'برای ثبت سفارش ابتدا ثبت‌نام کنید'
};
const FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const REMOTE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const IN_APP = /MajidTelApp/i.test(navigator.userAgent) || !!window.Capacitor;

/* ---------- Safe storage ---------- */
const mem = {};
const store = type => ({
  get: k => { try { return window[type].getItem(k); } catch { return mem[type + k] ?? null; } },
  set: (k, v) => { try { window[type].setItem(k, v); } catch (e) { if (e && e.name === 'QuotaExceededError') throw e; mem[type + k] = v; } },
  del: k => { try { window[type].removeItem(k); } catch { delete mem[type + k]; } }
});
const LS = store('localStorage'), SS = store('sessionStorage');

/* =========================================================
   API — Supabase (RPC)
   ========================================================= */
async function remoteRpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${CFG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}` },
      body: JSON.stringify(args)
    });
  } catch { throw new Error('NETWORK'); }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || 'NETWORK');
  if (body && body.error) throw new Error(body.error);
  return body;
}

/* =========================================================
   API — Demo (localStorage) با همان رفتار سرور
   ========================================================= */
const demo = (() => {
  const SEED = [
    ['iPhone 13 Pro 256GB', 'Apple', 'ZAA • باتری ۹۲٪ • Grade A++ بدون بازشدگی', 54800000, 3],
    ['Samsung Galaxy S23 Ultra', 'Samsung', '256GB رم ۱۲ • در حد آکبند با کارتن', 49200000, 1],
    ['iPhone 11 128GB', 'Apple', 'LLA • باتری ۸۶٪ • تمیز و پلمپ', 26500000, 4],
    ['Xiaomi 13T Pro 512GB', 'Xiaomi', 'رم ۱۲ • دوربین لایکا • شارژر اصلی', 28900000, 2]
  ];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const db = () => {
    let d; try { d = JSON.parse(LS.get(KEY + '_db')); } catch {}
    if (!d) d = { products: SEED.map(([name, brand, specs, price, stock], i) => ({ id: uid(), name, brand, specs, price, stock, image: null, created_at: new Date(Date.now() - i * 1000).toISOString() })), partners: [], carts: [], orders: [], seq: 1000, pin: '1988' };
    return d;
  };
  const put = d => LS.set(KEY + '_db', JSON.stringify(d));
  const partner = (d, token) => { const p = d.partners.find(x => x.token === token); if (!p) throw new Error('NO_PARTNER'); return p; };
  const cart = (d, p) => d.carts.filter(c => c.partner === p.id).map(c => { const pr = d.products.find(x => x.id === c.product); return pr && { id: pr.id, name: pr.name, price: pr.price, image: pr.image, qty: c.qty, reserved_at: c.at }; }).filter(Boolean);
  const pjson = p => ({ first: p.first, last: p.last, shop: p.shop, phone: p.phone, address: p.address, token: p.token });
  const admin = (d, pin) => { if (pin !== d.pin) throw new Error('BAD_PIN'); };
  const sortP = l => l.slice().sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.created_at.localeCompare(a.created_at));
  const fns = {
    list_products: (d, { p_light }) => sortP(d.products).map(p => p_light ? { ...p, image: undefined } : p),
    create_guest: d => { const p = { id: uid(), token: uid(), guest: true, first: '', last: '', phone: '', address: '' }; d.partners.push(p); return { token: p.token }; },
    register_partner: (d, a) => {
      if (!/^09\d{9}$/.test(a.p_phone)) throw new Error('BAD_PHONE');
      const cur = a.p_token && d.partners.find(x => x.token === a.p_token);
      const other = d.partners.find(x => x.phone === a.p_phone && x !== cur);
      let p = cur;
      if (cur && other) { // شماره قبلاً ثبت شده: سبد منتقل می‌شود
        d.carts.forEach(c => { if (c.partner === cur.id) c.partner = other.id; });
        if (cur.guest) d.partners = d.partners.filter(x => x !== cur);
        p = other;
      } else if (!p) p = other;
      if (!p) { p = { id: uid(), token: uid() }; d.partners.push(p); }
      p.guest = false;
      Object.assign(p, { first: a.p_first.trim(), last: a.p_last.trim(), shop: (a.p_shop || '').trim(), phone: a.p_phone, address: a.p_address.trim() });
      return pjson(p);
    },
    get_cart: (d, { p_token }) => cart(d, partner(d, p_token)),
    cart_add: (d, { p_token, p_product, p_delta }) => {
      const p = partner(d, p_token), pr = d.products.find(x => x.id === p_product);
      let c = d.carts.find(x => x.partner === p.id && x.product === p_product);
      if (p_delta > 0) {
        if (!pr || pr.stock < p_delta) throw new Error('OUT_OF_STOCK');
        pr.stock -= p_delta;
        c ? (c.qty += p_delta, c.at = new Date().toISOString()) : d.carts.push({ partner: p.id, product: p_product, qty: p_delta, at: new Date().toISOString() });
      } else if (c) {
        const dl = Math.max(p_delta, -c.qty);
        if (pr) pr.stock -= dl;
        c.qty += dl; if (c.qty <= 0) d.carts = d.carts.filter(x => x !== c);
      }
      return cart(d, p);
    },
    checkout: (d, { p_token }) => {
      const p = partner(d, p_token);
      if (p.guest) throw new Error('NOT_REGISTERED');
      const items = cart(d, p).map(({ id, name, price, qty }) => ({ id, name, price, qty }));
      if (!items.length) throw new Error('EMPTY_CART');
      const o = { id: 'MT-' + (++d.seq), ts: new Date().toISOString(), partner_id: p.id, partner: { ...pjson(p), token: undefined }, items, total: items.reduce((s, i) => s + i.price * i.qty, 0), status: 'pending' };
      d.orders.unshift(o); d.carts = d.carts.filter(x => x.partner !== p.id);
      return { id: o.id, total: o.total };
    },
    my_orders: (d, { p_token }) => { const p = partner(d, p_token); return d.orders.filter(o => o.partner_id === p.id); },
    admin_login: (d, { p_pin }) => (admin(d, p_pin), { ok: true }),
    admin_data: (d, { p_pin }) => (admin(d, p_pin), {
      products: d.products.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(p => ({ ...p, image: undefined })), orders: d.orders, partners: d.partners.filter(x => !x.guest).length,
      reserved: d.carts.map(c => { const p = d.partners.find(x => x.id === c.partner), pr = d.products.find(x => x.id === c.product); return { partner: p ? p.first + ' ' + p.last : '', phone: p?.phone, name: pr?.name, qty: c.qty, at: c.at }; })
    }),
    admin_save_product: (d, { p_pin, p }) => {
      admin(d, p_pin);
      let r = p.id && d.products.find(x => x.id === p.id);
      if (r) Object.assign(r, p); else { r = { ...p, id: uid(), created_at: new Date().toISOString() }; d.products.push(r); }
      return r;
    },
    admin_adjust_stock: (d, { p_pin, p_id, p_delta }) => { admin(d, p_pin); const p = d.products.find(x => x.id === p_id); p.stock = Math.max(0, p.stock + p_delta); return { stock: p.stock }; },
    admin_delete_product: (d, { p_pin, p_id }) => { admin(d, p_pin); d.products = d.products.filter(x => x.id !== p_id); d.carts = d.carts.filter(x => x.product !== p_id); return { ok: true }; },
    admin_set_status: (d, { p_pin, p_id, p_status }) => {
      admin(d, p_pin); const o = d.orders.find(x => x.id === p_id); if (!o) throw new Error('NO_ORDER');
      const sgn = p_status === 'canceled' && o.status !== 'canceled' ? 1 : o.status === 'canceled' && p_status !== 'canceled' ? -1 : 0;
      o.items.forEach(i => { const p = d.products.find(x => x.id === i.id); if (p) p.stock = Math.max(0, p.stock + sgn * i.qty); });
      o.status = p_status; return { ok: true };
    },
    admin_change_pin: (d, { p_pin, p_new }) => { admin(d, p_pin); if (!/^\d{4,8}$/.test(p_new)) throw new Error('BAD_NEW_PIN'); d.pin = p_new; return { ok: true }; }
  };
  return {
    rpc: async (fn, args = {}) => {
      const d = db(); const r = fns[fn](d, args); put(d);
      return JSON.parse(JSON.stringify(r ?? null));
    },
    reset: () => LS.del(KEY + '_db')
  };
})();

const rpc = REMOTE ? remoteRpc : demo.rpc;

/* =========================================================
   State
   ========================================================= */
const S = {
  products: [], images: {}, cart: [], partner: null,
  admin: null // { products, orders, reserved, partners }
};
const ui = { view: 'shop', tab: 'dash', period: 'daily', filter: 'all', pin: '', pinMode: 'login', newPin: '', adminPin: SS.get(KEY + '_pin'), editId: null, image: null, loading: true, busy: new Set(), skipPop: 0 };
try { S.partner = JSON.parse(LS.get(KEY + '_partner')); } catch {}
S.guest = LS.get(KEY + '_guest'); // توکن مهمان (سبد قبل از ثبت‌نام)
const token = () => S.partner?.token || S.guest || null;
async function ensureToken() {
  if (token()) return token();
  const r = await rpc('create_guest');
  S.guest = r.token; LS.set(KEY + '_guest', S.guest);
  return S.guest;
}
function dropIdentity() { S.partner = null; S.guest = null; S.cart = []; LS.del(KEY + '_partner'); LS.del(KEY + '_guest'); }

/* =========================================================
   Helpers
   ========================================================= */
const $ = id => document.getElementById(id);
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const en = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const money = n => fa(Math.round(Number(n) || 0).toLocaleString('en-US'));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = n => {
  if (n >= 1e9) return fa((n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '')) + ' میلیارد';
  if (n >= 1e6) return fa(Math.round(n / 1e6)) + ' م';
  if (n > 0) return fa(Math.round(n / 1e3)) + ' ه';
  return '۰';
};
const ts = v => typeof v === 'number' ? v : Date.parse(v);
const jFmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
const jParts = t => { const p = jFmt.formatToParts(new Date(t)); const g = k => parseInt(p.find(x => x.type === k).value); return { y: g('year'), m: g('month'), d: g('day') }; };
const jDate = t => new Date(t).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }) + ' • ' + new Date(t).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
const ago = t => { const m = Math.round((Date.now() - ts(t)) / 60000); return m < 1 ? 'همین الان' : m < 60 ? fa(m) + ' دقیقه پیش' : fa(Math.round(m / 60)) + ' ساعت پیش'; };
const errMsg = e => ERRORS[e && e.message] || 'خطایی رخ داد؛ دوباره تلاش کنید';
const fullName = p => p ? `${p.first} ${p.last}` : '';
const imgOf = p => p.image || S.images[p.id] || null;
const phoneArt = (name, brand) => {
  const hue = { Apple: 210, Samsung: 225, Xiaomi: 25, Huawei: 0, Nokia: 200 }[brand] ?? 260;
  return `<div class="absolute inset-0 flex items-center justify-center" style="background:radial-gradient(circle at 30% 20%,hsla(${hue},90%,60%,.25),transparent 60%),linear-gradient(160deg,#111a2e,#070b14)">
    <div class="w-16 h-28 rounded-[18px] border-2 border-white/15 bg-gradient-to-b from-white/10 to-white/0 flex flex-col items-center pt-2 shadow-2xl"><span class="w-6 h-1.5 rounded-full bg-white/20"></span><i class="ph-duotone ph-device-mobile text-3xl text-white/30 mt-6"></i></div>
    <span class="absolute bottom-12 inset-x-4 text-center text-[11px] font-bold text-white/30 truncate" dir="auto">${esc(name)}</span></div>`;
};
const spin = '<i class="ph-bold ph-circle-notch animate-spin text-base"></i>';

function toast(msg, type = 'info') {
  const c = { success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100', error: 'bg-rose-950/95 border-rose-500/40 text-rose-100', info: 'bg-dark-800/95 border-sky-500/40 text-sky-100' }[type];
  const i = { success: 'ph-check-circle text-emerald-400', error: 'ph-warning-circle text-rose-400', info: 'ph-info text-sky-400' }[type];
  const el = document.createElement('div');
  el.className = `${c} border backdrop-blur-xl px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in`;
  el.innerHTML = `<i class="ph-fill ${i} text-lg shrink-0"></i><span>${esc(msg)}</span>`;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => { el.style.cssText = 'opacity:0;transform:translateY(-8px);transition:all .25s'; setTimeout(() => el.remove(), 250); }, 2800);
}
const openModals = () => document.querySelectorAll('.modal.open').length;
function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id, fromPop) {
  const m = $(id); if (!m.classList.contains('open')) return;
  m.classList.remove('open'); if (!openModals()) document.body.style.overflow = '';
}
function confirmBox(text, onOk) { $('confirm-text').textContent = text; $('confirm-ok').onclick = () => { closeModal('confirm-modal'); onOk(); }; openModal('confirm-modal'); }
async function withBusy(key, fn) {
  if (ui.busy.has(key)) return; ui.busy.add(key);
  try { return await fn(); } finally { ui.busy.delete(key); }
}

/* =========================================================
   Navigation
   ========================================================= */
function go(view) {
  if (view === 'admin' && !ui.adminPin) return openPin('login');
  ui.view = view;
  $('view-shop').classList.toggle('hidden', view !== 'shop');
  $('view-admin').classList.toggle('hidden', view !== 'admin');
  const on = 'bg-sky-500 text-white shadow-md', onA = 'bg-amber-500 text-dark-950 shadow-md', off = 'text-slate-400 hover:text-white';
  $('top-shop').className = `px-3 py-2 rounded-lg flex items-center gap-1.5 transition ${view === 'shop' ? on : off}`;
  $('top-admin').className = `px-3 py-2 rounded-lg flex items-center gap-1.5 transition ${view === 'admin' ? onA : off}`;
  $('nav-shop').className = `flex flex-col items-center gap-1 py-1 px-4 transition ${view === 'shop' ? 'text-sky-400' : 'text-slate-500'}`;
  $('nav-admin').className = `flex flex-col items-center gap-1 py-1 px-4 transition ${view === 'admin' ? 'text-amber-400' : 'text-slate-500'}`;
  $('subtitle').textContent = view === 'shop' ? 'فروش همکاری موبایل استوک' : 'پنل مدیریت و حسابداری';
  if (view === 'shop') { renderShop(); refreshProducts(); } else { renderAdmin(); refreshAdmin(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   Data loading & polling
   ========================================================= */
async function refreshProducts(full = false) {
  try {
    const needFull = full || !S.products.length;
    const list = await rpc('list_products', { p_light: !needFull });
    if (needFull) list.forEach(p => { S.images[p.id] = p.image || null; });
    // اگر گوشی جدیدی آمده که عکسش را نداریم، یک بار لیست کامل بگیر
    const unknown = !needFull && list.some(p => !(p.id in S.images) && !S.products.find(x => x.id === p.id));
    S.products = list.map(p => ({ ...p, image: undefined }));
    ui.loading = false;
    if (unknown) return refreshProducts(true);
    if (ui.view === 'shop') renderShop();
  } catch (e) {
    ui.loading = false;
    if (ui.view === 'shop') renderShop();
    if (e.message === 'NETWORK') setOffline(true);
  }
}
async function refreshCart() {
  if (!token()) { S.cart = []; return renderCart(); }
  try { S.cart = await rpc('get_cart', { p_token: token() }); renderCart(); }
  catch (e) { if (e.message === 'NO_PARTNER') { dropIdentity(); renderPartner(); renderCart(); } }
}
async function refreshAdmin(manual = false) {
  if (!ui.adminPin) return;
  const icon = $('admin-refresh-icon'); icon.classList.add('animate-spin');
  try {
    S.admin = await rpc('admin_data', { p_pin: ui.adminPin });
    if (S.admin.products.some(p => !(p.id in S.images))) await refreshProducts(true);
    renderAdmin(); if (manual) toast('اطلاعات به‌روز شد', 'success');
  } catch (e) {
    if (e.message === 'BAD_PIN' || e.message === 'LOCKED') { lockAdmin(true); toast('رمز مدیر تغییر کرده؛ دوباره وارد شوید', 'error'); }
    else if (manual) toast(errMsg(e), 'error');
  } finally { icon.classList.remove('animate-spin'); }
}
function setOffline(v) { $('offline').classList.toggle('hidden', !v); }
window.addEventListener('online', () => { setOffline(false); refreshProducts(); refreshCart(); });
window.addEventListener('offline', () => setOffline(true));
setInterval(() => {
  if (document.hidden) return;
  if (ui.view === 'shop') refreshProducts(); else refreshAdmin();
}, REMOTE ? 15000 : 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { ui.view === 'shop' ? refreshProducts() : refreshAdmin(); refreshCart(); } });

/* =========================================================
   Partner registration
   ========================================================= */
function renderPartner() {
  const p = S.partner;
  $('partner-card').innerHTML = p ? `
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500/30 to-indigo-600/30 border border-white/10 flex items-center justify-center shrink-0 font-black text-sky-300">${esc(p.first[0] || '؟')}</div>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="font-bold text-sm truncate">${esc(fullName(p))}${p.shop ? ` <span class="text-slate-400 font-normal">• ${esc(p.shop)}</span>` : ''}</h2>
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">همکار</span>
        </div>
        <p class="text-xs text-slate-400 truncate mt-0.5">${fa(esc(p.phone))} • ${esc(p.address)}</p>
      </div>
    </div>
    <div class="flex gap-1.5 shrink-0">
      <button onclick="openMyOrders()" aria-label="سفارش‌های من" class="h-10 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition"><i class="ph-bold ph-receipt text-base"></i><span class="hidden sm:inline">سفارش‌های من</span></button>
      <button onclick="openRegister(true)" aria-label="ویرایش" class="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sky-400 flex items-center justify-center transition"><i class="ph-bold ph-pencil-simple text-base"></i></button>
    </div>` : `
    <div class="flex items-center gap-3"><i class="ph-duotone ph-handshake text-3xl text-sky-400"></i><div><b class="text-sm block">همکار عزیز، خوش آمدید</b><span class="text-[11px] text-slate-400">گوشی را به سبد اضافه کنید؛ ثبت‌نام هنگام ثبت سفارش</span></div></div>
    <button onclick="openRegister()" class="px-4 py-2.5 rounded-xl bg-sky-500 text-xs font-bold shrink-0">ثبت‌نام</button>`;
}
function openRegister(editing = false) {
  const p = S.partner || {};
  $('r-first').value = p.first || ''; $('r-last').value = p.last || ''; $('r-shop').value = p.shop || '';
  $('r-phone').value = p.phone || ''; $('r-address').value = p.address || ''; $('r-phone-err').textContent = '';
  $('reg-title').textContent = editing ? 'ویرایش مشخصات همکار' : ui.afterRegister ? 'یک قدم تا ثبت سفارش' : 'ثبت‌نام همکار';
  $('reg-sub').textContent = ui.afterRegister ? 'برای صدور فاکتور، فقط یک بار مشخصات خود را وارد کنید' : 'مشخصات شما برای صدور فاکتور استفاده می‌شود';
  $('reg-submit').textContent = editing ? 'ذخیره تغییرات' : ui.afterRegister ? 'ثبت‌نام و ثبت نهایی سفارش' : 'ثبت‌نام';
  openModal('reg-modal');
}
async function saveProfile(e) {
  e.preventDefault();
  const phone = en($('r-phone').value).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(phone)) { $('r-phone-err').textContent = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود'; return; }
  const btn = $('reg-submit'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = spin;
  try {
    const isNew = !S.partner;
    S.partner = await rpc('register_partner', { p_first: $('r-first').value.trim(), p_last: $('r-last').value.trim(), p_shop: $('r-shop').value.trim(), p_phone: phone, p_address: $('r-address').value.trim(), p_token: token() });
    LS.set(KEY + '_partner', JSON.stringify(S.partner));
    S.guest = null; LS.del(KEY + '_guest');
    renderPartner(); closeModal('reg-modal');
    await refreshCart(); renderShop();
    if (ui.afterRegister) { ui.afterRegister = false; checkout(); }
    else toast(isNew ? `${S.partner.first} عزیز، خوش آمدید!` : 'مشخصات به‌روز شد', 'success');
  } catch (err) { toast(errMsg(err), 'error'); }
  finally { btn.disabled = false; btn.innerHTML = label; }
}
async function openMyOrders() {
  $('myorders').innerHTML = `<div class="py-10 text-center text-slate-400">${spin}</div>`; openModal('myorders-modal');
  try {
    const list = await rpc('my_orders', { p_token: S.partner.token });
    $('myorders').innerHTML = !list.length ? '<p class="text-center text-xs text-slate-400 py-10">هنوز سفارشی ثبت نکرده‌اید</p>' : list.map(o => `
      <div class="bg-white/[.04] rounded-2xl p-3.5 space-y-2 border-r-4 ${STATUS[o.status].b}">
        <div class="flex items-center justify-between"><b class="text-amber-400 text-sm">${fa(o.id)}</b><span class="text-[10px] px-2 py-1 rounded-lg border font-bold ${STATUS[o.status].c}">${STATUS[o.status].t}</span></div>
        <p class="text-[11px] text-slate-400">${jDate(o.ts)}</p>
        ${o.items.map(i => `<div class="flex justify-between text-xs"><span dir="auto">${esc(i.name)} <b class="text-sky-400">×${fa(i.qty)}</b></span><span class="text-slate-400">${money(i.price * i.qty)}</span></div>`).join('')}
        <div class="flex justify-between text-sm pt-1 border-t border-white/5"><span class="text-slate-400 text-xs">جمع</span><b class="text-emerald-400">${money(o.total)} تومان</b></div>
      </div>`).join('');
  } catch (e) { $('myorders').innerHTML = `<p class="text-center text-xs text-rose-400 py-10">${esc(errMsg(e))}</p>`; }
}

/* =========================================================
   Shop
   ========================================================= */
function renderChips() {
  const opts = [['all', 'همه'], ['available', 'فقط موجودها'], ...Object.entries(BRANDS).filter(([k]) => S.products.some(p => p.brand === k))];
  $('chips').innerHTML = opts.map(([k, t]) => `
    <button onclick="ui.filter='${k}';renderShop()" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${ui.filter === k ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25' : 'bg-dark-800 text-slate-300 border border-white/10 hover:border-white/25'}">
      ${k === 'available' ? '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>' : ''}${t}
    </button>`).join('');
}
function renderShop() {
  renderPartner(); renderChips();
  if (ui.loading) {
    $('shop-count').textContent = '';
    $('grid').innerHTML = Array.from({ length: 6 }, () => `<div class="glass rounded-3xl overflow-hidden"><div class="h-52 skeleton"></div><div class="p-4 space-y-3"><div class="h-4 w-2/3 rounded skeleton"></div><div class="h-3 w-full rounded skeleton"></div><div class="h-10 rounded-xl skeleton mt-4"></div></div></div>`).join('');
    return;
  }
  const q = en($('search').value).trim().toLowerCase();
  const list = S.products.filter(p => {
    const hay = `${p.name} ${p.specs} ${p.brand} ${BRANDS[p.brand] || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (ui.filter === 'available') return p.stock > 0;
    if (ui.filter !== 'all') return p.brand === ui.filter;
    return true;
  });
  const units = list.reduce((s, p) => s + p.stock, 0);
  $('shop-count').textContent = `${fa(list.length)} مدل • ${fa(units)} دستگاه`;
  $('shop-empty').classList.toggle('hidden', list.length > 0);

  $('grid').innerHTML = list.map((p, i) => {
    const ok = p.stock > 0;
    const inCart = S.cart.find(c => c.id === p.id)?.qty || 0;
    const img = imgOf(p);
    const badge = !ok ? `<span class="px-2.5 py-1 rounded-lg bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold">ناموجود</span>`
      : p.stock === 1 ? `<span class="px-2.5 py-1 rounded-lg bg-amber-500/25 border border-amber-500/30 text-amber-200 text-[11px] font-bold pulse">فقط ۱ عدد مانده!</span>`
      : `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">موجود: ${fa(p.stock)} عدد</span>`;
    return `
    <article class="card glass rounded-3xl overflow-hidden flex flex-col ${ok ? '' : 'opacity-60 grayscale-[.6]'}">
      <div class="relative h-52 bg-dark-900 overflow-hidden">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" decoding="async" class="w-full h-full object-cover">` : phoneArt(p.name, p.brand)}
        <div class="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-black/30"></div>
        <span class="absolute top-3 right-3 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-bold">${BRANDS[p.brand] || esc(p.brand)}</span>
        ${inCart ? `<span class="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-sky-500 text-[11px] font-bold shadow-lg flex items-center gap-1"><i class="ph-fill ph-shopping-bag"></i>${fa(inCart)} در سبد</span>` : ''}
        <div class="absolute bottom-3 right-3">${badge}</div>
      </div>
      <div class="p-4 pb-2 space-y-1.5 flex-1">
        <h3 class="font-extrabold text-base tracking-tight" dir="auto">${esc(p.name)}</h3>
        <p class="text-xs text-slate-400 leading-relaxed line-clamp-2">${esc(p.specs) || '&nbsp;'}</p>
      </div>
      <div class="p-4 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
        <div>
          <span class="block text-[10px] text-slate-400">قیمت همکاری</span>
          <span class="font-black text-lg text-sky-400">${money(p.price)}</span> <span class="text-[10px] text-slate-400">تومان</span>
        </div>
        ${ok ? `<button onclick="buy('${p.id}', this)" class="min-w-[92px] px-4 py-3 rounded-xl bg-gradient-to-l from-sky-500 to-indigo-600 hover:brightness-110 text-xs font-bold shadow-lg shadow-sky-500/25 active:scale-90 transition flex items-center justify-center gap-1.5 shrink-0"><i class="ph-bold ph-lightning text-base"></i>خرید</button>`
             : `<button disabled class="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-500 text-xs font-bold cursor-not-allowed">فروخته شد</button>`}
      </div>
    </article>`;
  }).join('');
}

/* ---------- One-click buy ---------- */
function buy(id, btn) {
  return withBusy('buy' + id, async () => {
    if (btn) { btn.disabled = true; btn.innerHTML = spin; }
    try {
      const t = await ensureToken();
      S.cart = await rpc('cart_add', { p_token: t, p_product: id, p_delta: 1 });
      const p = S.products.find(x => x.id === id); if (p) p.stock = Math.max(0, p.stock - 1);
      renderShop(); renderCart(); bumpBadge();
      if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
      toast(`${p ? p.name : 'گوشی'} به سبد اضافه شد`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
      if (e.message === 'NO_PARTNER') { dropIdentity(); renderPartner(); renderCart(); toast('دوباره روی خرید بزنید', 'info'); }
    }
    refreshProducts();
  });
}
function bumpBadge() { document.querySelectorAll('.cart-badge').forEach(b => { b.classList.remove('animate-pop'); void b.offsetWidth; b.classList.add('animate-pop'); }); }

/* =========================================================
   Cart
   ========================================================= */
function renderCart() {
  const qty = S.cart.reduce((s, c) => s + c.qty, 0);
  const total = S.cart.reduce((s, c) => s + c.qty * c.price, 0);
  document.querySelectorAll('.cart-badge').forEach(b => { b.textContent = fa(qty); b.classList.toggle('hidden', !qty); });
  $('cart-total').textContent = money(total);
  $('cart-footer').classList.toggle('hidden', !S.cart.length);
  $('cart-sub').textContent = S.cart.length ? 'گوشی‌ها تا ۲ ساعت برای شما رزرو هستند' : 'سبد خرید همکاری';
  const p = S.partner;
  $('cart-partner').innerHTML = p ? `
    <div class="flex justify-between"><span class="text-slate-400">خریدار:</span><b>${esc(fullName(p))}</b></div>
    <div class="flex justify-between"><span class="text-slate-400">موبایل:</span><span dir="ltr">${fa(esc(p.phone))}</span></div>
    <p class="text-[11px] text-slate-400 truncate pt-1 border-t border-white/5">${esc(p.address)}</p>` :
    `<p class="flex items-center gap-2 text-slate-300"><i class="ph-duotone ph-identification-card text-lg text-sky-400"></i>برای ثبت نهایی، فقط یک بار نام، شماره و آدرس را وارد می‌کنید.</p>`;
  const cl = $('checkout-label'); if (cl) cl.textContent = p ? 'ثبت نهایی سفارش' : 'ادامه و ثبت سفارش';
  $('cart-items').innerHTML = !S.cart.length ? `
    <div class="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
      <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-slate-500"><i class="ph-duotone ph-shopping-bag-open text-4xl"></i></div>
      <h4 class="font-bold text-slate-300">سبد خرید خالی است</h4>
      <p class="text-xs text-slate-500 leading-6">با زدن دکمه «خرید» روی هر گوشی، فوراً برای شما رزرو می‌شود.</p>
      <button onclick="closeModal('cart-modal');go('shop')" class="px-4 py-2 rounded-xl bg-sky-500/15 text-sky-400 text-xs font-bold">مشاهده ویترین</button>
    </div>` : S.cart.map(c => {
      const img = c.image || S.images[c.id];
      return `
    <div class="glass rounded-2xl p-3 flex items-center gap-3">
      <div class="relative w-16 h-16 rounded-xl overflow-hidden bg-dark-950 shrink-0">${img ? `<img src="${esc(img)}" alt="" class="w-full h-full object-cover">` : '<i class="ph-duotone ph-device-mobile text-3xl text-slate-600 absolute inset-0 m-auto w-fit h-fit"></i>'}</div>
      <div class="flex-1 min-w-0">
        <h4 class="font-bold text-sm truncate" dir="auto">${esc(c.name)}</h4>
        <p class="text-xs text-sky-400 font-bold mt-1">${money(c.price * c.qty)} <span class="text-[10px] text-slate-400 font-normal">تومان</span></p>
        <div class="flex items-center gap-2 mt-2">
          <button onclick="cartQty('${c.id}',1)" class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold">+</button>
          <span class="text-sm px-1 font-black">${fa(c.qty)}</span>
          <button onclick="cartQty('${c.id}',-1)" class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold">−</button>
        </div>
      </div>
      <button onclick="cartQty('${c.id}',-${c.qty})" aria-label="حذف" class="w-9 h-9 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0"><i class="ph-bold ph-trash"></i></button>
    </div>`; }).join('');
}
function cartQty(id, d) {
  return withBusy('cart' + id, async () => {
    try {
      S.cart = await rpc('cart_add', { p_token: token(), p_product: id, p_delta: d });
      const p = S.products.find(x => x.id === id); if (p) p.stock = Math.max(0, p.stock - d);
      renderCart(); renderShop();
      if (d < -1 || !S.cart.find(c => c.id === id)) toast('از سبد حذف شد و به انبار برگشت', 'info');
    } catch (e) { toast(errMsg(e), 'error'); }
    refreshProducts();
  });
}
function openCart() { renderCart(); openModal('cart-modal'); refreshCart(); }
function checkout() {
  if (!S.cart.length) return;
  // ثبت‌نام فقط وقتی لازم است که همکار می‌خواهد سفارش را نهایی کند
  if (!S.partner) { ui.afterRegister = true; closeModal('cart-modal'); return setTimeout(() => openRegister(), 50); }
  return withBusy('checkout', async () => {
    const btn = $('checkout-btn'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = spin + ' در حال ثبت...';
    try {
      const r = await rpc('checkout', { p_token: S.partner.token });
      S.cart = []; renderCart(); renderShop(); closeModal('cart-modal');
      $('success-id').textContent = fa(r.id); openModal('success-modal');
    } catch (e) {
      if (e.message === 'NOT_REGISTERED') { dropIdentity(); renderPartner(); }
      toast(errMsg(e), 'error'); refreshCart();
    }
    finally { btn.disabled = false; btn.innerHTML = label; }
  });
}

/* =========================================================
   Admin PIN
   ========================================================= */
function openPin(mode) {
  ui.pinMode = mode; ui.pin = ''; ui.newPin = ''; $('pin-err').textContent = '';
  $('pin-title').textContent = mode === 'login' ? 'ورود مدیر' : 'تغییر رمز مدیر';
  $('pin-sub').textContent = mode === 'login' ? 'رمز را وارد کنید' : 'رمز جدید ۴ رقمی را وارد کنید';
  drawPin(); openModal('pin-modal');
}
function drawPin() {
  $('pin-dots').innerHTML = [0, 1, 2, 3].map(i => `<span class="w-4 h-4 rounded-full transition-all duration-200 ${i < ui.pin.length ? 'bg-amber-400 scale-125 shadow-lg shadow-amber-400/50' : 'bg-slate-700'}"></span>`).join('');
}
function pinKey(k) {
  if (ui.busy.has('pin')) return;
  if (k === 'del') ui.pin = ui.pin.slice(0, -1);
  else if (ui.pin.length < 4) ui.pin += k;
  $('pin-err').textContent = ''; drawPin();
  if (ui.pin.length === 4) setTimeout(submitPin, 150);
}
function pinFail(msg) {
  const c = $('pin-card'); c.classList.remove('animate-shake'); void c.offsetWidth; c.classList.add('animate-shake');
  if (navigator.vibrate) try { navigator.vibrate([40, 40, 40]); } catch {}
  $('pin-err').textContent = msg; ui.pin = ''; drawPin();
}
function submitPin() {
  return withBusy('pin', async () => {
    if (ui.pinMode === 'change') {
      if (!ui.newPin) { ui.newPin = ui.pin; ui.pin = ''; $('pin-sub').textContent = 'رمز جدید را تکرار کنید'; return drawPin(); }
      if (ui.newPin !== ui.pin) { ui.newPin = ''; $('pin-sub').textContent = 'رمز جدید ۴ رقمی را وارد کنید'; return pinFail('تکرار رمز یکسان نبود'); }
      try {
        await rpc('admin_change_pin', { p_pin: ui.adminPin, p_new: ui.pin });
        ui.adminPin = ui.pin; SS.set(KEY + '_pin', ui.pin); closeModal('pin-modal'); toast('رمز مدیر تغییر کرد', 'success');
      } catch (e) { pinFail(errMsg(e)); }
      return;
    }
    $('pin-err').innerHTML = `<span class="text-slate-400">${spin}</span>`;
    try {
      await rpc('admin_login', { p_pin: ui.pin });
      ui.adminPin = ui.pin; SS.set(KEY + '_pin', ui.pin);
      closeModal('pin-modal'); updateAdminIcon(); toast('خوش آمدید مجید جان! پنل مدیریت باز شد', 'success'); go('admin');
    } catch (e) { pinFail(errMsg(e)); }
  });
}
function changePin() { openPin('change'); }
function lockAdmin(silent) {
  ui.adminPin = null; S.admin = null; SS.del(KEY + '_pin'); updateAdminIcon(); go('shop');
  if (!silent) toast('از پنل مدیریت خارج شدید', 'info');
}
function updateAdminIcon() { document.querySelectorAll('.admin-icon').forEach(i => { i.classList.toggle('ph-lock-key', !ui.adminPin); i.classList.toggle('ph-chart-pie-slice', !!ui.adminPin); }); }
const adminCall = (fn, args) => rpc(fn, { p_pin: ui.adminPin, ...args });

/* =========================================================
   Admin views
   ========================================================= */
function openTab(t) {
  ui.tab = t;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + t));
  renderAdmin();
}
function renderAdmin() {
  const h = new Date().getHours();
  $('admin-greet').textContent = (h < 12 ? 'صبح بخیر' : h < 17 ? 'روز بخیر' : 'عصر بخیر') + ' • ' + new Date().toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });
  const A = S.admin;
  if (!A) { $('kpis').innerHTML = Array.from({ length: 4 }, () => '<div class="glass rounded-2xl h-28 skeleton"></div>').join(''); return; }
  const pend = A.orders.filter(o => o.status === 'pending').length;
  $('pending-dot').innerHTML = pend ? `<span class="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">${fa(pend)}</span>` : '';
  if (ui.tab === 'dash') { renderKpis(); renderChart(); renderReserved(); renderTops(); }
  if (ui.tab === 'orders') renderOrders();
  if (ui.tab === 'stock') renderStock();
}

/* ---------- Accounting ---------- */
const sold = () => (S.admin?.orders || []).filter(o => o.status !== 'canceled').map(o => (o._j ||= jParts(ts(o.ts)), o));
const units = o => o.items.reduce((s, i) => s + i.qty, 0);
function renderKpis() {
  const t = jParts(Date.now());
  const sum = f => { const l = sold().filter(o => f(o._j)); return { a: l.reduce((s, o) => s + Number(o.total), 0), u: l.reduce((s, o) => s + units(o), 0), n: l.length }; };
  const d = sum(j => j.y === t.y && j.m === t.m && j.d === t.d);
  const m = sum(j => j.y === t.y && j.m === t.m);
  const y = sum(j => j.y === t.y);
  const stockVal = S.admin.products.reduce((s, p) => s + p.price * p.stock, 0);
  const stockU = S.admin.products.reduce((s, p) => s + p.stock, 0);
  const debt = S.admin.orders.filter(o => o.status === 'pending').reduce((s, o) => s + Number(o.total), 0);
  const card = (title, icon, color, amount, sub) => `
    <div class="glass rounded-2xl p-4 space-y-2 relative overflow-hidden">
      <div class="absolute -left-6 -top-6 w-20 h-20 rounded-full kpi-glow-${color} blur-xl"></div>
      <div class="flex items-center justify-between text-xs text-slate-400"><span>${title}</span><span class="w-8 h-8 rounded-xl kpi-${color} flex items-center justify-center"><i class="ph-duotone ${icon} text-lg"></i></span></div>
      <p class="text-lg sm:text-xl font-black leading-tight">${money(amount)} <span class="text-[10px] font-normal text-slate-400">تومان</span></p>
      <p class="text-[11px] kpi-text-${color} font-semibold">${sub}</p>
    </div>`;
  $('kpis').innerHTML =
    card('فروش امروز', 'ph-sun', 'emerald', d.a, `${fa(d.u)} دستگاه • ${fa(d.n)} فاکتور`) +
    card(`فروش ${FA_MONTHS[t.m - 1]}`, 'ph-calendar', 'sky', m.a, `${fa(m.u)} دستگاه • ${fa(m.n)} فاکتور`) +
    card(`فروش سال ${fa(t.y)}`, 'ph-trend-up', 'amber', y.a, `${fa(y.u)} دستگاه • ${fa(y.n)} فاکتور`) +
    card('ارزش انبار', 'ph-vault', 'indigo', stockVal, `${fa(stockU)} دستگاه • طلب: ${short(debt)}`);
}
function renderChart() {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === ui.period));
  const orders = sold(), now = Date.now(), t = jParts(now);
  const total = f => orders.filter(o => f(o._j)).reduce((s, o) => s + Number(o.total), 0);
  let bars = [];
  if (ui.period === 'daily') {
    $('chart-sub').textContent = 'فروش ۷ روز اخیر';
    for (let i = 6; i >= 0; i--) { const tt = now - i * 864e5, j = jParts(tt); bars.push({ l: i === 0 ? 'امروز' : new Date(tt).toLocaleDateString('fa-IR', { weekday: 'short' }), v: total(o => o.y === j.y && o.m === j.m && o.d === j.d) }); }
  } else if (ui.period === 'monthly') {
    $('chart-sub').textContent = 'فروش ۶ ماه اخیر (شمسی)';
    for (let i = 5; i >= 0; i--) { let m = t.m - i, y = t.y; while (m < 1) { m += 12; y--; } bars.push({ l: FA_MONTHS[m - 1], v: total(o => o.y === y && o.m === m) }); }
  } else {
    $('chart-sub').textContent = 'فروش ۴ سال اخیر';
    for (let i = 3; i >= 0; i--) { const y = t.y - i; bars.push({ l: fa(y), v: total(o => o.y === y) }); }
  }
  const max = Math.max(...bars.map(b => b.v), 1), sum = bars.reduce((s, b) => s + b.v, 0);
  $('chart').innerHTML = `
    <div class="flex items-baseline gap-2 mb-2"><span class="text-2xl font-black">${money(sum)}</span><span class="text-xs text-slate-400">تومان در این بازه</span></div>
    <div class="flex items-end gap-2 sm:gap-4 h-48 pt-4" dir="ltr">
      ${bars.map((b, i) => `
        <div class="flex-1 flex flex-col items-center h-full justify-end group">
          <span class="text-[10px] font-bold mb-1.5 ${b.v ? 'text-slate-200' : 'text-slate-600'}">${short(b.v)}</span>
          <div class="w-full max-w-[44px] flex-1 flex items-end rounded-xl bg-dark-950/70 border border-white/5 p-0.5">
            <div class="bar animate-grow w-full rounded-lg ${i === bars.length - 1 ? 'bg-gradient-to-t from-emerald-600 via-emerald-400 to-sky-400 shadow-lg shadow-emerald-500/30' : 'bg-gradient-to-t from-sky-700 to-sky-400/80'} group-hover:brightness-125 transition" style="height:${b.v ? Math.max(6, b.v / max * 100) : 2}%;animation-delay:${i * 60}ms"></div>
          </div>
          <span class="text-[11px] text-slate-400 mt-2 truncate max-w-full">${b.l}</span>
        </div>`).join('')}
    </div>`;
}
function renderReserved() {
  const r = S.admin.reserved || [];
  $('reserved-box').classList.toggle('hidden', !r.length);
  $('reserved').innerHTML = r.map(x => `
    <div class="flex items-center justify-between gap-2 text-xs p-2.5 rounded-xl bg-white/[.03]">
      <span class="min-w-0 truncate"><b dir="auto">${esc(x.name)}</b> <span class="text-sky-400">×${fa(x.qty)}</span> — ${esc(x.partner)}</span>
      <span class="text-[10px] text-slate-400 shrink-0">${ago(x.at)}</span>
    </div>`).join('');
}
function renderTops() {
  const pm = {}, cm = {};
  sold().forEach(o => {
    o.items.forEach(i => { pm[i.name] = pm[i.name] || { q: 0, a: 0 }; pm[i.name].q += i.qty; pm[i.name].a += i.qty * i.price; });
    const k = o.partner.phone; cm[k] = cm[k] || { n: fullName(o.partner), q: 0, a: 0 }; cm[k].q++; cm[k].a += Number(o.total);
  });
  const row = (i, title, sub, amount) => `
    <div class="flex items-center gap-3 p-2.5 rounded-xl bg-white/[.03]">
      <span class="w-7 h-7 rounded-lg ${['bg-amber-500/20 text-amber-300', 'bg-slate-400/20 text-slate-200', 'bg-orange-700/30 text-orange-300'][i] || 'bg-white/5 text-slate-400'} text-xs font-black flex items-center justify-center">${fa(i + 1)}</span>
      <div class="flex-1 min-w-0"><p class="text-xs font-bold truncate" dir="auto">${esc(title)}</p><p class="text-[10px] text-slate-400">${sub}</p></div>
      <span class="text-xs font-bold text-emerald-400">${short(amount)}</span>
    </div>`;
  const empty = '<p class="text-xs text-slate-500 text-center py-6">هنوز فروشی ثبت نشده</p>';
  const tp = Object.entries(pm).sort((a, b) => b[1].q - a[1].q).slice(0, 5);
  const tc = Object.values(cm).sort((a, b) => b.a - a.a).slice(0, 5);
  $('top-products').innerHTML = tp.length ? tp.map(([n, v], i) => row(i, n, `${fa(v.q)} دستگاه`, v.a)).join('') : empty;
  $('top-partners').innerHTML = tc.length ? tc.map((v, i) => row(i, v.n, `${fa(v.q)} فاکتور`, v.a)).join('') : empty;
}

/* ---------- Orders ---------- */
function renderOrders() {
  if (!S.admin) return;
  const f = $('order-filter').value;
  const list = S.admin.orders.filter(o => f === 'all' || o.status === f);
  $('orders-count').textContent = fa(S.admin.orders.length);
  $('orders').innerHTML = !list.length ? `<div class="glass rounded-3xl p-10 text-center space-y-2"><i class="ph-duotone ph-receipt text-4xl text-slate-500"></i><p class="text-xs text-slate-400">فاکتوری وجود ندارد</p></div>` :
  list.map(o => { const st = STATUS[o.status]; return `
    <div class="glass rounded-2xl p-4 space-y-3 border-r-4 ${st.b}">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div><span class="text-sm font-black text-amber-400">${fa(o.id)}</span><span class="text-[11px] text-slate-400 mr-2">${jDate(ts(o.ts))}</span></div>
        <select onchange="setStatus('${o.id}',this.value)" class="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold bg-dark-950 focus:outline-none ${st.c}">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.t}</option>`).join('')}
        </select>
      </div>
      <div class="flex items-start justify-between gap-2 text-xs">
        <div class="space-y-1 min-w-0">
          <p class="font-bold">${esc(fullName(o.partner))}${o.partner.shop ? ` <span class="text-slate-400 font-normal">• ${esc(o.partner.shop)}</span>` : ''}</p>
          <p class="text-[11px] text-slate-400">${esc(o.partner.address)}</p>
        </div>
        <a href="tel:${esc(o.partner.phone)}" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold flex items-center gap-1" dir="ltr"><i class="ph-fill ph-phone"></i>${fa(esc(o.partner.phone))}</a>
      </div>
      <div class="bg-dark-950/60 rounded-xl p-2.5 space-y-1.5">
        ${o.items.map(i => `<div class="flex items-center justify-between text-xs"><span class="text-slate-300" dir="auto">${esc(i.name)} <b class="text-sky-400">×${fa(i.qty)}</b></span><span class="text-slate-400">${money(i.price * i.qty)}</span></div>`).join('')}
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-400">جمع فاکتور</span>
        <span class="font-black text-emerald-400">${money(o.total)} <span class="text-[10px] text-slate-400 font-normal">تومان</span></span>
      </div>
    </div>`; }).join('');
}
async function setStatus(id, status) {
  try {
    await adminCall('admin_set_status', { p_id: id, p_status: status });
    toast(`فاکتور ${fa(id)}: ${STATUS[status].t}${status === 'canceled' ? ' — موجودی برگشت' : ''}`, 'info');
  } catch (e) { toast(errMsg(e), 'error'); }
  refreshAdmin();
}

/* ---------- Product form ---------- */
function formatPriceInput(el) {
  const v = en(el.value).replace(/\D/g, '').slice(0, 12);
  el.value = v ? Number(v).toLocaleString('en-US') : '';
  $('f-price-words').textContent = v ? short(Number(v)) + ' تومان' : '';
}
function stepStock(d) { const el = $('f-stock'); el.value = Math.max(0, Math.min(999, (+el.value || 0) + d)); }
function showImage(src) {
  $('img-box').innerHTML = src ? `<img src="${src}" alt="" class="absolute inset-0 w-full h-full object-cover"><span class="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/70 text-[11px] font-bold flex items-center gap-1"><i class="ph-bold ph-arrows-clockwise"></i>تغییر عکس</span>`
    : `<i class="ph-duotone ph-camera-plus text-4xl text-sky-400"></i><span class="text-xs font-semibold">عکس گوشی را از گالری یا دوربین انتخاب کنید</span><span class="text-[10px] text-slate-500">اختیاری — خودکار فشرده می‌شود</span>`;
}
// فشرده‌سازی عکس (حداکثر ۷۰۰ پیکسل) برای سرعت و حجم کم
function pickImage(e) {
  const file = e.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const max = 700, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    ui.image = c.toDataURL('image/webp', .74);
    if (!ui.image.startsWith('data:image/webp')) ui.image = c.toDataURL('image/jpeg', .74);
    URL.revokeObjectURL(url); showImage(ui.image);
  };
  img.onerror = () => toast('این فایل تصویر قابل خواندن نیست', 'error');
  img.src = url; e.target.value = '';
}
function resetForm() {
  ui.editId = null; ui.image = null; $('product-form').reset(); $('f-stock').value = 1; $('f-price-words').textContent = '';
  showImage(null); $('form-title').textContent = 'تعریف گوشی جدید'; $('submit-label').textContent = 'ثبت و انتشار در ویترین'; $('cancel-edit').classList.add('hidden');
}
function editProduct(id) {
  const p = S.admin.products.find(x => x.id === id); if (!p) return;
  openTab('add'); ui.editId = id; ui.image = S.images[id] || null;
  $('f-name').value = p.name; $('f-brand').value = p.brand; $('f-specs').value = p.specs;
  $('f-price').value = Number(p.price).toLocaleString('en-US'); $('f-price-words').textContent = short(p.price) + ' تومان'; $('f-stock').value = p.stock;
  showImage(ui.image); $('form-title').textContent = 'ویرایش گوشی'; $('submit-label').textContent = 'ذخیره تغییرات'; $('cancel-edit').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function saveProduct(e) {
  e.preventDefault();
  return withBusy('product', async () => {
    const price = Number(en($('f-price').value).replace(/\D/g, ''));
    if (!price) return toast('قیمت را وارد کنید', 'error');
    const data = { id: ui.editId, name: $('f-name').value.trim(), brand: $('f-brand').value, specs: $('f-specs').value.trim(), price, stock: Math.max(0, +$('f-stock').value || 0), image: ui.image };
    const btn = $('product-submit'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = spin + ' در حال ذخیره...';
    try {
      const r = await adminCall('admin_save_product', { p: data });
      S.images[r.id] = r.image || null;
      toast(ui.editId ? 'تغییرات ذخیره شد' : `${data.name} در ویترین منتشر شد`, 'success');
      resetForm(); await refreshAdmin(); openTab('stock'); refreshProducts(true);
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  });
}

/* ---------- Stock ---------- */
function renderStock() {
  const list = S.admin.products;
  $('stock-count').textContent = fa(list.length);
  $('partners-count').textContent = `${fa(S.admin.partners)} همکار ثبت‌نام کرده‌اند • حالت: ${REMOTE ? 'آنلاین (سرور)' : 'دمو (فقط همین مرورگر)'}`;
  $('stock-list').innerHTML = !list.length ? `<div class="glass rounded-3xl p-10 text-center text-xs text-slate-400">انبار خالی است؛ اولین گوشی را تعریف کنید</div>` :
  list.map(p => { const img = S.images[p.id]; return `
    <div class="glass rounded-2xl p-3 flex items-center justify-between gap-3">
      <button onclick="editProduct('${p.id}')" class="flex items-center gap-3 min-w-0 text-right">
        <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-dark-950 shrink-0">${img ? `<img src="${esc(img)}" alt="" class="w-full h-full object-cover">` : '<i class="ph-duotone ph-device-mobile text-2xl text-slate-600 absolute inset-0 m-auto w-fit h-fit"></i>'}</div>
        <div class="min-w-0">
          <h4 class="font-bold text-sm truncate" dir="auto">${esc(p.name)}</h4>
          <p class="text-[11px] text-sky-400 font-semibold mt-0.5">${money(p.price)} تومان <i class="ph ph-pencil-simple text-slate-500"></i></p>
        </div>
      </button>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="adjStock('${p.id}',1)" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 font-bold">+</button>
        <span class="min-w-[30px] text-center text-sm font-black ${p.stock ? 'text-emerald-400' : 'text-rose-400'}">${fa(p.stock)}</span>
        <button onclick="adjStock('${p.id}',-1)" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 font-bold">−</button>
        <button onclick="delProduct('${p.id}')" aria-label="حذف" class="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 mr-1 flex items-center justify-center"><i class="ph-bold ph-trash"></i></button>
      </div>
    </div>`; }).join('');
}
async function adjStock(id, d) {
  const p = S.admin.products.find(x => x.id === id); if (!p || (d < 0 && !p.stock)) return;
  p.stock = Math.max(0, p.stock + d); renderStock();
  try { const r = await adminCall('admin_adjust_stock', { p_id: id, p_delta: d }); p.stock = r.stock; renderStock(); }
  catch (e) { toast(errMsg(e), 'error'); refreshAdmin(); }
}
function delProduct(id) {
  const p = S.admin.products.find(x => x.id === id);
  confirmBox(`«${p.name}» از انبار و ویترین حذف شود؟`, async () => {
    try { await adminCall('admin_delete_product', { p_id: id }); toast('حذف شد', 'info'); }
    catch (e) { toast(errMsg(e), 'error'); }
    refreshAdmin(); refreshProducts();
  });
}
// خروجی CSV (در اکسل باز می‌شود)
function exportData() {
  const rows = [['شماره فاکتور', 'تاریخ', 'همکار', 'فروشگاه', 'موبایل', 'آدرس', 'اقلام', 'تعداد', 'مبلغ (تومان)', 'وضعیت']];
  S.admin.orders.forEach(o => rows.push([o.id, new Date(ts(o.ts)).toLocaleString('fa-IR'), fullName(o.partner), o.partner.shop || '', o.partner.phone, o.partner.address,
    o.items.map(i => `${i.name} ×${i.qty}`).join(' | '), units(o), o.total, STATUS[o.status].t]));
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); const j = jParts(Date.now());
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `majidtel-orders-${j.y}-${j.m}-${j.d}.csv`; a.click();
}
function resetDemo() { confirmBox('همه داده‌های دمو پاک و به حالت اولیه برگردد؟', () => { demo.reset(); LS.del(KEY + '_partner'); location.reload(); }); }

/* =========================================================
   Init
   ========================================================= */
function init() {
  $('demo-badge').classList.toggle('hidden', REMOTE);
  $('demo-reset').classList.toggle('hidden', REMOTE);
  $('f-brand').innerHTML = Object.entries(BRANDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  showImage(null);
  $('keypad').innerHTML = ['1','2','3','4','5','6','7','8','9','','0','del'].map(k => k === '' ? '<span></span>' :
    `<button onclick="pinKey('${k}')" class="py-3.5 rounded-2xl ${k === 'del' ? 'bg-white/5 text-slate-300' : 'bg-white/5 hover:bg-white/10 active:bg-amber-500 active:text-dark-950 text-xl'} font-bold transition">${k === 'del' ? '<i class="ph-bold ph-backspace text-lg"></i>' : fa(k)}</button>`).join('');
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => openTab(b.dataset.tab));
  document.querySelectorAll('.period-btn').forEach(b => b.onclick = () => { ui.period = b.dataset.period; renderChart(); });
  window.addEventListener('keydown', e => {
    if ($('pin-modal').classList.contains('open')) {
      const k = en(e.key);
      if (/^\d$/.test(k)) pinKey(k); else if (e.key === 'Backspace') pinKey('del'); else if (e.key === 'Escape') closeModal('pin-modal');
    } else if (e.key === 'Escape') ['cart-modal', 'confirm-modal', 'success-modal', 'myorders-modal'].forEach(closeModal);
  });
  // بنر دانلود اپ اندروید (فقط در مرورگر موبایل اندروید، نه داخل خود اپ)
  if (!IN_APP && CFG.APK_URL && /Android/i.test(navigator.userAgent)) {
    fetch(CFG.APK_URL, { method: 'HEAD' }).then(r => { if (r.ok) { const b = $('app-banner'); b.href = CFG.APK_URL; b.classList.remove('hidden'); } }).catch(() => {});
  }
  updateAdminIcon(); openTab('dash'); go('shop'); refreshCart();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
