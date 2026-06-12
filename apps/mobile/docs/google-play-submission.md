# Google Play submission guide (Android)

Getting **islam.se** (`se.islam.mobile`) onto Google Play. Unlike iOS, the Play *listing* can't be
managed as code (eas metadata is Apple-only), so most of this is the Play Console web UI. The build
and the automated submit path are wired through EAS.

Package: `se.islam.mobile` · EAS: `@edenmind/islam-se-mobile` · GCP service account:
`expo-mafk@pc-api-4650738391863085021-118.iam.gserviceaccount.com`

---

## ▶ STATUS (2026-06-12)

- ✅ Android **AAB** built (versionCode **5**) → downloaded to `~/Downloads/islam-se-1.0.2-vc5.aab`
- ✅ Service account `expo-mafk` **key generated, gitignored** (`secrets/play-service-account.json`) and
  **wired into `eas.json`** (`serviceAccountKeyPath` + `track: internal`).
- ✅ `eas submit` **authenticated against the Play app** — so the app exists in Play Console and the SA
  already has the access it needs. It then returned the expected *"first submission must be manual"*.
- ✅ App **created** in Play Console (you did this) + SA granted access → API can manage it.
- ✅ **Store listing pushed via the Play API**: Swedish title/short/full description, 4 phone
  screenshots, 512 icon, and a generated 1024×500 feature graphic
  (`store/google/play-feature-graphic.png`). All committed.
- ⬜ **The one-time manual first AAB upload** (Internal testing) — Google still blocks the API here.
  After that, every release ships with `eas submit -p android --profile production --latest`.
- ⬜ Web-only forms with no API: **Content rating** (IARC), **Data safety**, **App access**,
  **Ads**, **Target audience** — answers in section 5–7 below.

---

## The first release must be uploaded MANUALLY

Google's Play Developer API — which `eas submit` uses — **cannot create the first release**. Until an
app has at least one release made through the Play Console UI, the API returns "only releases with
status draft may be created on draft app." So:

1. **First release → manual.** Download the AAB from the EAS build page and upload it by hand to an
   **Internal testing** track in the Play Console.
2. **Every release after that → automated:** `eas submit -p android --profile production --latest`.

---

## ☐ 1. Create the app in Play Console (web-only — no API for this)

Verified 2026-06-12 via the service account: the API returns **404 "Package not found:
se.islam.mobile"**, so the app does **not** exist yet. Google has no API to create an app, so this
is a manual click. The SA (`expo-mafk`) already has account access, so it'll be able to manage the
app once it exists.

[Play Console](https://play.google.com/console) → **Create app**:
- App name: **islam.se**
- Default language: **Swedish (svenska) – sv-SE**
- App or game: **App** · Free or paid: **Free**
- Accept the Developer Program Policies + US export declarations → **Create app**

The package name `se.islam.mobile` isn't typed in — it gets registered automatically when you upload
the first AAB in the next step.

## ☐ 2. Manual first upload (Internal testing)

1. Download the AAB from the EAS build page (the build that finished with versionCode 5).
2. Play Console → your app → **Testing → Internal testing → Create new release**.
3. Upload the `.aab`. Google will manage app signing (accept the Play App Signing enrollment).
4. Add a couple of testers (your own Google account) → roll out to Internal testing.

## ☐ 3. Service account for automated submits (after the first manual upload)

The service account `expo-mafk@pc-api-4650738391863085021-118.iam.gserviceaccount.com` already exists.
For `eas submit -p android` to work it needs (a) a JSON key available to EAS and (b) release access in
Play Console:

- **Key:** it was created for EAS, so the key is likely already stored in EAS credentials — try
  `eas submit -p android --latest` and see if it authenticates. If it asks for a key, generate one
  (this is a sensitive credential op — authorize it explicitly):
  ```bash
  gcloud iam service-accounts keys create apps/mobile/secrets/play-service-account.json \
    --iam-account=expo-mafk@pc-api-4650738391863085021-118.iam.gserviceaccount.com \
    --project=pc-api-4650738391863085021-118
  ```
  Then add `"serviceAccountKeyPath": "./secrets/play-service-account.json"` to the `android` submit
  profile and **gitignore `secrets/`** (never commit a service-account key).
- **Access:** Play Console → **Users and permissions → Invite new users** → the service-account email
  → grant app access with **Release** permissions (Release to testing tracks + Release to production).

## ☐ 4. Store listing (web — Swedish)

Reuse the copy from `store.config.json` (`apple.info.sv`):
- **App name:** islam.se
- **Short description** (≤80 chars): e.g. *"Sveriges bönetider, qibla och karta — utan konton, spårning eller reklam."*
- **Full description:** the Swedish description from `store.config.json`.
- **Graphics:** app icon (512×512), **feature graphic (1024×500)** — required, needs to be made,
  and phone screenshots. The 4 iPhone screenshots at `store/apple/screenshot/sv/APP_IPHONE_67/*.png`
  (1290×2796) satisfy Play's phone screenshot specs and can be reused.
- **Privacy policy URL:** `https://islam.se/integritetspolicy/` (already live).

## ☐ 5. Content rating (IARC questionnaire)

Play Console → **Content rating** → fill the questionnaire. With no objectionable content this lands
at **Everyone / PEGI 3** — consistent with the iOS 4+ rating.

## ☐ 6. Data safety form

Mirror the iOS App Privacy answer: **no data collected, no data shared.** Location is used on-device
for prayer times and never transmitted; no accounts, no analytics, no ads. (Same justification as in
`app-store-submission.md`.)

## ☐ 7. Target audience, ads declaration, app category

- Target audience: 13+ (avoids the stricter "designed for children" requirements; the app isn't
  child-directed).
- Contains ads: **No**.
- Category: **Lifestyle**.

## ☐ 8. Promote and roll out

Once internal testing looks good: promote the release to **Closed/Open testing** or **Production**.
After the first manual upload, future versions go out with:

```bash
cd apps/mobile
pnpm release patch                                  # bumps version + versionCode, commits + tags
eas build -p android --profile production           # builds the AAB
eas submit -p android --profile production --latest # uploads to the internal track
```
