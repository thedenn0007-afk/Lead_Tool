# Stateless Deployment (No DB / No File Storage)

## Product behavior
- No server database.
- No cloud file storage.
- Data is processed in-browser and downloaded directly as CSV.

## Frontend hosting (recommended)
1. Push this repo to GitHub.
2. Import project into Vercel or Netlify.
3. Build command: none.
4. Output directory: project root.
5. Deploy and connect your custom domain.

## Optional backend helper note
- `local-helper/` is a local-only companion service and should not be publicly deployed.
- Users run it on their own machine (`npm install && npm start`) when they want local Playwright scrape automation.

## Mobile readiness checks
- Test on Android Chrome and iPhone Safari.
- Confirm form fields, chips, imports, and export/download buttons are usable at 360px+ widths.

## Security baseline
- HTTPS only.
- Keep helper endpoint local (`127.0.0.1`) and token-protected.
- Do not persist API keys beyond session storage.

## CI gate
- GitHub Action `Prelaunch Smoke` runs on every push/PR to `main`.
- Local run: `node scripts/smoke-checks.mjs`.
