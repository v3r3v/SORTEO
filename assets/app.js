// ---------------------------------------------------------------------------
// Edit these values for your raffle. No other code changes should be needed.
// ---------------------------------------------------------------------------
const CONFIG = {
  prizeTitle: "Win the Prize! 🏆",
  prizeSubtitle: "$7 = 1 entry.",

  // Paste the "Web app" URL you get after deploying apps-script/Code.gs
  // (Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone).
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwvj_SsZ71dkUtn9L-YECk11rihsiRvKxeERw7Nd1e1jocHFAnPnn33YrQ-4hvPEP1c/exec", // must end in /exec — see README step 1

  // ATH Móvil Business "Public Token" (Settings tab in the ATH Business app).
  // This value is meant to be public/client-side — ATH Móvil's own Payment
  // Button widget requires it to be embedded in the page like this.
  athPublicToken: "680b201c4ca668db83c06825b7e7e44cc75ae421",

  // Fixed entry options. Only $7 = 1 entry is enabled for now; the other
  // tiers are kept here, commented out, to re-enable later.
  entryTiers: [
    { entries: 1, amount: 7 },
    // { entries: 2, amount: 10 },
    // { entries: 3, amount: 15 },
  ],

  // Set to { entries: 1, amount: 1 } to temporarily re-enable a cheap $1
  // test tier for testing the real ATH Móvil payment flow (there's no
  // sandbox environment, so testing costs real money). Disabled (null) for
  // production.
  testTier: null,
};
// ---------------------------------------------------------------------------

const form = document.getElementById("entryForm");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const presetAmountsEl = document.getElementById("presetAmounts");
const submitBtn = document.getElementById("submitBtn");
const statusMsg = document.getElementById("statusMsg");
const payStepEl = document.getElementById("payStep");
const paySummaryText = document.getElementById("paySummaryText");
const payStatusMsg = document.getElementById("payStatusMsg");
const backToFormBtn = document.getElementById("backToFormBtn");
const confirmationEl = document.getElementById("confirmation");
const confirmationText = document.getElementById("confirmationText");
const entryIdText = document.getElementById("entryIdText");

let selectedTier = null; // { entries, amount } from CONFIG.entryTiers / CONFIG.testTier
let pendingEntry = null; // { entryId, name, phone, email, amount, entries } set once the user reaches the pay step

// Config object read by ATH Móvil's athmovil_base.js widget. IMPORTANT: the
// widget calls Object.freeze() on this object itself, shortly after page
// load — well before the customer ever reaches the pay step. Mutating it
// later (e.g. on form submit, like this used to do) silently does nothing;
// there's no error, it just sends whatever was here at freeze time. Confirmed
// directly: Object.isFrozen(ATHM_Checkout) is already true seconds after
// load, with zero user interaction.
//
// That means everything here has to be correct from the very start, which
// only works because there's currently a single fixed entry price (see the
// tiers.length guard in init() below). It also means metadata1/metadata2/
// phoneNumber can't carry real per-transaction info (entryId, customer name,
// phone) the way they were meant to — they're stuck with whatever static
// value is set here. Our own entryId/pendingEntry tracking (used for the
// Apps Script save and the pending-payment reconciliation system) doesn't
// depend on these fields, so that's unaffected.
//
// If more than one entry tier is ever needed again, dynamic per-choice
// pricing won't work through this widget as integrated — the amount the
// customer picks in the UI and the amount ATH Móvil actually charges would
// silently diverge, same bug as this one, just relocated. That'd need a
// different approach (e.g. a separately pre-configured button per price).
const athTier = CONFIG.testTier || CONFIG.entryTiers[0];
const ATHM_Checkout = {
  env: "production",
  publicToken: CONFIG.athPublicToken,
  timeout: 600,
  orderType: "",
  theme: "btn",
  lang: "en",
  total: athTier.amount,
  subtotal: athTier.amount,
  tax: 0,
  metadata1: CONFIG.prizeTitle.slice(0, 40),
  metadata2: "",
  items: [
    {
      name: `${athTier.entries} ${athTier.entries === 1 ? "Raffle Entry" : "Raffle Entries"}`,
      description: CONFIG.prizeTitle,
      quantity: 1,
      price: athTier.amount,
      tax: 0,
      metadata: "",
    },
  ],
  phoneNumber: "",
};

