/**
 * Raffle backend for Google Sheets, deployed as a Web App.
 *
 * SETUP (see ../README.md for full step-by-step):
 * 1. Create a Google Sheet. Extensions > Apps Script.
 * 2. Replace the default Code.gs contents with this file.
 * 3. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL into CONFIG.appsScriptUrl in assets/app.js.
 * 5. Reload the sheet once so the "Raffle" menu (onOpen) appears.
 * 6. Open the "Raffle" menu and click "Enable Auto-Reconcile (every 5 min)"
 *    once — see the reconciliation comment above reconcilePendingPayments().
 */

const SHEET_NAME = "Entries";
const HEADERS = ["Timestamp", "EntryID", "Name", "Phone", "Email", "AmountUSD", "Entries", "PaymentStatus", "ReferenceNumber"];

const PENDING_SHEET_NAME = "PendingPayments";
const PENDING_HEADERS = ["Timestamp", "EntryID", "Name", "Phone", "Email", "AmountUSD", "Entries", "EcommerceID", "Status", "ResolvedAt"];

// Must match CONFIG.athPublicToken in assets/app.js — used to check payment
// status server-side via ATH Móvil's read-only findPayment service.
const ATH_PUBLIC_TOKEN = "680b201c4ca668db83c06825b7e7e44cc75ae421";
const ATH_FIND_PAYMENT_URL = "https://payments.athmovil.com/api/business-transaction/ecommerce/business/findPayment";

// How long a payment can sit unresolved (stuck at OPEN/CONFIRM) before
// reconcilePendingPayments gives up auto-checking it and flags it "stale"
// for manual follow-up in the ATH Business app.
const PENDING_STALE_MINUTES = 20;

// Entries normally only reach the "record a finished payment" branch once
// ATH Móvil has confirmed COMPLETED in the customer's own browser tab (see
// assets/app.js finalizeEntry). But that confirmation only happens if the
// tab is still alive when the customer approves the payment in the ATH
// Móvil app — if they close the tab, or their phone suspends it in the
// background, that confirmation can be lost even though the payment went
// through. recordPending (called the moment the payment is *created*, well
// before the customer leaves for the app) plus reconcilePendingPayments
// (a periodic status check) exist to catch and rescue exactly that case.
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === "recordPending") {
      recordPendingPayment(data);
      return jsonResponse({ result: "success" });
    }

    withLock(function () {
      appendEntryRow(data);
      resolvePendingRow(data.entryId, "completed");
    });

    return jsonResponse({ result: "success" });
  } catch (err) {
    return jsonResponse({ result: "error", message: err.message });
  }
}

function appendEntryRow(data) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    new Date(),
    data.entryId || "",
    data.name || "",
    data.phone || "",
    data.email || "",
    Number(data.amount) || 0,
    Number(data.entries) || 0,
    data.paymentStatus || "paid",
    data.referenceNumber || "",
  ]);
}

function recordPendingPayment(data) {
  const sheet = getOrCreatePendingSheet();
  sheet.appendRow([
    new Date(),
    data.entryId || "",
    data.name || "",
    data.phone || "",
    data.email || "",
    Number(data.amount) || 0,
    Number(data.entries) || 0,
    data.ecommerceId || "",
    "pending",
    "",
  ]);
}

function resolvePendingRow(entryId, status) {
  if (!entryId) return;
  const sheet = getOrCreatePendingSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === entryId && values[i][8] === "pending") {
      sheet.getRange(i + 1, 9).setValue(status);
      sheet.getRange(i + 1, 10).setValue(new Date());
      break;
    }
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreatePendingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PENDING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PENDING_SHEET_NAME);
    sheet.appendRow(PENDING_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds a "Raffle" menu with the winner draw and the pending-payment tools.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Raffle")
    .addItem("Pick Random Winner", "pickWinner")
    .addSeparator()
    .addItem("Reconcile Pending Payments Now", "reconcilePendingPayments")
    .addItem("Enable Auto-Reconcile (every 5 min)", "enableAutoReconcile")
    .addToUi();
}

/**
 * Picks a winner weighted by number of entries, counting only rows whose
 * PaymentStatus column is exactly "paid" (every row written by doPost already
 * is, since it only runs after ATH Móvil confirms payment).
 */
