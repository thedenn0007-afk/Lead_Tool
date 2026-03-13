# LeadTool Local Helper

This helper lets the website run Google Maps scraping locally on a user's machine and download the CSV through Chrome without saving leads to any backend database.

## What it does

- Starts a local HTTP server on `http://127.0.0.1:47831`
- Accepts scrape requests from `find.html`
- Runs Playwright locally
- Generates a CSV in `local-helper/tmp`
- Streams the CSV back to the browser for a normal Chrome download

## Install

1. Install Node.js 20+
2. Open a terminal in `local-helper`
3. Run `npm install`
4. Run `npm start`
5. Open `find.html` and use the `Check Helper` button

## API

- `GET /health`
- `POST /scrapes`
- `GET /scrapes/:id`
- `POST /scrapes/:id/cancel`
- `GET /scrapes/:id/download`

## Notes

- This is a local-only helper. It should not be exposed to the internet.
- CORS is restricted to local file origins and localhost by default.
- Generated CSV files are temporary and can be deleted after use.
