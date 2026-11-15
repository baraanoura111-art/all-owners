# All Owners

Owner lookup by area, building or cluster and unit number, plus search by name, phone or email.

- `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/` — the app (Render static site, publish directory `.`).
- `config.js` — the Apps Script web app address (ends in `/exec`).
- `apps-script/Code.gs` — paste into the Apps Script of the "All Owners" Google Sheet. PINs live in Script properties as `PIN_NAME`.
- The data stays in the Google Sheet; the app only shows it after a PIN login.
