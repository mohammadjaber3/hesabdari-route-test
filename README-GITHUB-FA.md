# راهنمای آپلود نسخه آزمایشی

## قبل از آپلود
- این نسخه برای پروژه آزمایشی `hesabdari-route-test` تنظیم شده است.
- در `app.js` فقط مقدار `apiKey` هنوز باید از تنظیمات Firebase Web app وارد شود.
- اطلاعات واقعی مشتریان را برای آزمایش وارد نکنید.

## آپلود در GitHub
1. در GitHub یک مخزن تازه و جدا بسازید؛ نام پیشنهادی `hesabdari-route-test` و آن را Public کنید تا GitHub Pages رایگان کار کند.
2. فایل ZIP را در کمپیوتر Extract کنید.
3. وارد پوشه‌ای شوید که `index.html` و `.github` و `app.js` در آن هستند.
4. در مخزن GitHub گزینه **Add file → Upload files** را بزنید.
5. همه محتویات این پوشه را انتخاب و بارگذاری کنید. خود فایل ZIP یا پوشهٔ بالایی را تنها بارگذاری نکنید؛ `index.html` باید در ریشهٔ مخزن باشد و پوشهٔ `.github/workflows` نیز حفظ شود.
6. پیش از Commit، فایل `app.js` را باز کنید و مقدار `apiKey` را از Firebase Console → Project settings → General → Your apps → SDK setup and configuration → Config کپی کنید و فقط مقدار `REPLACE_WITH_TEST_FIREBASE_API_KEY` را با آن جایگزین کنید.
7. Commit changes را بزنید.
8. در مخزن به **Settings → Pages** بروید و Source را روی **GitHub Actions** بگذارید.
9. به زبانه **Actions** بروید. پس از موفقیت کار Deploy، آدرس سایت در جزئیات اجرا یا Settings → Pages نمایش داده می‌شود.

## Firebase
- Authentication باید با روش Email/Password فعال باشد.
- در Authentication → Users حساب آزمایشی بسازید.
- در Firestore باید سند `businesses/main/team/{UID}` برای همان حساب ساخته شود و فیلد `role` مقدار `owner` داشته باشد.
- قوانین Firestore را فقط در پروژه `hesabdari-route-test` منتشر کنید، نه پروژه اصلی.
- فایل `firestore.rules` در این مخزن به‌خودی‌خود قوانین Firebase را منتشر نمی‌کند؛ قوانین را در Firebase Console جداگانه بررسی و منتشر کنید.

## بررسی محلی
در صورت نصب بودن Node.js، از پوشه پروژه دستور `npm test` را اجرا کنید.
