import { consumeLeadMarker } from "./booking-core.mjs";

const eventId = new URLSearchParams(window.location.search).get("event_id") || "";
try {
  if (consumeLeadMarker(window.sessionStorage, eventId) && typeof window.fbq === "function") {
    window.fbq("track", "Lead", {}, { eventID: eventId });
  }
} catch {
  // Storage can be unavailable under strict privacy settings; the page must remain usable.
}
window.history.replaceState({}, "", "/thank-you.html");
