# Trip Scheduler

A collaborative group-trip planner. The current front end persists trips in the browser with IndexedDB and supports JSON export/import, so it can be used safely while the shared backend is built.

## Local development

Requires Node.js 22.12 or newer.

1. Copy `.env.example` to `.env.local` and add a browser-restricted Geoapify key.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.

The app is currently a static Astro site and can be deployed on Cloudflare Pages. The production backend will move storage behind repository interfaces to Cloudflare Workers and D1 without changing the UI domain model.

## Data safety

Use **Export** in the trip header to download a versioned JSON backup. Use **Import** to restore it in another browser or after local data loss.
