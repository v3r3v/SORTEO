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
  prizeSubtitle: "$5 = 1 entry. Up to 3 entries per payment.",
  appsScriptUrl: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE", // <- paste the URL from step 1.5
  athPublicToken: "YOUR_ATH_BUSINESS_PUBLIC_TOKEN", // <- see "Payment integration" below
  entryTiers: [
    { entries: 1, amount: 5 },
    { entries: 2, amount: 10 },
    { entries: 3, amount: 15 },
  ],
  testTier: { entries: 1, amount: 1 }, // remove once done testing — see "Payment integration" below
};
```

Adjust `prizeTitle`, `entryTiers`, etc. to match your actual raffle. No other files need to change for basic use.

## 3. Host it for free on GitHub Pages

1. Create a new **public** GitHub repository and push this folder to it.
2. In the repo, go to **Settings > Pages**.
3. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/`. That's your live raffle page — open it and submit a test entry to confirm it appears in your Google Sheet.

(Netlify or Cloudflare Pages work the same way for free if you'd rather use those — just connect the repo and deploy, no config needed since this is static HTML.)

## 4. Generate the QR code

Once you have the live URL from step 3, use any free QR code generator (e.g. search "free QR code generator", or use your phone's built-in QR maker in some cases) and paste in that URL. Print or display the resulting QR image. This is a one-time step to make the poster/flyer — the app itself has no QR dependency.

## 5. Collecting entries & picking a winner

- A row is added to the **Entries** tab (Timestamp, EntryID, Name, Phone, Email, AmountUSD, Entries, PaymentStatus, ReferenceNumber) once a payment is confirmed `COMPLETED` — either live, by the customer's own browser tab right after they confirm in the ATH Móvil app, or later, rescued by the reconciliation check described below if that tab never reported back. If the customer declines, cancels, has no funds, or the payment window expires, nothing is written and the page shows an error instead.
- Every row that does exist is therefore already `PaymentStatus = paid` — there's nothing to mark manually.
- `ReferenceNumber` is ATH Móvil's own transaction ID, handy for reconciling against your ATH Business transaction history if needed.
- A separate **PendingPayments** tab tracks every payment attempt from the moment it's created — see "Payment integration" below for what it's for and how to read its `Status` column.
- When you're ready to draw: open the Google Sheet, click **Raffle > Pick Random Winner** in the menu. It randomly selects a winner weighted by entry count and shows the result in a popup.

## Payment integration (ATH Móvil)

Payment is handled by [ATH Móvil's Payment Button widget](https://github.com/evertec/athmovil-javascript-api), embedded directly in [index.html](index.html) / [assets/app.js](assets/app.js). Flow:

1. The customer fills in their details and picks an amount, then clicks **Get My Entries**. This just validates the form — nothing is saved yet.
2. The page reveals ATH Móvil's own "Pay with ATH Móvil" button. Tapping it creates the transaction and opens ATH's payment modal; the customer confirms in the ATH Móvil app on their phone.
3. ATH Móvil calls back into the page (`authorizationATHM`, `cancelATHM`, `expiredATHM` in `assets/app.js`) once the customer confirms, cancels, or the payment times out.
4. Only on a `COMPLETED` result does the page call the Apps Script endpoint to save the entry — with `PaymentStatus = paid` and ATH's `ReferenceNumber` — and show the confirmation screen. Any other outcome shows an error and nothing is saved.

**Setup:** set `CONFIG.athPublicToken` in [assets/app.js](assets/app.js) to your ATH Business account's **Public Token** (Settings tab in the ATH Business app). This token is meant to be public/client-side — that's how ATH Móvil's own widget is designed to be embedded. Never put your ATH Business **private** token anywhere in this repo or the frontend; it isn't needed for this flow at all.

Two things to know going in, straight from ATH Móvil's own docs:

- **There is no sandbox/testing environment.** Testing requires a real, active ATH Business account and a separate real ATH Móvil account (different card) to pay from. `CONFIG.testTier` in `assets/app.js` exists for exactly this — a $1 tier (ATH's documented minimum) so testing doesn't require using a full $5+ entry. **Remove it before going live.**
- **There's no webhook**, and reaching `COMPLETED` is documented as a two-step, client-driven process: the customer confirms in the ATH Móvil app (→ status `CONFIRM`), and *then* the page still open in their browser automatically calls ATH's `/authorization` service to finalize it. If that tab is closed, or the phone's OS suspends it in the background before that call fires, the confirmation can be lost even though the customer approved the payment. ATH Móvil's app does prompt the customer to return to the site after paying, but nothing forces them to, and their own docs don't guarantee anything resolves this state on their end.

### The pending-payment safety net

Because that failure mode is real (not hypothetical — this is the whole reason it needs a safety net rather than just trusting the callback), the integration doesn't rely on the customer's tab alone:

1. The moment the customer taps the real ATH Móvil button, `assets/app.js` (`watchAthPaymentCreation`) captures the transaction's `ecommerceId` and immediately records a `pending` row in the **PendingPayments** tab — well before the customer ever leaves for the ATH app.
2. If their tab *does* report back successfully (the common case), the entry is written to **Entries** as normal and the matching PendingPayments row is marked `completed`.
3. If it doesn't, `Code.gs`'s `reconcilePendingPayments()` periodically asks ATH Móvil's own read-only status-check service (`findPayment`) about every row still marked `pending`:
   - Actually `COMPLETED` (the payment went through, the tab just never got to report it) → the entry is written to **Entries** and the row is marked `completed`. **This is the rescue.**
   - `CANCEL` → marked `cancelled`, no entry created.
   - Still unresolved after 20 minutes → marked `stale`, left alone (see limitation below).

**Setup:** after pasting the updated `Code.gs` into the Apps Script editor and redeploying, open the Google Sheet and click **Raffle > Enable Auto-Reconcile (every 5 min)** once. That installs a time-driven trigger so this runs automatically. (**Raffle > Reconcile Pending Payments Now** runs it immediately if you don't want to wait — handy right after a test payment.) `Code.gs` also has an `ATH_PUBLIC_TOKEN` constant near the top — keep it in sync with `athPublicToken` in `assets/app.js` if you ever change it.

**Limitations, honestly:**
- This closes the most likely gap (payment actually completed, but the confirmation never made it back), but a transaction that's still stuck at `CONFIRM` — customer approved, but the tab died *before* it could call `/authorization` at all — has no documented server-side rescue from ATH Móvil. It'll show as `stale` in PendingPayments after 20 minutes; check that `EcommerceID` in your ATH Business app if a customer says they paid but a `stale` row is all that shows up.
- The `ecommerceId` capture works by watching the network call ATH Móvil's own widget script makes — it's not something ATH documents as a stable integration point. If they change how their widget works, this stops capturing new pending rows silently (it won't break the payment flow itself, just the safety net). Worth a quick check after any noticeable change on ATH's side: open the browser console during a test payment and confirm a `pending` row appears in the sheet right after tapping the button.
- The "already had the ATH Móvil app open" issue some customers hit is inside ATH Móvil's own app/deep-linking behavior — outside anything this website's code touches or can fix.
