import test from "node:test";
import assert from "node:assert/strict";

let importId = 0;

class FakeElement {
  constructor(properties = {}) {
    Object.assign(this, properties);
    this.listeners = new Map();
    this.attributes = new Map();
    this.focused = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener({ target: this, ...event });
  }

  focus() {
    this.focused = true;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function group(inputs) {
  Object.defineProperty(inputs, "value", {
    get() {
      return inputs.find((input) => input.checked)?.value || "";
    }
  });
  return inputs;
}

async function loadController({ sessionStorageThrows = false } = {}) {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalFormElement = globalThis.HTMLFormElement;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalDateNow = Date.now;
  const submissions = [];
  const assigned = [];
  const timeouts = new Map();
  const clearedTimeouts = [];
  const messageListeners = [];
  let nextTimeoutId = 1;
  let now = 10_000;

  class FakeHtmlFormElement extends FakeElement {
    submit() {
      const value = (control) => control.disabled ? undefined : control.value;
      const checked = (control) => !control.disabled && control.checked;
      submissions.push({
        eventId: this.elements.eventId.value,
        sourceUrl: this.elements.sourceUrl.value,
        consentVersion: this.elements.consentVersion.value,
        startedAt: this.elements.startedAt.value,
        submittedAt: this.elements.submittedAt.value,
        fbp: this.elements.fbp.value,
        fbc: this.elements.fbc.value,
        displayName: value(this.elements.displayName),
        email: value(this.elements.email),
        stuckText: value(this.elements.stuckText),
        topic: topics.find(checked)?.value,
        goals: goals.filter(checked).map((input) => input.value),
        availability: availability.filter(checked).map((input) => input.value),
        adultConfirmed: checked(this.elements.adultConfirmed),
        taiwanConfirmed: checked(this.elements.taiwanConfirmed),
        consentConfirmed: checked(this.elements.consentConfirmed)
      });
    }
  }

  const input = (name, value = "") => new FakeElement({ name, value, checked: false });
  const displayName = input("displayName", "小榮");
  const email = input("email", "USER@example.com ");
  const stuckText = input("stuckText", "我在工作與家人期待之間反覆拉扯，不知道下一步怎麼選。");
  const topics = group([input("topic", "行動"), input("topic", "關係")]);
  topics[0].checked = true;
  const goals = group([input("goals", "釐清方向"), input("goals", "具體行動")]);
  goals[0].checked = true;
  const availability = group([input("availability", "平日晚上"), input("availability", "目前先不預約")]);
  availability[0].checked = true;
  const adultConfirmed = input("adultConfirmed", "true");
  const taiwanConfirmed = input("taiwanConfirmed", "true");
  const consentConfirmed = input("consentConfirmed", "true");
  adultConfirmed.checked = taiwanConfirmed.checked = consentConfirmed.checked = true;
  const errors = Object.fromEntries(
    ["displayName", "email", "stuckText", "topic", "goals", "availability", "adultConfirmed", "taiwanConfirmed", "consentConfirmed"]
      .map((name) => [name, new FakeElement({ textContent: "" })])
  );

  const form = new FakeHtmlFormElement({ hidden: true, action: "" });
  form.elements = {
    eventId: input("eventId"),
    sourceUrl: input("sourceUrl"),
    consentVersion: input("consentVersion", "2026-09-01"),
    startedAt: input("startedAt"),
    submittedAt: input("submittedAt"),
    fbp: input("fbp"),
    fbc: input("fbc"),
    displayName,
    email,
    stuckText,
    topic: topics,
    goals,
    availability,
    adultConfirmed,
    taiwanConfirmed,
    consentConfirmed
  };
  const groups = { topic: topics, goals, availability };
  form.querySelectorAll = (selector) => {
    if (selector === ".field-error") return Object.values(errors);
    if (selector === 'input:not([type="hidden"]), textarea, select, button') {
      return [displayName, email, stuckText, ...topics, ...goals, ...availability, adultConfirmed, taiwanConfirmed, consentConfirmed, submit];
    }
    const allMatch = selector.match(/^\[name="([^"]+)"\]$/);
    if (allMatch) return groups[allMatch[1]] || [];
    const match = selector.match(/^\[name="([^"]+)"\]:checked$/);
    return match ? (groups[match[1]] || []).filter((item) => item.checked) : [];
  };

  const frame = new FakeElement({ contentWindow: {} });
  const submit = new FakeElement({ disabled: false, textContent: "送出第一階段盤點" });
  const status = new FakeElement({ textContent: "" });
  const fallback = new FakeElement({ hidden: true });
  const crisis = new FakeElement({ hidden: true });
  const clearSafety = new FakeElement({ dataset: { safety: "clear" }, disabled: false });
  const urgentSafety = new FakeElement({ dataset: { safety: "urgent" }, disabled: false });
  const bySelector = new Map([
    ["#booking-form", form],
    ['iframe[name="booking-response"]', frame],
    ["#submit-booking", submit],
    ["#submit-status", status],
    ["#booking-fallback", fallback],
    ["#crisis-resources", crisis]
  ]);
  const document = {
    cookie: "_fbp=fb.1.10.20",
    querySelector(selector) {
      if (bySelector.has(selector)) return bySelector.get(selector);
      const match = selector.match(/^#(.+)-error$/);
      return match ? errors[match[1]] : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-safety]" ? [clearSafety, urgentSafety] : [];
    }
  };
  const window = {
    location: {
      href: "https://rongxinshenyu.com/booking.html?fbclid=abc",
      assign(url) {
        assigned.push(url);
      }
    },
    sessionStorage: {
      setItem() {
        if (sessionStorageThrows) throw new Error("storage blocked");
      }
    },
    setTimeout(callback) {
      const id = nextTimeoutId++;
      timeouts.set(id, callback);
      return id;
    },
    addEventListener(type, listener) {
      if (type === "message") messageListeners.push(listener);
    }
  };

  globalThis.document = document;
  globalThis.window = window;
  globalThis.HTMLFormElement = FakeHtmlFormElement;
  globalThis.clearTimeout = (id) => {
    clearedTimeouts.push(id);
    timeouts.delete(id);
  };
  Date.now = () => {
    now += 10_000;
    return now;
  };

  try {
    await import(`../scripts/booking-page.mjs?runtime-test=${importId++}`);
  } catch (error) {
    cleanup();
    throw error;
  }

  function cleanup() {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.HTMLFormElement = originalFormElement;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalDateNow;
  }

  function submitForm() {
    form.dispatch("submit", { preventDefault() {} });
  }

  function change(target) {
    target.dispatch("change");
    form.dispatch("change", { target });
  }

  function edit(target, value) {
    if (target.disabled) return;
    target.value = value;
    target.dispatch("input");
    form.dispatch("input", { target });
  }

  function reply(eventId, ok = true) {
    const event = {
      source: frame.contentWindow,
      origin: "https://n-abcd.script.googleusercontent.com",
      data: { type: "rongxin-booking", eventId, ok }
    };
    for (const listener of messageListeners) listener(event);
  }

  function runLatestTimeout() {
    const entry = [...timeouts.entries()].at(-1);
    assert.ok(entry, "expected an active timeout");
    timeouts.delete(entry[0]);
    entry[1]();
  }

  return {
    cleanup,
    form,
    submitForm,
    change,
    edit,
    reply,
    runLatestTimeout,
    submissions,
    assigned,
    displayName,
    topics,
    availability,
    clearSafety,
    urgentSafety,
    crisis,
    submit,
    status,
    fallback,
    editableControls: form.querySelectorAll('input:not([type="hidden"]), textarea, select, button'),
    errors,
    clearedTimeouts
  };
}

test("retries an immutable snapshot and rotates identity after form changes", async (t) => {
  const page = await loadController();
  t.after(page.cleanup);
  page.clearSafety.dispatch("click");
  page.submitForm();
  const first = structuredClone(page.submissions[0]);
  page.runLatestTimeout();
  page.submitForm();
  assert.deepEqual(page.submissions[1], first);

  page.runLatestTimeout();
  page.edit(page.displayName, "新稱呼");
  page.submitForm();
  const changed = page.submissions[2];
  assert.notEqual(changed.eventId, first.eventId);
  page.reply(first.eventId);
  assert.deepEqual(page.assigned, []);
  page.reply(changed.eventId);
  assert.deepEqual(page.assigned, [`/thank-you.html?event_id=${encodeURIComponent(changed.eventId)}`]);
});

test("focuses the first control in an invalid grouped field", async (t) => {
  const page = await loadController();
  t.after(page.cleanup);
  page.clearSafety.dispatch("click");
  page.topics[0].checked = false;
  assert.doesNotThrow(() => page.submitForm());
  assert.equal(page.errors.topic.textContent, "請選擇一個主要卡點。");
  assert.equal(page.topics[0].focused, true);
});

test("keeps no-booking availability mutually exclusive in the UI", async (t) => {
  const page = await loadController();
  t.after(page.cleanup);
  const [concrete, noBooking] = page.availability;
  noBooking.checked = true;
  page.change(noBooking);
  assert.equal(concrete.checked, false);
  concrete.checked = true;
  page.change(concrete);
  assert.equal(noBooking.checked, false);
});

test("safety choices move focus while idle and cannot replace an in-flight choice", async (t) => {
  const page = await loadController();
  t.after(page.cleanup);
  page.clearSafety.dispatch("click");
  assert.equal(page.clearSafety.getAttribute("aria-pressed"), "true");
  assert.equal(page.displayName.focused, true);
  page.urgentSafety.dispatch("click");
  assert.equal(page.urgentSafety.getAttribute("aria-pressed"), "true");
  assert.equal(page.crisis.focused, true);
  assert.equal(page.form.hidden, true);
  assert.equal(page.crisis.hidden, false);
  page.clearSafety.dispatch("click");
  page.submitForm();
  const eventId = page.submissions[0].eventId;
  page.urgentSafety.dispatch("click");
  assert.equal(page.clearSafety.getAttribute("aria-pressed"), "true");
  assert.equal(page.form.hidden, false);
  assert.equal(page.crisis.hidden, true);
  page.reply(eventId);
  assert.deepEqual(page.assigned, [`/thank-you.html?event_id=${encodeURIComponent(eventId)}`]);
});

test("redirects after success even when session storage is unavailable", async (t) => {
  const page = await loadController({ sessionStorageThrows: true });
  t.after(page.cleanup);
  page.clearSafety.dispatch("click");
  page.submitForm();
  const eventId = page.submissions[0].eventId;
  assert.doesNotThrow(() => page.reply(eventId));
  assert.deepEqual(page.assigned, [`/thank-you.html?event_id=${encodeURIComponent(eventId)}`]);
});

test("locks every control while one iframe submission is pending and unlocks the same retry", async (t) => {
  const page = await loadController();
  t.after(page.cleanup);
  page.clearSafety.dispatch("click");
  page.submitForm();
  const first = structuredClone(page.submissions[0]);
  assert.equal(first.displayName, "小榮");
  assert.equal(first.topic, "行動");
  assert.deepEqual(first.goals, ["釐清方向"]);
  assert.equal(page.editableControls.every((control) => control.disabled), true);
  assert.equal(page.clearSafety.disabled, true);
  assert.equal(page.urgentSafety.disabled, true);

  page.edit(page.displayName, "送出期間不可改");
  page.submitForm();
  page.urgentSafety.dispatch("click");
  assert.equal(page.displayName.value, "小榮");
  assert.equal(page.submissions.length, 1);
  assert.equal(page.form.hidden, false);
  assert.equal(page.crisis.hidden, true);

  page.runLatestTimeout();
  assert.equal(page.editableControls.every((control) => !control.disabled), true);
  assert.equal(page.clearSafety.disabled, false);
  assert.equal(page.urgentSafety.disabled, false);
  page.submitForm();
  assert.equal(page.submissions.length, 2);
  assert.deepEqual(page.submissions[1], first);
});
