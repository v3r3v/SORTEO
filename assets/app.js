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

  // Optional: once your payment tool is ready, set this to the URL it needs
  // (or leave blank to just show a "we'll be in touch" message for now).
  // {entryId}, {amount}, {name}, {email} placeholders are replaced automatically.
  paymentUrl: "",
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
const confirmationEl = document.getElementById("confirmation");
const confirmationText = document.getElementById("confirmationText");
const entryIdText = document.getElementById("entryIdText");
const paymentLink = document.getElementById("paymentLink");
const paymentPendingNote = document.getElementById("paymentPendingNote");

let selectedAmount = null;

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

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(values[key] ?? ""));
}

function showConfirmation(payload) {
  form.hidden = true;
  confirmationEl.hidden = false;

  const entries = payload.entries;
  confirmationText.textContent = `We've saved your request for ${entries} ${
    entries === 1 ? "entry" : "entries"
  } ($${payload.amount}). Complete payment to lock them in.`;
  entryIdText.textContent = payload.entryId;

  if (CONFIG.paymentUrl) {
    paymentLink.href = fillTemplate(CONFIG.paymentUrl, payload);
    paymentLink.hidden = false;
    paymentPendingNote.textContent = "";
  } else {
    paymentPendingNote.textContent =
      "Payment step is being set up. We'll reach out with instructions to complete your purchase.";
  }
}

form.addEventListener("submit", async (event) => {
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

  const entries = Math.floor(selectedAmount / CONFIG.pricePerEntry);
  const payload = {
    entryId: crypto.randomUUID(),
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
    amount: selectedAmount,
    entries,
  };

  submitBtn.disabled = true;
  setStatus("Submitting…", null);

  try {
    await submitEntry(payload);
    showConfirmation(payload);
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong saving your entry. Please try again.", "error");
    submitBtn.disabled = false;
  }
});

init();