function pickWinner() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getOrCreateSheet();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // drop header row

  const tickets = [];
  rows.forEach((row, idx) => {
    const entries = Number(row[6]) || 0;
    const paymentStatus = String(row[7] || "").trim().toLowerCase();
    if (paymentStatus === "paid") {
      for (let i = 0; i < entries; i++) tickets.push(idx);
    }
  });

  if (tickets.length === 0) {
    ui.alert("No paid entries yet. Mark rows as \"paid\" in the PaymentStatus column before drawing.");
    return;
  }

  const winnerRowIdx = tickets[Math.floor(Math.random() * tickets.length)];
  const winner = rows[winnerRowIdx];

  ui.alert(
    "🎉 Winner!",
    `Name: ${winner[2]}\nPhone: ${winner[3]}\nEmail: ${winner[4]}\nEntries: ${winner[6]}\n\n` +
      `(Drawn from ${tickets.length} total paid entries across ${rows.filter(r => String(r[7]).trim().toLowerCase() === "paid").length} people.)`,
    ui.ButtonSet.OK
  );
}

/**
 * Safety net for the "customer paid but never returned to the page" case.
 * For every PendingPayments row still marked "pending", asks ATH Móvil's
 * findPayment service for its real status:
 *   - COMPLETED -> writes the entry to Entries as paid (rescued).
 *   - CANCEL    -> marks the row "cancelled"; no entry is created.
 *   - anything else, and older than PENDING_STALE_MINUTES -> marks "stale"
 *     so it stops being retried forever; check that EcommerceID manually in
 *     the ATH Business app if it matters (it likely means the payment was
 *     genuinely never finished/approved).
 * Safe to run repeatedly — already-resolved rows and rows whose EntryID
 * already exists in Entries (the customer's own tab already reported back
 * successfully) are skipped.
 */
function reconcilePendingPayments() {
  withLock(function () {
    const pendingSheet = getOrCreatePendingSheet();
    const pendingValues = pendingSheet.getDataRange().getValues();
    const entriesSheet = getOrCreateSheet();
    const existingEntryIds = {};
    entriesSheet
      .getDataRange()
      .getValues()
      .slice(1)
      .forEach(function (r) {
        existingEntryIds[r[1]] = true;
      });

    for (let i = 1; i < pendingValues.length; i++) {
      const row = pendingValues[i];
      const timestamp = row[0];
      const entryId = row[1];
      const name = row[2];
      const phone = row[3];
      const email = row[4];
      const amount = row[5];
      const entries = row[6];
      const ecommerceId = row[7];
      const status = row[8];

      if (status !== "pending" || !ecommerceId) continue;

      if (existingEntryIds[entryId]) {
        pendingSheet.getRange(i + 1, 9).setValue("completed");
        pendingSheet.getRange(i + 1, 10).setValue(new Date());
        continue;
      }

      let result;
      try {
        result = findAthPayment(ecommerceId);
      } catch (err) {
        continue; // network hiccup — try again next run
      }

      const ecommerceStatus = result && result.data && result.data.ecommerceStatus;

      if (ecommerceStatus === "COMPLETED") {
        entriesSheet.appendRow([
          new Date(),
          entryId,
          name,
          phone,
          email,
          Number(amount) || 0,
          Number(entries) || 0,
          "paid",
          result.data.referenceNumber || "",
        ]);
        existingEntryIds[entryId] = true;
        pendingSheet.getRange(i + 1, 9).setValue("completed");
        pendingSheet.getRange(i + 1, 10).setValue(new Date());
      } else if (ecommerceStatus === "CANCEL") {
        pendingSheet.getRange(i + 1, 9).setValue("cancelled");
        pendingSheet.getRange(i + 1, 10).setValue(new Date());
      } else {
        const ageMinutes = (Date.now() - new Date(timestamp).getTime()) / 60000;
        if (ageMinutes > PENDING_STALE_MINUTES) {
          pendingSheet.getRange(i + 1, 9).setValue("stale");
          pendingSheet.getRange(i + 1, 10).setValue(new Date());
        }
      }
    }
  });
}

function findAthPayment(ecommerceId) {
  const response = UrlFetchApp.fetch(ATH_FIND_PAYMENT_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ ecommerceId: ecommerceId, publicToken: ATH_PUBLIC_TOKEN }),
    muteHttpExceptions: true,
  });
  return JSON.parse(response.getContentText());
}

/**
 * Raffle menu action: creates the 5-minute time-driven trigger that runs
 * reconcilePendingPayments automatically. Safe to run more than once.
 */
function enableAutoReconcile() {
  const already = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "reconcilePendingPayments";
  });
  if (already) {
    SpreadsheetApp.getUi().alert("Auto-reconcile is already enabled (runs every 5 minutes).");
    return;
  }
  ScriptApp.newTrigger("reconcilePendingPayments").timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert("Auto-reconcile enabled — pending payments will be checked every 5 minutes.");
}
