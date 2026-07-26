# Boop Chess

Walnut-and-maple 3D chess where every capture is a show. Panda AI with 8 levels,
unlockable capture styles, crazy mode, character + points, controller support,
and local two-player.

---

## Track 1 — On the iPads by Thursday (PWA, do this today)

```bash
npm install
npm run build        # sanity check locally: npm run dev
```

**Deploy (pick one, ~5 minutes):**

- **Vercel / Netlify / Cloudflare Pages** — push this repo to GitHub, import it in
  the dashboard, framework preset "Vite", build `npm run build`, output `dist`.
  You get an HTTPS URL immediately.
- **Homelab** — `npm run build`, serve `dist/` behind your reverse proxy
  (HTTPS required for the service worker / install prompt).

**Install on the iPads/iPhones:**

1. Open the URL in **Safari** (must be Safari for install)
2. Share button → **Add to Home Screen**
3. Launch from the icon — full-screen, offline after first load, progress saves
   to the device (localStorage)

Bluetooth Xbox/PlayStation controllers pair with iPads in Settings → the
Gamepad API works in Safari, so the controller layer is live.

### Free hosting on GitHub Pages (built in)

1. Create a **public** GitHub repo named `boop-chess` (Pages on the free plan
   requires a public repo). If you pick a different name, change the base path
   in `vite.config.js` to `/<repo-name>/`.
2. Push this project to it (`main` branch).
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on
   every push — first run takes about 2 minutes, then the app is live at
   `https://<username>.github.io/boop-chess/`.

That URL is installable on the iPads (Safari → Add to Home Screen) — no other
hosting needed. A custom domain can be attached later on the same settings page.


**Current v1 scope flags (in `src/App.jsx`):**

- `ENABLE_STOCKFISH = false` — v1 ships the built-in Panda AI. Before flipping
  it on: settle the GPLv3 question for your distribution channel, download a
  stockfish.js build into `public/`, and set `SF_URL = "/stockfish.js"`.
- Online rooms show a friendly "coming soon" outside the Claude artifact —
  they need a tiny relay server (WebSocket room server or Supabase). The move
  protocol is plain UCI strings, so the client is already done.

---

## Track 2 — Apple App Store (account active: this is the live checklist)

**Phase A — App Store Connect setup (browser, ~20 min):**
1. App Store Connect → Agreements: confirm the free-apps agreement shows active.
2. Users and Access → Integrations → App Store Connect API → generate a key
   with **App Manager** role. Download the `.p8` (⚠️ downloads exactly once —
   store it safely) and note the **Key ID** and **Issuer ID**.
3. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers →
   new App ID (explicit), e.g. `com.yourname.boopchess`. No capabilities needed.
4. App Store Connect → My Apps → ＋ New App → iOS, name "Boop Chess" (have a
   backup name in case it's taken), your Bundle ID, any SKU string.

**Phase B — add iOS to this repo (any OS, ~15 min):**
5. `npm i @capacitor/core @capacitor/ios && npm i -D @capacitor/cli @capacitor/assets`
6. Set the real `appId` in `capacitor.config.ts` (must match the App ID).
7. `npm run build && npx cap add ios && npx cap sync ios`
8. `npx capacitor-assets generate --ios`  (uses assets/icon.png + splash.png)
9. In `ios/App/App/Info.plist` add, inside the top-level `<dict>`:
   `<key>ITSAppUsesNonExemptEncryption</key><false/>`
   (standard-HTTPS-only apps are export-compliance exempt; this skips the
   per-build compliance prompt)
10. Commit and push everything, including the new `ios/` folder.

**Phase C — Codemagic (first build ~30–45 min):**
11. codemagic.io → sign in with GitHub → add this repo.
12. Teams → Integrations → Developer Portal → add the API key from step 2,
    named `appstore_key` (or edit the name in `codemagic.yaml`).
13. Set your real bundle id in `codemagic.yaml`, then start the
    `ios-testflight` workflow. It creates certificates, signs, builds the IPA,
    and uploads to TestFlight automatically.
14. TestFlight processes ~10–30 min → install the TestFlight app on the
    iPad/iPhone → install the build → play-test the real native app.

**Phase D — listing and submission:**
15. Host PRIVACY.md somewhere public (GitHub Pages is fine) — Apple requires a
    privacy policy URL even for no-data apps.
16. App Store Connect listing: description, keywords, support URL, privacy URL,
    App Privacy questionnaire ("Data Not Collected"), age rating 4+ (skip the
    Kids Category), price Free.
17. Screenshots: one 6.7"/6.9" iPhone set and one 13" iPad set — easiest
    source is the TestFlight build on your actual devices.
18. Select the TestFlight build → **Submit for Review**, ideally Tuesday
    morning. New apps in 2026 typically take 2–5 days; updates after launch
    are much faster.

**Known review risk:** guideline 4.2 (apps that feel like repackaged websites).
Defenses already in place: fully offline, real-time 3D, controller support, no
external navigation. If it bounces once anyway, we adjust and resubmit.

---

## Stack

Vite + React 18 + three r128 (pinned — newer three renamed the color APIs),
vite-plugin-pwa for the manifest/service worker. Single-component app in
`src/App.jsx`; the storage adapter at the top of that file uses Claude artifact
storage when present and localStorage everywhere else.
