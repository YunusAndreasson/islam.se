# App Store submission guide (iOS)

Living checklist for taking **islam.se** from TestFlight to a public App Store release.
Most of the listing is managed as code in [`store.config.json`](../store.config.json) and pushed
with `eas metadata:push`. A few things are web-only (App Privacy, the App Review phone number,
pressing "Submit for Review") and are called out below.

App Store Connect app ID: **6774383118** · Bundle: `se.islam.mobile` · EAS: `@edenmind/islam-se-mobile`

---

## ▶ CURRENT STATUS (2026-06-22)

**v1.0.2 (build 12) is LIVE on the App Store.** The listing shows "islam.se" /
subtitle "Bönetider, qibla och karta", free, iPhone-only.

**Staged for the NEXT version — do NOT push to 1.0.2 (it's released and locked):**
- ⏳ **sv title → `islam.se - bönetider`** — changed in `store.config.json` (was `islam.se`).
  Renaming a live app requires a new version through App Review, so this can't go out via a
  metadata-only push. It rides along with the next version bump + build. `eas metadata:push`
  against 1.0.2 fails with *"version number has been previously used"* / *"age rating
  declaration is not editable"* — that's expected, not a bug.

When cutting the next release: bump `apple.version` (store.config.json) **and** `version`
(app.json) to e.g. `1.0.3`, build, then `eas metadata:push` creates the editable version and
pushes the new title, then Submit for Review.

**Done (v1.0.2, for the record):**
- ✅ Build **12** (iPhone-only, v1.0.2) built on EAS, uploaded, selected, **released**
- ✅ Listing copy (sv + en-US), categories, 4+ age rating, App Review contact + notes — pushed
- ✅ **4 screenshots** (1290×2796, `APP_IPHONE_67`) uploaded for both locales
- ✅ App Privacy → "Data Not Collected", IDFA = No
- ✅ Privacy policy **live** at https://islam.se/integritetspolicy/

---

## What's automated via `eas metadata` (`store.config.json`)

- Title, subtitle, promotional text, description, keywords, release notes — **sv** (primary) + **en-US**
- Marketing / support / privacy-policy URLs
- Categories: Lifestyle (primary), Reference (secondary)
- Age rating: **4+** (every advisory flag is NONE/false)
- App Review contact + reviewer notes
- Screenshots (once generated — see below) get uploaded by `eas metadata:push`

Push it with:

```bash
cd apps/mobile
eas metadata:push        # validates, then writes the listing to App Store Connect
```

> `eas metadata` does **not** manage the App Privacy nutrition labels — that's the one web form below.

---

## ☐ App Privacy ("nutrition labels") — web-only, in App Store Connect

App Store Connect → your app → **App Privacy** → Edit.

**Recommended answer: "Data Not Collected."**

Why this is accurate for islam.se:

- **Location** is used only to compute prayer times / qibla **on the device**. It is never
  transmitted to us or to a server, never stored off-device. Under Apple's definition, data that
  never leaves the device is **not "collected."**
- **No accounts, no analytics, no advertising, no third-party tracking SDKs** (verified in the
  codebase — there is no Sentry/Firebase/analytics dependency).
- **Settings** are stored locally (AsyncStorage) and never leave the device.

This matches the in-app promise on the *Om*-screen: *"Din plats lämnar aldrig enheten. Inga konton,
ingen spårning, ingen reklam."*

**One nuance to be aware of (you do not need to declare it, but know the reasoning):** the map
fetches tile images from MapTiler / OpenFreeMap. Like any web request, those CDNs see the
requesting IP. We do not send the user's GPS position to them and the requests aren't used to
identify or track the user, so "Data Not Collected" remains correct. If a reviewer ever questions
it, the conservative fallback is to declare **Coarse Location → App Functionality → Not linked to
identity → Not used for tracking** — but start with "Data Not Collected."

After answering: set **"Does this app use the Advertising Identifier (IDFA)?" → No.**

---

## ☐ Privacy-policy URL must be live before review

`store.config.json` points the listing at **https://islam.se/integritetspolicy**. The page has been
added to the website (`apps/web/src/pages/integritetspolicy.astro`) but must be **deployed** so the
URL resolves when Apple's reviewer opens it.

```bash
cd apps/web && pnpm build      # then deploy (Cloudflare)
```

Verify `https://islam.se/integritetspolicy` loads in a browser before submitting.

---

## ☐ App Review phone number — the one field to fill in

`store.config.json` → `apple.review` has the contact name (Yunus Andreasson) and email
(support@islam.se), but **no phone number** — I won't invent a number that reaches a real Apple
reviewer. Add `"phone": "+46…"` to the `review` block, or fill it in the web UI under
**App Review Information**, before submitting.

---

## ☐ Export compliance — already handled

`app.json` sets `ITSAppUsesNonExemptEncryption: false`, so there's no per-submission encryption
question. Nothing to do.

---

## ☑ Screenshots — done (iPhone only)

The app is now **iPhone-only** (`ios.supportsTablet: false`), so only **iPhone 6.9"** screenshots
are required — no iPad set.

Four screenshots (shot on iPhone 16 Pro, resized to the accepted **1290×2796**) are wired into
`store.config.json` under `APP_IPHONE_67` for both `sv` and `en-US`, stored at
`store/apple/screenshot/<locale>/APP_IPHONE_67/01–04.png`:

1. Map of Sweden with the evening solar arc + prayer dock
2. Full prayer-times list (Fajr–Isha)
3. Qibla compass
4. Map with the dawn solar band

`eas metadata:push` uploads them.

---

## ☐ Version / build to ship

- TestFlight currently has **build 10 = v1.0.2** (commit `fbd5ac7`).
- `main` has commits **after** that build (widget modernization, React Compiler, perf, sweep-arc polish).
- ASC's editable version record still says **1.0**; `store.config.json` sets it to **1.0.2**.

**A fresh build is needed** (not just an OTA): the accessory **lock-screen widget families**
(`accessoryRectangular` / `accessoryCircular` / `accessoryInline`) are native and can't be shipped
over-the-air — they only exist in a rebuilt binary. React Compiler + the UI polish ride along too.

Marketing version stays **1.0.2** (it was never publicly released, only on TestFlight), and the
`production` profile has `autoIncrement: true`, so the build number bumps itself.

> **Build history this session:** build **11** was universal (`supportsTablet: true`). We then chose
> **iPhone-only** and set `ios.supportsTablet: false`, which needs a fresh binary → build **12** is
> the one to ship. (Build 11 is superseded; don't submit it, or the App Store will demand iPad
> screenshots.)

```bash
cd apps/mobile
eas build -p ios --profile production    # auto-increments to build 12, iPhone-only, stays v1.0.2
```

`apple.version` in `store.config.json` already matches (`1.0.2`). Leave it.

---

## ☐ Final submission

```bash
cd apps/mobile
eas submit -p ios --profile production --latest   # uploads the binary to App Store Connect / TestFlight
eas metadata:push                                 # pushes listing copy + screenshots
```

Then in App Store Connect: attach the build to the version, confirm App Privacy + screenshots are
in place, and press **Submit for Review** (this last click is web-only).
