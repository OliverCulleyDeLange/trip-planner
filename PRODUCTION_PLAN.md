# Trip Planner production plan

This plan turns the working browser-only prototype into a separately deployed app while keeping the first production release deliberately small.

## Decisions

- [x] Use `OliverCulleyDeLange/trip-planner` as the dedicated repository.
- [x] Replace the obsolete prototype on the `rebuild-trip-planner` branch.
- [x] Keep the application and infrastructure on Cloudflare.
- [x] Keep Trip Scheduler resources in the `oliverdelange` Cloudflare account, separate from `artycards`.
- [x] Keep Astro for the extracted frontend instead of rewriting the working UI
- [x] Serve production directly from `https://oliverdelange.co.uk/trip-planner/` without an intermediary proxy Worker.


## First production release

- [x] Configure Astro for Cloudflare Workers.
- [x] Create separate preview and production D1 databases and a committed migration workflow.
- [x] Implement a D1-backed `TripRepository` behind server endpoints.
- [x] Give each trip a high-entropy, unguessable ID and allow anyone with its private trip link to view and edit the whole trip.
- [x] Give each browser an anonymous signed session for request validation and rate limiting.
- [x] Proxy optional Geoapify geocoding through the Worker and, when enabled, store `GEOAPIFY_API_KEY` as a Cloudflare Workers secret; do not expose it through a `PUBLIC_` environment variable in production.
- [x] Add record revision checks so stale edits cannot silently overwrite newer data.
- [x] Add separate preview and production environments.
- [x] Add verification-only GitHub Actions CI.
- [ ] Connect the existing `trip-scheduler` Worker to `OliverCulleyDeLange/trip-planner` with Cloudflare Workers Builds for automatic `main` deployments.


## Data model

Keep the existing `TripRepository` interface and add a Cloudflare implementation backed by D1. Use separate tables for:

- trips and anonymous sessions
- participants and baggage
- date options and availability
- transport options and travel times
- accommodation, rooms and beds
- activities
- votes and selections

Every editable record should include `trip_id`, `created_at`, `updated_at` and a revision number. D1 migrations must be committed and applied separately to preview and production.


## Cloudflare services

- **Workers and Astro:** serve the application, static assets and shared API.
- **D1:** shared relational trip data and migrations.
- **Workers secrets:** required session-cookie signing and optional external API credentials such as `GEOAPIFY_API_KEY`.
- **Web Analytics and Worker logs:** basic production visibility.
- **D1 Time Travel:** recovery from accidental writes or migrations.

Durable Objects are not required for the first release. Add them later only if live push updates become important.

## Private beta acceptance criteria

- A trip created on one device opens from its private link on another.
- Both devices can add and edit every type of trip information.
- Anyone with a trip's private URL can open and edit it using the trip ID in that URL; no password or separate invite token is required.
- The Geoapify key is available only to the Worker; geocoding requests are proxied and rate limited.
- Stale edits are detected instead of silently overwriting newer data.
- The current real trip can be exported locally and imported into production.
- Migrations, application checks and core browser tests run before deployment.
- The production database can be restored after an accidental change.
