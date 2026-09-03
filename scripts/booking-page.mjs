import { BOOKING_ENDPOINT } from "./booking-config.mjs";
import { buildFbc, createEventId, getCookie, isConfirmedStatus, isTrustedReply, normalizeEmail, validateBooking } from "./booking-core.mjs";

const form = document.querySelector("#booking-form");
const frame = document.querySelector('iframe[name="booking-response"]');
const submit = document.querySelector("#submit-booking");
const status = document.querySelector("#submit-status");
const fallback = document.querySelector("#booking-fallback");
const crisis = document.querySelector("#crisis-resources");
const safetyButtons = [...document.querySelectorAll("[data-safety]")];
const availabilityInputs = [...form.querySelectorAll('[name="availability"]')];
const editableControls = [...form.querySelectorAll('input:not([type="hidden"]), textarea, select, button')];
const lockableControls = [...editableControls, ...safetyButtons];
const originalDisabled = new Map();
let safetyState = "";
let snapshot = null;
let pending = null;
let timeoutId = 0;
let statusPollId = 0;
let controlsLocked = false;

form.action = BOOKING_ENDPOINT;

for (const button of safetyButtons) {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    if (pending) return;
    const clear = button.dataset.safety === "clear";
    for (const option of safetyButtons) option.setAttribute("aria-pressed", String(option === button));
    form.hidden = !clear;
    crisis.hidden = clear;
    if (clear) {
      if (safetyState !== "clear") form.elements.startedAt.value = String(Date.now());
      safetyState = "clear";
      form.elements.displayName.focus();
      return;
    }
    safetyState = "urgent";
    snapshot = null;
    form.elements.eventId.value = "";
    submit.disabled = false;
    submit.textContent = "送出第一階段盤點";
    status.textContent = "";
    fallback.hidden = true;
    crisis.setAttribute("tabindex", "-1");
    crisis.focus();
  });
}

for (const input of availabilityInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    if (input.value === "目前先不預約") {
      for (const option of availabilityInputs) {
        if (option !== input) option.checked = false;
      }
      return;
    }
    const noBooking = availabilityInputs.find((option) => option.value === "目前先不預約");
    if (noBooking) noBooking.checked = false;
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

function sameInput(left, right) {
  if (!left || !right) return false;
  for (const name of ["displayName", "email", "stuckText", "topic", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"]) {
    if (left[name] !== right[name]) return false;
  }
  return ["goals", "availability"].every((name) =>
    left[name].length === right[name].length && left[name].every((value, index) => value === right[name][index])
  );
}

function createSnapshot(input) {
  const immutableInput = Object.freeze({
    ...input,
    goals: Object.freeze([...input.goals]),
    availability: Object.freeze([...input.availability])
  });
  return Object.freeze({
    input: immutableInput,
    eventId: createEventId(),
    sourceUrl: window.location.href,
    consentVersion: form.elements.consentVersion.value,
    startedAt: form.elements.startedAt.value,
    submittedAt: String(Date.now()),
    fbp: getCookie("_fbp", document.cookie),
    fbc: getCookie("_fbc", document.cookie) || buildFbc(window.location.href)
  });
}

function applySnapshot(value) {
  for (const name of ["eventId", "sourceUrl", "consentVersion", "startedAt", "submittedAt", "fbp", "fbc"]) {
    form.elements[name].value = value[name];
  }
}

function showErrors(errors) {
  for (const node of form.querySelectorAll(".field-error")) node.textContent = "";
  for (const [name, message] of Object.entries(errors)) document.querySelector(`#${name}-error`).textContent = message;
  const first = Object.keys(errors)[0];
  if (!first) return;
  const control = form.elements[first];
  if (typeof control?.focus === "function") control.focus();
  else if (typeof control?.[0]?.focus === "function") control[0].focus();
}

function stopWaitingForReply() {
  if (timeoutId) clearTimeout(timeoutId);
  if (statusPollId) clearInterval(statusPollId);
  timeoutId = 0;
  statusPollId = 0;
  pending = null;
}

function confirmSubmission(eventId) {
  stopWaitingForReply();
  try {
    window.sessionStorage.setItem(`rongxin:lead:${eventId}`, "confirmed");
  } catch {
    // A blocked storage write must not trap a confirmed lead on this page.
  }
  window.location.assign(`/thank-you.html?event_id=${encodeURIComponent(eventId)}`);
}

async function probeSubmissionStatus() {
  if (!pending) return;
  const expectedEventId = pending.eventId;
  const endpoint = new URL(BOOKING_ENDPOINT);
  endpoint.searchParams.set("event_id", expectedEventId);
  endpoint.searchParams.set("_", String(Date.now()));
  try {
    const response = await window.fetch(endpoint.href, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!pending || pending.eventId !== expectedEventId || !isConfirmedStatus(data, pending)) return;
    confirmSubmission(expectedEventId);
  } catch {
    // The interval retries until the normal timeout unlocks the form.
  }
}

function startStatusPolling() {
  probeSubmissionStatus();
  statusPollId = window.setInterval(probeSubmissionStatus, 2500);
}

function setControlsLocked(locked) {
  if (locked === controlsLocked) return;
  controlsLocked = locked;
  if (locked) {
    originalDisabled.clear();
    for (const control of lockableControls) {
      originalDisabled.set(control, control.disabled);
      control.disabled = true;
    }
    return;
  }
  for (const control of lockableControls) control.disabled = originalDisabled.get(control) || false;
  originalDisabled.clear();
}

function unlock(message) {
  stopWaitingForReply();
  setControlsLocked(false);
  submit.disabled = false;
  submit.textContent = "重新送出第一階段盤點";
  status.textContent = message;
  fallback.hidden = false;
}

function invalidateChangedSnapshot() {
  if (pending) return;
  if (!snapshot || sameInput(currentInput(), snapshot.input)) return;
  snapshot = null;
  form.elements.eventId.value = "";
  submit.disabled = false;
  submit.textContent = "送出第一階段盤點";
  status.textContent = "內容已變更，請重新送出。";
}

form.addEventListener("input", invalidateChangedSnapshot);
form.addEventListener("change", invalidateChangedSnapshot);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (pending) return;
  const input = currentInput();
  const errors = validateBooking(input);
  showErrors(errors);
  if (Object.keys(errors).length) return;
  if (!snapshot || !sameInput(input, snapshot.input)) snapshot = createSnapshot(input);
  applySnapshot(snapshot);
  submit.textContent = "送出中…";
  status.textContent = "正在安全送出，請不要關閉頁面。";
  fallback.hidden = true;
  pending = { iframeWindow: frame.contentWindow, eventId: snapshot.eventId };
  timeoutId = window.setTimeout(() => unlock("連線逾時，內容仍保留在畫面中，請重試或使用備援表單。"), 15000);
  HTMLFormElement.prototype.submit.call(form);
  setControlsLocked(true);
  startStatusPolling();
});

window.addEventListener("message", (event) => {
  if (!pending || !isTrustedReply(event, pending)) return;
  const confirmedEventId = pending.eventId;
  if (!event.data.ok) {
    unlock(event.data.message || "目前無法送出，請稍後重試。");
    return;
  }
  confirmSubmission(confirmedEventId);
});
