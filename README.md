# Trip Planner

A collaborative group-trip planner deployed on Cloudflare Workers. Trips are shared through a private, high-entropy URL: anyone with the trip ID can view and edit the trip.

Production: <https://trip-scheduler.oliver-trip-planner.workers.dev>

## Architecture

- Astro 6 application and API routes on Cloudflare Workers
- Separate production and preview D1 databases
- Relational D1 tables for trips, participants, date options, availability, transport, accommodation, activities and anonymous browser sessions
- Optimistic revision checks reject stale writes with HTTP `409`
- Signed `HttpOnly`, `Secure`, `SameSite=Lax` browser-session cookies support identity and rate limiting
- Geoapify requests are proxied by the Worker; its API key is never shipped to browser JavaScript
- Versioned JSON export/import remains available as a user-controlled backup

## Local development

Requires Node.js 22.12 or newer and pnpm.

1. Install dependencies: `pnpm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and set local values. Do not commit this file.
3. Apply the local schema: `pnpm db:migrate:local`.
4. Build once with `pnpm build`.
5. Run the Worker locally with `pnpm preview`.

`astro dev` can render the UI, but `wrangler dev` is recommended because it provides the D1 and secret bindings used by the API.

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
pnpm db:migrate:preview
pnpm db:migrate:production
```

Preview and production use different D1 database IDs in `wrangler.jsonc`. The Cloudflare account ID is pinned there so commands cannot silently target another account.

## Secrets

Production and preview each require `COOKIE_SIGNING_SECRET` and `GEOAPIFY_API_KEY`:

```sh
pnpm wrangler secret put COOKIE_SIGNING_SECRET --env=""
pnpm wrangler secret put GEOAPIFY_API_KEY --env=""
pnpm wrangler secret put COOKIE_SIGNING_SECRET --env preview
pnpm wrangler secret put GEOAPIFY_API_KEY --env preview
```

Never use a `PUBLIC_` variable for the Geoapify key.

## Deployment and CI

Manual deployments:

```sh
pnpm deploy:preview
pnpm deploy:production
```

`.github/workflows/ci.yml` checks every pull request, deploys pull requests to the preview Worker, and deploys `main` to production. Add a narrowly scoped `CLOUDFLARE_API_TOKEN` to the GitHub preview and production environments before enabling automatic deploys.

## Recovery

D1 Time Travel is the primary service-level recovery mechanism. Inspect available restore points before restoring:

```sh
pnpm wrangler d1 time-travel info trip-scheduler-production
pnpm wrangler d1 time-travel restore trip-scheduler-production --timestamp <RFC3339 timestamp>
```

Use **Export** in the trip header for a portable JSON backup. Import always assigns a new private trip ID so an old or previously shared ID is not reused.
