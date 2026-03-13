# Lead_Tool

LeadTool is a lightweight lead-finding app built with static HTML/CSS/JS.

## Main pages

- `find.html`
- `auto.html`
- `guide.html`
- `settings.html`

## Local Playwright helper

The repo now includes a local runner in `local-helper/` so the website can trigger a local Playwright scrape and let Chrome download the CSV directly.

### Start the helper

1. Open a terminal in `local-helper`
2. Run `npm install`
3. Run `npm start`
4. Open `find.html`
5. Click `Check Helper`, then `Run Local Scrape`

The helper listens on `http://127.0.0.1:47831`.

## Notes

- CSV files are ignored by Git
- Scraped CSVs are meant to download to the user's machine
- No backend database is required for the local-helper flow
