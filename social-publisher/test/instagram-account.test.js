import assert from "node:assert/strict";
import test from "node:test";

import { resolveInstagramUserId } from "../src/instagram-account.js";

test("uses the configured Instagram ID when Meta omits the Page link", () => {
  assert.equal(
    resolveInstagramUserId({
      page: { id: "page_1", instagramBusinessAccount: null },
      configuredInstagramUserId: "ig_configured",
      selectedInstagramUserId: null
    }),
    "ig_configured"
  );
});

test("prefers a live Page link, then configured ID, then stored selection", () => {
  assert.equal(
    resolveInstagramUserId({
      page: { instagramBusinessAccount: { id: "ig_linked" } },
      configuredInstagramUserId: "ig_configured",
      selectedInstagramUserId: "ig_stored"
    }),
    "ig_linked"
  );

  assert.equal(
    resolveInstagramUserId({
      page: {},
      configuredInstagramUserId: "ig_configured",
      selectedInstagramUserId: "ig_stored"
    }),
    "ig_configured"
  );

  assert.equal(
    resolveInstagramUserId({
      page: {},
      configuredInstagramUserId: "",
      selectedInstagramUserId: "ig_stored"
    }),
    "ig_stored"
  );
});
