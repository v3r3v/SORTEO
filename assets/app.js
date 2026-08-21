// ---------------------------------------------------------------------------
// Edit these values for your raffle. No other code changes should be needed.
// ---------------------------------------------------------------------------
const CONFIG = {
  prizeTitle: "Win the Prize! 🏆",
  prizeSubtitle: "$1 = 1 entry. The more entries, the better your odds.",
  pricePerEntry: 1, // dollars per entry
  presetAmounts: [1, 5, 10, 20, 50],

  // Paste the "Web app" URL you get after deploying apps-script/Code.gs
  // (Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone).
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwvj_SsZ71dkUtn9L-YECk11rihsiRvKxeERw7Nd1e1jocHFAnPnn33YrQ-4hvPEP1c/exec", // must end in /exec — see README step 1

  // ATH Móvil Business "Public Token" (Settings tab in the ATH Business app).
  // This value is meant to be public/client-side — ATH Móvil's own Payment
  // Button widget requires it to be embedded in the page like this.
  athPublicToken: "680b201c4ca668db83c06825b7e7e44cc75ae421",
};
// ---------------------------------------------------------------------------

const form = document.getElementById("entryForm");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const customAmountInput = document.getElementById("customAmount");
const presetAmountsEl = document.getElementById("presetAmounts");
const summaryEl = document.getElementById("summary");
const summaryText = document.getElementById("summaryText");
const submitBtn = document.getElementById("submitBtn");
const statusMsg = document.getElementById("statusMsg");
const payStepEl = document.getElementById("payStep");
const paySummaryText = document.getElementById("paySummaryText");
const payStatusMsg = document.getElementById("payStatusMsg");
const backToFormBtn = document.getElementById("backToFormBtn");
const confirmationEl = document.getElementById("confirmation");
const confirmationText = document.getElementById("confirmationText");
const entryIdText = document.getElementById("entryIdText");

let selectedAmount = null;
let pendingEntry = null; // { entryId, name, phone, email, amount, entries } set once the user reaches the pay step

// Config object read by ATH Móvil's athmovil_base.js widget. It renders its
// own "Pay with ATH Móvil" button into #ATHMovil_Checkout_Button_payment and
// reads these fields at the moment the customer taps that button, so it's
// safe to mutate them right before revealing the pay step.
const ATHM_Checkout = {
  env: "production",
  publicToken: CONFIG.athPublicToken,
  timeout: 600,
  orderType: "",
  theme: "btn",
  lang: "en",
  total: 1,
  subtotal: 1,
  tax: 0,
  metadata1: "",
  metadata2: "",
  items: [],
  phoneNumber: "",
};

function init() {
  document.getElementById("prizeTitle").textContent = CONFIG.prizeTitle;
  document.getElementById("prizeSubtitle").textContent = CONFIG.prizeSubtitle;

  CONFIG.presetAmounts.forEach((amount) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "amount-btn";
    btn.textContent = `$${amount}`;
    btn.addEventListener("click", () => selectAmount(amount, btn));
    presetAmountsEl.appendChild(btn);
  });

  customAmountInput.addEventListener("input", () => {
    clearPresetSelection();
    const value = Number(customAmountInput.value);
    selectedAmount = value > 0 ? value : null;
    updateSummary();
  });
}

function selectAmount(amount, btnEl) {
  customAmountInput.value = "";
  clearPresetSelection();
  btnEl.classList.add("selected");
  selectedAmount = amount;
  updateSummary();
}

function clearPresetSelection() {
  presetAmountsEl.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("selected"));
}

function updateSummary() {
  const amountError = document.getElementById("amountError");
  amountError.textContent = "";

  if (!selectedAmount || selectedAmount < CONFIG.pricePerEntry) {
    summaryEl.hidden = true;
    return;
  }
  const entries = Math.floor(selectedAmount / CONFIG.pricePerEntry);
  summaryText.textContent = `$${selectedAmount} = ${entries} ${entries === 1 ? "entry" : "entries"}`;
  summaryEl.hidden = false;
}

function setFieldError(id, message) {
  document.getElementById(id).textContent = message || "";
}

function validate() {
  let valid = true;

  if (!nameInput.value.trim()) {
    setFieldError("nameError", "Name is required.");
    valid = false;
  } else {
    setFieldError("nameError", "");
  }

  const phoneDigits = phoneInput.value.replace(/\D/g, "");
  if (phoneDigits.length < 7) {
    setFieldError("phoneError", "Enter a valid phone number.");
    valid = false;
  } else {
    setFieldError("phoneError", "");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailInput.value.trim())) {
    setFieldError("emailError", "Enter a valid email.");
    valid = false;
  } else {
    setFieldError("emailError", "");
  }

  if (!selectedAmount || selectedAmount < CONFIG.pricePerEntry) {
    setFieldError("amountError", `Choose or enter at least $${CONFIG.pricePerEntry}.`);
    valid = false;
  } else {
    setFieldError("amountError", "");
  }

  return valid;
}

