# Booking intake Apps Script deployment

This directory is the source of truth for the owned booking form's Google Apps Script receiver. It is intentionally kept free of credentials. Do not deploy from a local working tree until the checks below pass.

## Script Properties

Open **Project Settings → Script Properties** in the spreadsheet-bound Apps Script project and create these properties exactly:

| Property | Value or handling |
| --- | --- |
| `SPREADSHEET_ID` | Copy the ID from the existing response sheet URL. Never commit or store the ID in the repository. |
| `ALLOWED_ORIGIN` | `https://rongxinshenyu.com` |
| `ADMIN_EMAIL` | `anchen918@gmail.com` |
| `META_PIXEL_ID` | `4400969670158242` |
| `META_GRAPH_VERSION` | `v22.0` |
| `META_CAPI_TOKEN` | The user stores the token directly in Script Properties. Never put it in the repository or chat. |
| `META_TEST_EVENT_CODE` | Optional and temporary. Set it only for Meta Test Events, then delete `META_TEST_EVENT_CODE` after testing. |

Script Properties are the only approved location for the CAPI credential; never place secrets in the repository, deployment notes, logs, or chat.

## Deployment

1. Open the existing response spreadsheet and choose **Extensions → Apps Script**. This creates or opens the spreadsheet-bound project that must remain attached to the response sheet.
2. Copy the complete local `Code.gs` into the editor. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**, then replace the manifest with the complete local `appsscript.json`.
3. Add the Script Properties above. Do not paste secret values into source code.
4. Save the project, run an authorized function once if prompted, and review the requested scopes. The deployer must authorize spreadsheet access, external requests, email sending, and script storage.
5. Choose **Deploy → New deployment → Web app** and create a versioned deployment. Set **Execute as** to the deployer and **Who has access** to **Anyone**.
6. Copy the official production Web app URL ending in `/exec` into the website release configuration. Never publish or test the public form with the editor-only `/dev` URL.

Every code or manifest update requires a new versioned deployment. Do not silently edit the production version in place.

## Verification before release

Run the local functional suite:

```bash
node --test test/booking-apps-script.test.mjs test/booking-core.test.mjs
```

The expected baseline is **33 tests passing**. Those tests cover the current **17-column** response model, including formula safety for sheet-bound public strings, separate **Meta CAPI** and **notification** statuses, the deterministic **submission fingerprint**, and **lock-fenced** effects that hold the lock across each external action and its durable status transition.

Also confirm all of the following against a non-production test submission before releasing the booking page:

- The response sheet contains the exact 17-column header and a new row with independent Meta CAPI and notification state cells.
- Formula-like input is stored as text, not evaluated as a spreadsheet formula.
- Reusing the same `event_id` with the same submission fingerprint is idempotent; changing a bound field is rejected as a conflicting duplicate.
- Meta receives only the approved `Lead` payload and the admin email contains the minimal notification fields.
- A temporary Meta test event is visible if `META_TEST_EVENT_CODE` was used; remove that property immediately afterward.
- The production iframe receives its response from the official `/exec` URL and no credential appears in browser, Apps Script, or repository logs. Run the repository's credential audit before release; a clean result produces no matches.

## Rollback

- Keep the existing **Google Form** and its **response sheet** intact throughout rollout; do not delete historical responses or the current data collection path.
- Keep the Google Form URL available as the **fallback form**.
- If the owned flow fails, revert the **booking release** to the last known-good site version and point the call to action back to the fallback form.
- In Apps Script, switch the Web app deployment back to its **prior version** instead of editing or deleting response data.
- Never reenable the old Pixel `853091474317806` trigger without a **separate decision**. It belongs to a different Meta asset and is not part of this rollback.

Deployment, authorization, test events, trigger changes, and rollback activation are manual production operations. They are not performed by the repository tests.