function initPrizeCarousel() {
  const track = document.getElementById("prizeCarouselTrack");
  const dotsEl = document.getElementById("prizeCarouselDots");
  if (!track || !dotsEl) return;

  const slides = Array.from(track.children);
  if (slides.length <= 1) return;

  // Force a full decode of every slide's image up front. Without this,
  // slides positioned off-screen by the flex layout at initial paint can be
  // decode-deprioritized by the browser and never actually paint once
  // transformed into view later.
  slides.forEach((slide) => {
    const img = slide.querySelector("img");
    if (img && img.decode) img.decode().catch(() => {});
  });

  let index = 0;
  let autoplayTimer = null;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "prize-carousel-dot";
    dot.setAttribute("aria-label", `Show image ${i + 1} of ${slides.length}`);
    dot.addEventListener("click", () => goTo(i, true));
    dotsEl.appendChild(dot);
  });
  const dots = Array.from(dotsEl.children);

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  }

  function goTo(i, userTriggered) {
    index = (i + slides.length) % slides.length;
    render();
    if (userTriggered) restartAutoplay();
  }

  function restartAutoplay() {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => goTo(index + 1), 4000);
  }

  // Swipe/drag support (mouse + touch, via pointer events). Pointer capture
  // is the important part: without it, pointerup fires on whatever element
  // ends up under the finger at release — if a swipe drifts past the card's
  // edge (easy to do on a narrow phone screen), that's outside the track
  // entirely and this listener never sees it, silently breaking swipes in
  // whichever direction happens to drift off the card more often.
  let dragStartX = null;
  track.addEventListener("pointerdown", (e) => {
    dragStartX = e.clientX;
    track.setPointerCapture(e.pointerId);
    track.classList.add("dragging");
  });
  track.addEventListener("pointerup", (e) => {
    if (dragStartX === null) return;
    const delta = e.clientX - dragStartX;
    dragStartX = null;
    track.classList.remove("dragging");
    if (Math.abs(delta) > 40) goTo(index + (delta < 0 ? 1 : -1), true);
  });
  track.addEventListener("pointercancel", () => {
    dragStartX = null;
    track.classList.remove("dragging");
  });

  track.style.transition = "transform 0.4s ease";
  render();
  restartAutoplay();
}

