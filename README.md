# مجید تل — سامانه فروش همکاری موبایل استوک

- سایت: https://lidoma0.github.io/majid-tel/
- اپ اندروید: https://lidoma0.github.io/majid-tel/majidtel.apk
- رمز پیش‌فرض مدیر: `1988` (از پنل مدیریت ← انبار ← تنظیمات قابل تغییر است)

## ساختار
| مسیر | توضیح |
|---|---|
| `www/` | خود سایت (همین پوشه منتشر می‌شود) |
| `www/config.js` | آدرس و کلید Supabase |
| `www/assets/app.js` | کل منطق برنامه |
| `supabase/schema.sql` | دیتابیس و توابع امن سمت سرور |
| `.github/workflows/deploy.yml` | ساخت خودکار APK و انتشار سایت با هر push |

## راه‌اندازی دیتابیس (Supabase)
1. در supabase.com یک پروژه رایگان بسازید.
2. SQL Editor ← New query ← محتوای `supabase/schema.sql` را Paste و **Run** کنید.
3. Project Settings ← API: مقدار `Project URL` و کلید `anon public` را در `www/config.js` بگذارید و push کنید.

تا وقتی `config.js` خالی است، سایت در «حالت دمو» است و داده‌ها فقط داخل همان مرورگر ذخیره می‌شوند.

## اپ اندروید
APK به‌صورت خودکار در GitHub Actions ساخته می‌شود. یک بار باید کلید امضا را در Secrets مخزن گذاشت:
- `ANDROID_KEYSTORE_B64`: محتوای base64 فایل `majidtel-release.p12`
- `ANDROID_KEYSTORE_PASSWORD`: رمز داخل `majidtel-keystore.txt`

⚠️ فایل‌های `majidtel-release.p12` و `majidtel-keystore.txt` را جای امن پشتیبان بگیرید؛ بدون آن‌ها نسخه‌های بعدی اپ روی گوشی کاربران آپدیت نمی‌شود.

اپ محتوای سایت را زنده بارگذاری می‌کند؛ پس هر تغییری در سایت، بدون نصب نسخه جدید داخل اپ هم دیده می‌شود.

## اجرای محلی
```bash
npm install
npm run build
node scripts/serve.mjs   # http://localhost:5173
```

## انتقال بعدی به لیارا
تمام ارتباط با سرور از تابع `rpc(name, args)` در `app.js` می‌گذرد. برای لیارا کافی است یک API با همین نام توابع (مطابق `schema.sql`) ساخته شود و `remoteRpc` به آن اشاره کند.