function setStatus(message, kind) {
  statusMsg.textContent = message || "";
  statusMsg.classList.remove("error-text", "success-text");
  if (kind === "error") statusMsg.classList.add("error-text");
  if (kind === "success") statusMsg.classList.add("success-text");
}

async function submitEntry(payload) {
  // Google Apps Script web apps reject cross-origin requests that trigger a
  // CORS preflight. Sending as text/plain keeps this a "simple request" so
  // the browser skips preflight; Code.gs parses the JSON string itself.
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.result !== "success") {
    throw new Error(data.message || "Unknown error recording entry.");
  }
  return data;
}

function setPayStatus(message, kind) {
  payStatusMsg.textContent = message || "";
  payStatusMsg.classList.remove("error-text", "success-text");
  if (kind === "error") payStatusMsg.classList.add("error-text");
  if (kind === "success") payStatusMsg.classList.add("success-text");
}

function showConfirmation(entries, amount, entryId) {
  payStepEl.hidden = true;
  confirmationEl.hidden = false;

  confirmationText.textContent = `Your payment went through and your ${entries} ${
    entries === 1 ? "entry is" : "entries are"
  } locked in ($${amount}). Good luck!`;
  entryIdText.textContent = entryId;
}

function goToPayStep() {
  const entries = Math.floor(selectedAmount / CONFIG.pricePerEntry);
  pendingEntry = {
    entryId: crypto.randomUUID(),
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
    amount: selectedAmount,
    entries,
  };

  ATHM_Checkout.total = selectedAmount;
  ATHM_Checkout.subtotal = selectedAmount;
  ATHM_Checkout.tax = 0;
  ATHM_Checkout.metadata1 = pendingEntry.entryId;
  ATHM_Checkout.metadata2 = pendingEntry.name.slice(0, 40);
  ATHM_Checkout.phoneNumber = pendingEntry.phone;
  ATHM_Checkout.items = [
    {
      name: `${entries} ${entries === 1 ? "Raffle Entry" : "Raffle Entries"}`,
      description: CONFIG.prizeTitle,
      quantity: 1,
      price: selectedAmount,
      tax: 0,
      metadata: pendingEntry.entryId,
    },
  ];

  paySummaryText.textContent = `$${selectedAmount} = ${entries} ${entries === 1 ? "entry" : "entries"}`;
  setPayStatus("", null);
  form.hidden = true;
  payStepEl.hidden = false;
}

backToFormBtn.addEventListener("click", () => {
  pendingEntry = null;
  payStepEl.hidden = true;
  form.hidden = false;
  submitBtn.disabled = false;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setStatus("", null);

  if (!validate()) {
    setStatus("Please fix the highlighted fields.", "error");
    return;
  }

  if (!CONFIG.appsScriptUrl || CONFIG.appsScriptUrl.includes("PASTE_YOUR")) {
    setStatus("Setup incomplete: appsScriptUrl is not configured in assets/app.js.", "error");
    return;
  }

  if (!CONFIG.athPublicToken) {
    setStatus("Setup incomplete: athPublicToken is not configured in assets/app.js.", "error");
    return;
  }

  goToPayStep();
});

// ---------------------------------------------------------------------------
// ATH Móvil Payment Button callbacks. athmovil_base.js calls these by name
// once the customer confirms (or cancels/times out) the payment in the ATH
// Móvil app, and provides the `authorization()` / `findPaymentATHM()` helper
// functions used below. See:
// https://github.com/evertec/athmovil-javascript-api
// ---------------------------------------------------------------------------

async function authorizationATHM() {
  setPayStatus("Confirming your payment…", null);
  try {
    const response = await authorization();
    const data = response && response.data;
    if (data && data.ecommerceStatus === "COMPLETED") {
      await finalizeEntry(data);
    } else {
      handlePaymentNotCompleted();
    }
  } catch (err) {
    console.error(err);
    handlePaymentNotCompleted();
  }
}

async function cancelATHM() {
  try {
    await findPaymentATHM();
  } catch (err) {
    console.error(err);
  }
  handlePaymentNotCompleted("Payment was cancelled.");
}

async function expiredATHM() {
  try {
    await findPaymentATHM();
  } catch (err) {
    console.error(err);
  }
  handlePaymentNotCompleted("The payment window expired.");
}

function handlePaymentNotCompleted(reason) {
  const message = reason || "Payment wasn't completed.";
  setPayStatus(`${message} Your entry was not saved — please try again.`, "error");
}

async function finalizeEntry(athData) {
  if (!pendingEntry) return;

  const payload = {
    entryId: pendingEntry.entryId,
    name: pendingEntry.name,
    phone: pendingEntry.phone,
    email: pendingEntry.email,
    amount: athData.total,
    entries: pendingEntry.entries,
    referenceNumber: athData.referenceNumber || "",
    paymentStatus: "paid",
  };

  try {
    await submitEntry(payload);
    pendingEntry = null;
    showConfirmation(payload.entries, payload.amount, payload.entryId);
  } catch (err) {
    console.error(err);
    setPayStatus(
      "Payment succeeded but we couldn't save your entry. Please contact us with reference " +
        `${athData.referenceNumber || "N/A"}.`,
      "error"
    );
  }
}

init();
