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

The configuration check requires either an ignored `social-publisher/.env` file or the current shell to safely provide the variables listed in `social-publisher/.env.example`. If neither source is ready, report this check as **SKIPPED — environment is not prepared**, prepare the local environment first, and do not claim that a clean checkout passes configuration validation. Never commit or print secret values.

Run each command separately and stop if any command exits non-zero.

```bash
node --test test/booking-*.test.mjs
```

```bash
npm --prefix social-publisher test
```

```bash
npm --prefix social-publisher run check
```

```bash
node scripts/audit-booking-secrets.mjs
```

```bash
git diff --check main...HEAD
```

```bash
git status --short
```
