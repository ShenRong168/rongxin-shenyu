# 榮心紳語 Website

Static first version for a warm botanical boutique-style communication, inner-stability, and life debugging service website.

Public URL:

`https://rongxinshenyu.com/`

## Files

- `index.html` - site content and structure
- `styles.css` - visual system and responsive layout
- `assets/hero-botanical-lounge.png` - generated hero image
- `assets/logo-mark.svg` - simple wood/leaf logo mark
- `robots.txt` and `sitemap.xml` - basic SEO files

## Edit Notes

- Google Form fallback link is retained only in `booking.html` and includes a privacy notice.
- Service price, booking terms, service boundaries, and privacy notice are published on the site.
- Static article previews are in the `#articles` section.
- Keep the service distinction clear: coaching/communication support is separate from licensed psychological counseling or therapy.

## Booking Flow

- Stage 1: `https://rongxinshenyu.com/booking.html` collects the approved short intake, writes「官網初步盤點」through `apps-script/booking-intake/Code.gs`, sends the owner a minimal Email, and reports deduplicated browser/server Meta `Lead` events.
- Stage 2: after manual review, the existing full Google Form collects phone, city, emergency contact, and recording consent. The same form is the Stage 1 failure fallback and is not removed.
- Public Apps Script endpoint: generated in `scripts/booking-config.mjs`; CAPI token and spreadsheet ID remain only in Apps Script Properties.

### Booking Verification

Before running the configuration check, copy `social-publisher/.env.example` to `social-publisher/.env`, add the required values locally, and never commit that file or print its secret values.

Run each command separately and stop if any command exits non-zero.

```bash
node --test test/booking-core.test.mjs test/configure-booking-endpoint.test.mjs test/booking-apps-script.test.mjs test/booking-site.test.mjs
```

```bash
npm --prefix social-publisher test
```

```bash
npm --prefix social-publisher run check
```

```bash
git diff --check
```