// ---------------------------------------------------------------------------
// ATH Móvil's widget only tells this page about a payment's outcome if this
// tab is still alive when the customer confirms in the ATH Móvil app — if
// they close the tab, or their phone suspends it in the background, that
// confirmation can be lost even though the payment actually went through
// (see README "Payment integration" for the full explanation). There's no
// webhook and no documented way to get the transaction's `ecommerceId`
// other than by watching the network call the widget itself makes to create
// it — so that's what this does, the moment the customer taps the ATH
// button, well before they ever leave for the app. Once we have it, it's
// sent to Apps Script as a "pending" row that a periodic server-side check
// (Code.gs reconcilePendingPayments) can use to rescue the entry later even
// if this tab never reports back.
//
// This relies on undocumented internals of athmovil_base.js (specifically,
// that it uses fetch or XHR to POST to a URL containing
// "business-transaction/ecommerce/payment"). If ATH Móvil changes how their
// widget makes that call, this stops capturing new pending rows — it fails
// silently (the try/catch below) rather than breaking the actual payment
// flow, but the safety net stops working. Worth spot-checking after any
// noticeable change on ATH's side.
// ---------------------------------------------------------------------------
function watchAthPaymentCreation() {
  const PAYMENT_PATH = "business-transaction/ecommerce/payment";
  let capturedForEntryId = null;

  function handleCaptured(ecommerceId) {
    if (!ecommerceId || !pendingEntry) return;
    if (capturedForEntryId === pendingEntry.entryId) return; // already recorded this attempt
    capturedForEntryId = pendingEntry.entryId;
    recordPendingPayment(pendingEntry, ecommerceId).catch((err) => console.error(err));
  }

  try {
    const originalFetch = window.fetch && window.fetch.bind(window);
    if (originalFetch) {
      window.fetch = function (...args) {
        const result = originalFetch(...args);
        try {
          const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
          if (url.includes(PAYMENT_PATH)) {
            result
              .then((res) => res.clone().json())
              .then((json) => handleCaptured(json && json.data && json.data.ecommerceId))
              .catch(() => {});
          }
        } catch (err) {
          console.error(err);
        }
        return result;
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__isAthPaymentCreate = typeof url === "string" && url.includes(PAYMENT_PATH);
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__isAthPaymentCreate) {
        this.addEventListener("load", () => {
          try {
            const json = JSON.parse(this.responseText);
            handleCaptured(json && json.data && json.data.ecommerceId);
          } catch (err) {
            console.error(err);
          }
        });
      }
      return originalSend.apply(this, args);
    };
  } catch (err) {
    console.error(err);
  }
}

async function recordPendingPayment(entry, ecommerceId) {
  await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "recordPending",
      entryId: entry.entryId,
      name: entry.name,
      phone: entry.phone,
      email: entry.email,
      amount: entry.amount,
      entries: entry.entries,
      ecommerceId,
    }),
  });
}

function init() {
  document.getElementById("prizeTitle").textContent = CONFIG.prizeTitle;
  document.getElementById("prizeSubtitle").textContent = CONFIG.prizeSubtitle;
  initPrizeCarousel();
  watchAthPaymentCreation();

  const tiers = CONFIG.testTier ? [CONFIG.testTier, ...CONFIG.entryTiers] : CONFIG.entryTiers;

  // ATH_Checkout's amount is fixed at freeze time (see the big comment above
  // its declaration) — it's hardcoded to `athTier`. If more than one tier is
  // active, whichever one the customer picks here would NOT necessarily
  // match what ATH Móvil actually charges. Rather than risk silently
  // charging the wrong amount, refuse to render a picker at all until this
  // is fixed in code.
  if (tiers.length > 1) {
    presetAmountsEl.innerHTML = "";
    setFieldError(
      "amountError",
      "Setup error: more than one entry tier is enabled, but this widget only supports a single fixed price safely (see the ATHM_Checkout comment in assets/app.js). Reduce to one tier before going live."
    );
    return;
  }

  // A single tier isn't really a "choice" — showing it as one lonely button
  // next to Get My Entries is redundant. Auto-select it and show the price
  // as plain text instead.
  const tier = tiers[0];
  selectedTier = tier;
  presetAmountsEl.classList.add("single-tier");
  presetAmountsEl.innerHTML = `<span class="single-tier-price">$${tier.amount}</span><span class="single-tier-note">${
    tier.entries
  } ${tier.entries === 1 ? "raffle entry" : "raffle entries"}</span>`;
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

  if (!selectedTier) {
    setFieldError("amountError", "Choose how many entries you'd like.");
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
  const { entries, amount } = selectedTier;
  pendingEntry = {
    entryId: crypto.randomUUID(),
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
    amount,
    entries,
  };

  // NOTE: ATHM_Checkout is already frozen by ATH Móvil's widget by this
  // point (see the comment on its declaration above) — total/items/etc. are
  // fixed at page load and can't be updated per-submission anymore. This
  // step only prepares our own bookkeeping and the display text.

  paySummaryText.textContent = `$${amount} = ${entries} ${entries === 1 ? "entry" : "entries"}`;
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
