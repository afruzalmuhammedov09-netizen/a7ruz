# A7 Assistent: loyiha

Ichida: `www/` (ilova), `server/` (SMS kod va sozlamalar serveri), `assets/icon-only.png` (ilova rasmi).
Ilova ikki rejimda ishlaydi:
- **Demo:** `www/config.js` boʻsh. Server kerak emas, kod har doim 123456.
- **Haqiqiy:** `www/config.js` ga server manzili yoziladi. Kod SMS bilan keladi, sozlamalar serverda saqlanadi.

## 1. Serverni ishga tushirish
Node.js 18 yoki yangisi kerak.
1. `cd server`
2. `cp .env.example .env` va ichiga Eskiz.uz email va parolini yozing. Boʻsh qoldirsangiz, kod SMS oʻrniga konsolga chiqadi (sinov uchun).
3. `node --env-file=.env index.js` (server `http://localhost:3000` da ishlaydi)

Endpointlar: `POST /api/send-code`, `POST /api/verify`, `GET/PUT /api/me`, `POST /api/logout`.

Ishlab chiqarishdan oldin: serverni HTTPS ortiga (Render, Railway, VPS) qoʻying, IP boʻyicha cheklov qoʻshing (hozir faqat raqam boʻyicha 60 soniya cheklov bor), `db.json` oʻrniga haqiqiy baza ishlating. Eskiz SMS matni oldindan tasdiqlanishini talab qilishi mumkin: akkauntingiz shartlarini tekshiring.

## 2. Android APK
**Yoʻl A: GitHub bilan (Android Studio kerak emas).** Loyihani GitHub repozitoriyasiga yuklang (`main` branch). Repozitoriyada Actions > "Build Android APK" > Run workflow. Tugagach, Artifacts ichidan `a7assistent-apk` ni yuklab oling. Bu sinov (debug) APK: telefonga oʻrnatib koʻrish mumkin. Bu jarayonni men sinab koʻra olmadim; xato chiqsa, Actions jurnalini yuboring.

**Yoʻl B: kompyuterda.** Node.js va Android Studio kerak.
```
npm install
npx cap add android
npx capacitor-assets generate --android
npx cap sync
npx cap open android
```
Android Studio: Build > Build APK(s).

**Play Market uchun** imzolangan **.aab** kerak: Android Studio'da Build > Generate Signed Bundle / APK > Android App Bundle, kalit (keystore) yarating va uni yoʻqotmang. Play Console'da (Google akkauntingiz bilan, oʻzingiz kirasiz) ilova yarating, .aab ni yuklang, `store/listing.md` dagi matnlarni va privacy policy havolasini kiriting. Yangi shaxsiy akkauntlar uchun Google ochiq sinovdan oʻtishni talab qilishi mumkin: Play Console talablarini tekshiring.

## 3. iPhone (iOS)
Capacitor 7 ishlatiladi. CI build uchun minimal iOS versiyasi 16.0.
GitHub Actions → **Build iOS Simulator** simulyator uchun `App.app` yig‘adi.
Haqiqiy iPhone uchun Mac’da `npm install`, `npx cap add ios --packagemanager SPM`, `npx cap sync ios`, `npx cap open ios` buyruqlarini ishlating. Xcode’da deployment target’ni 16.0 qilib, Signing & Capabilities bo‘limida Apple hisobingizga tegishli Team’ni tanlang va qurilmangizga Run qiling.

## 4. Sayt (a7assistent)
`www/` papkasini Netlify, Cloudflare Pages yoki GitHub Pages ga yuklang va domen ulang. APK faylni saytga qoʻyib, "Yuklab olish" havolasi berishingiz mumkin.

## 5. Keyingi bosqich: qoʻngʻiroqqa javob
Hozir ilova sozlamalarni (ish, Ha/Yoʻq, ovoz, tasdiq) serverga saqlaydi, lekin qoʻngʻiroqqa javob beruvchi ovozli AI hali ulanmagan. Buning uchun ElevenLabs Agents kabi ovozli AI xizmati va telefon raqami (Twilio yoki SIP) kerak. Server `/api/me` dagi sozlamalarni agent koʻrsatmasiga (hozir nima bilan bandligi, qaysi ovoz) aylantiradi. Oʻzbek tilida jonli suhbat sifatini avval sinab koʻring.
