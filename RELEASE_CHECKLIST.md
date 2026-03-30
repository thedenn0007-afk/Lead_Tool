# LeadTool Release Checklist

## Scope Freeze
- [ ] Core flows unchanged: lead capture, business type, specific area, search/filter, export.
- [ ] No unreviewed feature additions after freeze.

## Security Gate
- [ ] Local helper `/scrapes*` requires trusted Origin and helper token.
- [ ] Unauthorized helper calls return `403`.
- [ ] Apify token is only sent via `Authorization: Bearer` header.
- [ ] No unsafe user/external string injection via dynamic `innerHTML`.

## Reliability Gate
- [ ] Local helper job cleanup works (TTL + max retained jobs + temp CSV cleanup).
- [ ] Scraper always closes page/context/browser in `finally`.
- [ ] Invalid payloads return `400` with deterministic error messages.
- [ ] Cancel path tested for helper and Apify.

## UX + Accessibility Gate
- [ ] Sidebar icon visibility verified at `<=768px`.
- [ ] Main forms have proper label associations.
- [ ] Clickable chips/checklists are keyboard accessible.
- [ ] Replace-all import flow has explicit confirmation.

## SEO + Analytics Gate
- [ ] Metadata exists on `index.html`, `find.html`, `auto.html`, `guide.html`, `settings.html`.
- [ ] `robots.txt` and `sitemap.xml` are present and valid.
- [ ] JSON-LD exists for SoftwareApplication/WebSite.
- [ ] Funnel events visible: query built, maps opened, scrape start/success/fail/cancel, import, export.

## Smoke + Device Matrix
- [ ] `node scripts/smoke-checks.mjs` passes.
- [ ] Desktop: Chrome + Edge pass core flow checks.
- [ ] Mobile: Android Chrome + iPhone Safari pass core flow checks.

## Rollback
- [ ] Keep previous deploy artifact/tag available.
- [ ] If smoke fails post-deploy, roll back immediately to prior stable release.
- [ ] Record incident notes before re-release.

## Go / No-Go
- [ ] Product owner sign-off.
- [ ] Engineering sign-off.
- [ ] Launch time and owner confirmed.
