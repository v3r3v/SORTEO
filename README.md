# Raffle Entry App

A static, no-server raffle entry form. People scan a QR code, land on the page,
enter their Name / Cellphone / Email, pick a dollar amount (each $1 = 1 entry),
pay with ATH Móvil, and — only once that payment is confirmed — their entry is
recorded in a Google Sheet. When you're ready to draw, a one-click menu picks a
random winner, weighted by number of entries.

Everything here is free and requires no paid subscription (aside from ATH
Móvil's own transaction fee):

- **Frontend**: plain HTML/CSS/JS ([index.html](index.html), [assets/](assets/)) — hosted for free on GitHub Pages.
- **Data storage**: a Google Sheet, written to by a free Google Apps Script "Web App" ([apps-script/Code.gs](apps-script/Code.gs)).
- **Payment**: [ATH Móvil's Payment Button widget](https://github.com/evertec/athmovil-javascript-api) — see "Payment integration" below.

## 1. Create the Google Sheet backend

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank sheet. Name it something like "Raffle Entries".
2. In the sheet, go to **Extensions > Apps Script**.
3. Delete the default placeholder code and paste in the contents of [apps-script/Code.gs](apps-script/Code.gs).
4. Click **Deploy > New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Description: anything, e.g. "raffle entry endpoint".
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**, then **Authorize access** and approve the permissions (it's your own script, this is expected).
5. Copy the **Web app URL** it gives you (ends in `/exec`). You'll need it in step 2.
6. Reload the Google Sheet tab once in your browser — a new **Raffle** menu should appear at the top. That's your winner-picker (see step 4).

The sheet will auto-create an "Entries" tab with headers the first time someone submits the form.

## 2. Point the form at your sheet

Open [assets/app.js](assets/app.js) and edit the `CONFIG` block at the top:

```js
const CONFIG = {
  prizeTitle: "Win the Prize! 🏆",
  prizeSubtitle: "$1 = 1 entry. The more entries, the better your odds.",
  pricePerEntry: 1,
  presetAmounts: [1, 5, 10, 20, 50],
  appsScriptUrl: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE", // <- paste the URL from step 1.5
  athPublicToken: "YOUR_ATH_BUSINESS_PUBLIC_TOKEN", // <- see "Payment integration" below
};
```

Adjust `prizeTitle`, `presetAmounts`, etc. to match your actual raffle. No other files need to change for basic use.

## 3. Host it for free on GitHub Pages

1. Create a new **public** GitHub repository and push this folder to it.
2. In the repo, go to **Settings > Pages**.
3. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/`. That's your live raffle page — open it and submit a test entry to confirm it appears in your Google Sheet.

(Netlify or Cloudflare Pages work the same way for free if you'd rather use those — just connect the repo and deploy, no config needed since this is static HTML.)

## 4. Generate the QR code

Once you have the live URL from step 3, use any free QR code generator (e.g. search "free QR code generator", or use your phone's built-in QR maker in some cases) and paste in that URL. Print or display the resulting QR image. This is a one-time step to make the poster/flyer — the app itself has no QR dependency.

## 5. Collecting entries & picking a winner

- A row is added to the **Entries** tab (Timestamp, EntryID, Name, Phone, Email, AmountUSD, Entries, PaymentStatus, ReferenceNumber) **only after ATH Móvil confirms the payment as `COMPLETED`.** If the customer declines, cancels, has no funds, or the payment window expires, nothing is written and the page shows an error instead.
- Every row that does exist is therefore already `PaymentStatus = paid` — there's nothing to mark manually.
- `ReferenceNumber` is ATH Móvil's own transaction ID, handy for reconciling against your ATH Business transaction history if needed.
- When you're ready to draw: open the Google Sheet, click **Raffle > Pick Random Winner** in the menu. It randomly selects a winner weighted by entry count and shows the result in a popup.

## Payment integration (ATH Móvil)

Payment is handled by [ATH Móvil's Payment Button widget](https://github.com/evertec/athmovil-javascript-api), embedded directly in [index.html](index.html) / [assets/app.js](assets/app.js). Flow:

1. The customer fills in their details and picks an amount, then clicks **Get My Entries**. This just validates the form — nothing is saved yet.
2. The page reveals ATH Móvil's own "Pay with ATH Móvil" button. Tapping it creates the transaction and opens ATH's payment modal; the customer confirms in the ATH Móvil app on their phone.
3. ATH Móvil calls back into the page (`authorizationATHM`, `cancelATHM`, `expiredATHM` in `assets/app.js`) once the customer confirms, cancels, or the payment times out.
4. Only on a `COMPLETED` result does the page call the Apps Script endpoint to save the entry — with `PaymentStatus = paid` and ATH's `ReferenceNumber` — and show the confirmation screen. Any other outcome shows an error and nothing is saved.

**Setup:** set `CONFIG.athPublicToken` in [assets/app.js](assets/app.js) to your ATH Business account's **Public Token** (Settings tab in the ATH Business app). This token is meant to be public/client-side — that's how ATH Móvil's own widget is designed to be embedded. Never put your ATH Business **private** token anywhere in this repo or the frontend; it isn't needed for this flow at all.

Two things to know going in, straight from ATH Móvil's own docs:

- **There is no sandbox/testing environment.** Testing requires a real, active ATH Business account and a separate real ATH Móvil account (different card) to pay from — e.g. do a real $1 test run before going live.
- **There's no webhook.** Confirmation happens client-side via the callback functions above while the page is open; there's no server-side notification if the customer closes the tab mid-payment (they just won't get an entry, which is the safe failure mode).
