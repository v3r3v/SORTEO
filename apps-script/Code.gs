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
 */

const SHEET_NAME = "Entries";
const HEADERS = ["Timestamp", "EntryID", "Name", "Phone", "Email", "AmountUSD", "Entries", "PaymentStatus", "ReferenceNumber"];

// Entries only reach here once ATH Móvil has confirmed the payment as
// COMPLETED (see assets/app.js finalizeEntry) — declined/cancelled/expired
// payments never call this endpoint, so nothing gets written for them.
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
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

    return jsonResponse({ result: "success" });
  } catch (err) {
    return jsonResponse({ result: "error", message: err.message });
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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Adds a "Raffle" menu to the spreadsheet with a one-click random winner draw.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Raffle").addItem("Pick Random Winner", "pickWinner").addToUi();
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
