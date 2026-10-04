# Trip Planner

A collaborative group-trip planner deployed on Cloudflare Workers. Accounts are optional: public-link trips can be viewed and edited by anyone with the high-entropy URL. Owners can sign in with Google or email, restrict a trip to invited accounts, and assign viewer or editor permissions.

Production: <https://trip-scheduler.oliver-trip-planner.workers.dev>

## Architecture

- Astro 6 application and API routes on Cloudflare Workers
- Separate production and preview D1 databases
- Relational D1 tables for trips, participants, date options, availability, transport, accommodation, activities and anonymous browser sessions
- Optimistic revision checks reject stale writes with HTTP `409`
- Signed `HttpOnly`, `Secure`, `SameSite=Lax` browser-session cookies support identity and rate limiting
- Cloudflare Access supplies optional verified account identity; the application never stores passwords
- Per-trip D1 access rules support public-link trips and restricted owner/viewer/editor permissions
- D1 trip memberships power the signed-in “My trips” dashboard
- A seeded, publicly viewable `demo` trip belongs to `olly@oliverdelange.co.uk`; regenerate its migration after changing demo data with `pnpm db:generate-demo`
- Geoapify requests are proxied by the Worker; its API key is never shipped to browser JavaScript
- Versioned JSON export/import remains available as a user-controlled backup

## Local development

Requires Node.js 22.12 or newer and pnpm.

1. Install dependencies: `pnpm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and set local values. Do not commit this file.
3. Apply the local schema: `pnpm db:migrate:local`.
4. Build once with `pnpm build`.
5. Run the Worker locally with `pnpm preview`.

`astro dev` uses the `access.dev` identity in `wrangler.jsonc` so the authenticated experience can be tested locally without contacting Cloudflare Access. The local logout route temporarily suppresses that development identity; signing in again restores it.

## Cloudflare Access

Create one self-hosted Access application for `oliverdelange.co.uk` covering only the account authentication paths:

- `/trip-planner/api/account/*`

Allow authenticated users and enable both the Google identity provider and Cloudflare Access one-time PIN. Keep `/trip-planner/` and every `/trip-planner/api/trips/*` route outside the Access application. The Worker establishes a short-lived signed account session after Access verifies the user, then enforces each trip's D1 visibility and viewer/editor permissions itself. This is required so unlinked public trips remain anonymously editable while restricted trips fail closed.

Set `ACCESS_TEAM_DOMAIN` to the full team URL (for example, `https://your-team.cloudflareaccess.com`) and `ACCESS_AUD` to the application audience tag. The Worker validates the `Cf-Access-Jwt-Assertion` signature against Cloudflare’s rotating public keys as a fallback for runtimes where `ctx.access` is not propagated.

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
