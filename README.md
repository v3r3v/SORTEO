# Raffle Entry App

A static, no-server raffle entry form. People scan a QR code, land on the page,
enter their Name / Cellphone / Email, pick a dollar amount (each $1 = 1 entry),
and their entry is recorded in a Google Sheet. When you're ready to draw,
a one-click menu picks a random winner, weighted by number of entries.

Everything here is free and requires no paid subscription:

- **Frontend**: plain HTML/CSS/JS ([index.html](index.html), [assets/](assets/)) — hosted for free on GitHub Pages.
- **Data storage**: a Google Sheet, written to by a free Google Apps Script "Web App" ([apps-script/Code.gs](apps-script/Code.gs)).
- **Payment**: not wired up yet on purpose — see "Payment integration" below.

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
  paymentUrl: "",
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

- Every submission adds a row to the **Entries** tab: Timestamp, EntryID, Name, Phone, Email, AmountUSD, Entries, PaymentStatus.
- New rows start with `PaymentStatus = pending`.
- Once you've confirmed payment for a person (through whatever payment tool you end up using), change their row's `PaymentStatus` to `paid` directly in the sheet.
- When you're ready to draw: open the Google Sheet, click **Raffle > Pick Random Winner** in the menu. It randomly selects a winner weighted by entry count — only counting rows marked `paid` — and shows the result in a popup.

## Payment integration (not yet wired up)

You mentioned the payment piece is being handled separately. The form already has a hook for it: once a person submits their info, `assets/app.js` shows a confirmation screen and, if you set `CONFIG.paymentUrl`, a "Continue to Payment" button linking there with `{entryId}`, `{name}`, `{email}`, `{amount}` placeholders auto-filled in. Until `paymentUrl` is set, it just shows a "we'll be in touch" message. Each entry also gets a random `EntryID` (shown to the user and stored in the sheet) so you can reconcile a payment back to the right row later.

When your payment tool is ready, the two integration points are:

1. Set `CONFIG.paymentUrl` in [assets/app.js](assets/app.js) to send users onward after they submit the form, and/or
2. Have the payment tool (or you, manually) update the matching row's `PaymentStatus` to `paid` in the sheet once payment clears.
