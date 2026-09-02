import { BOOKING_ENDPOINT } from "./booking-config.mjs";
import { buildFbc, createEventId, getCookie, isTrustedReply, normalizeEmail, validateBooking } from "./booking-core.mjs";

const form = document.querySelector("#booking-form");
const frame = document.querySelector('iframe[name="booking-response"]');
const submit = document.querySelector("#submit-booking");
const status = document.querySelector("#submit-status");
const fallback = document.querySelector("#booking-fallback");
const crisis = document.querySelector("#crisis-resources");
let eventId = "";
let pending = null;
let timeoutId = 0;

form.action = BOOKING_ENDPOINT;

for (const button of document.querySelectorAll("[data-safety]")) {
  button.addEventListener("click", () => {
    const clear = button.dataset.safety === "clear";
    form.hidden = !clear;
    crisis.hidden = clear;
    if (clear) form.elements.startedAt.value = String(Date.now());
  });
}

function checked(name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
}

function currentInput() {
  return {
    displayName: form.elements.displayName.value,
    email: normalizeEmail(form.elements.email.value),
    stuckText: form.elements.stuckText.value,
    topic: form.elements.topic.value,
    goals: checked("goals"),
    availability: checked("availability"),
    adultConfirmed: form.elements.adultConfirmed.checked,
    taiwanConfirmed: form.elements.taiwanConfirmed.checked,
    consentConfirmed: form.elements.consentConfirmed.checked
  };
}

function showErrors(errors) {
  for (const node of form.querySelectorAll(".field-error")) node.textContent = "";
  for (const [name, message] of Object.entries(errors)) document.querySelector(`#${name}-error`).textContent = message;
  const first = Object.keys(errors)[0];
  if (first) form.elements[first]?.focus();
}

function unlock(message) {
  clearTimeout(timeoutId);
  pending = null;
  submit.disabled = false;
  submit.textContent = "重新送出第一階段盤點";
  status.textContent = message;
  fallback.hidden = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = currentInput();
  const errors = validateBooking(input);
  showErrors(errors);
  if (Object.keys(errors).length) return;
  if (!eventId) eventId = createEventId();
  form.elements.eventId.value = eventId;
  form.elements.sourceUrl.value = window.location.href;
  form.elements.submittedAt.value = String(Date.now());
  form.elements.fbp.value = getCookie("_fbp", document.cookie);
  form.elements.fbc.value = getCookie("_fbc", document.cookie) || buildFbc(window.location.href);
  submit.disabled = true;
  submit.textContent = "送出中…";
  status.textContent = "正在安全送出，請不要關閉頁面。";
  fallback.hidden = true;
  pending = { iframeWindow: frame.contentWindow, eventId };
  timeoutId = window.setTimeout(() => unlock("連線逾時，內容仍保留在畫面中，請重試或使用備援表單。"), 15000);
  HTMLFormElement.prototype.submit.call(form);
});

window.addEventListener("message", (event) => {
  if (!pending || !isTrustedReply(event, pending)) return;
  clearTimeout(timeoutId);
  if (!event.data.ok) {
    unlock(event.data.message || "目前無法送出，請稍後重試。");
    return;
  }
  window.sessionStorage.setItem(`rongxin:lead:${eventId}`, "confirmed");
  window.location.assign(`/thank-you.html?event_id=${encodeURIComponent(eventId)}`);
});
