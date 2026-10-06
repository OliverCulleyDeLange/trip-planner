# Trip Planner

A collaborative group-trip planner deployed on Cloudflare Workers. There are no accounts or login: anyone with a trip's high-entropy URL can join by choosing an existing traveller or adding their name.

Production: <https://oliverdelange.co.uk/trip-planner/>

## Architecture

- Astro 6 application and API routes on Cloudflare Workers
- The application Worker is routed directly at `oliverdelange.co.uk/trip-planner/*`
- A production D1 database plus a separate local database for development
- Relational D1 tables for trips, participants, date options, availability, transport, accommodation, activities and anonymous browser sessions
- Optimistic revision checks reject stale writes with HTTP `409`
- Signed `HttpOnly`, `Secure`, `SameSite=Lax` browser-session cookies remember each browser's selected traveller
- A seeded, publicly viewable `demo` trip is read-only; regenerate its migration after changing demo data with `pnpm db:generate-schema`
- Geoapify requests are proxied by the Worker; its API key is never shipped to browser JavaScript
- Versioned JSON export/import remains available as a user-controlled backup

## Local development

Requires Node.js 22.12 or newer and pnpm.

1. Install dependencies: `pnpm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and set local values. Do not commit this file.
3. Apply the local schema: `pnpm db:migrate:local`.
4. Build once with `pnpm build`.
5. Run the Worker locally with `pnpm preview`.

`astro dev` uses the same anonymous trip-identity flow as production.

## Verification

```sh
pnpm check
pnpm test
pnpm build
```

## Database migrations

Create migrations in `migrations/` and commit them with the application change. Apply them independently:

```sh
pnpm db:migrate:local
pnpm db:migrate:production
```

The production D1 database ID and `oliverdelange` Cloudflare account ID are pinned in `wrangler.jsonc` so commands cannot silently target another account or database.

## Secrets

Production requires `COOKIE_SIGNING_SECRET`. `GEOAPIFY_API_KEY` is optional; without it, location search and geocoding return HTTP `503` while the rest of the planner remains available.

```sh
pnpm wrangler secret put COOKIE_SIGNING_SECRET --env=""
# Optional
pnpm wrangler secret put GEOAPIFY_API_KEY --env=""
```

Never use a `PUBLIC_` variable for the Geoapify key.

## Deployment and CI

Manual deployments:

```sh
pnpm deploy:production
```

`.github/workflows/ci.yml` checks every pull request and deploys `main` to production. Add a narrowly scoped `CLOUDFLARE_API_TOKEN` to the GitHub production environment before enabling automatic deploys.

## Recovery

D1 Time Travel is the primary service-level recovery mechanism. Inspect available restore points before restoring:

```sh
pnpm wrangler d1 time-travel info trip-scheduler-production
pnpm wrangler d1 time-travel restore trip-scheduler-production --timestamp <RFC3339 timestamp>
```

Use **Export** in the trip header for a portable JSON backup. Import always assigns a new private trip ID so an old or previously shared ID is not reused.
