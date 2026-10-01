# Trip Scheduler production plan

This plan turns the working browser-only prototype into a separately deployed app while keeping the first production release deliberately small.

## Decisions

- [x] Use `OliverCulleyDeLange/trip-scheduler` as the dedicated repository.
- [x] Replace the obsolete prototype on the `rebuild-trip-planner` branch.
- [x] Keep the application and infrastructure on Cloudflare.
- [x] Keep Astro for the extracted frontend instead of rewriting the working UI.
- [ ] Choose the production hostname. Suggested: `trips.oliverdelange.co.uk`.

## Current state

- [x] Extract the planner UI, types and repository interface from the website repository.
- [x] Preserve the existing appearance and behaviour.
- [x] Persist local trips in IndexedDB.
- [x] Add versioned JSON export and import.
- [x] Preserve the local Geoapify setup without committing its key.
- [x] Pass Astro type checks and a production build.
- [ ] Push `rebuild-trip-planner` to GitHub.
- [ ] Create a Cloudflare preview deployment.

## First production release

- [ ] Configure Astro for Cloudflare Workers.
- [ ] Create the D1 database and migration workflow.
- [ ] Implement a D1-backed `TripRepository` behind server endpoints.
- [ ] Allow anyone with a private trip link to edit the whole trip.
- [ ] Give each browser an anonymous signed session for request validation and rate limiting.
- [ ] Support optional trip password protection.
- [ ] Store long invite tokens as hashes and remove secrets from the visible URL after joining.
- [ ] Add record revision checks so stale edits cannot silently overwrite newer data.
- [ ] Add preview and production environments.
- [ ] Import a copy of the current real trip and run a friends-only beta.
- [ ] Remove the planner from the website repository after the standalone deployment is proven.

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

## Migration and recovery

The localhost IndexedDB data cannot be read directly by the deployed domain. Export the real trip as versioned JSON from the website prototype, then import it into the standalone app. When the D1 backend is introduced, the same import flow should validate the schema and create shared records.

Use D1 Time Travel for database recovery. Keep JSON export available as a user-controlled backup even after shared storage is live.

## Cloudflare services

- **Pages initially:** host the current static Astro application.
- **Workers and Astro:** serve the application and shared API once D1 is introduced.
- **D1:** shared relational trip data and migrations.
- **Workers secrets:** cookie signing, password hashing configuration and external API credentials.
- **Web Analytics and Worker logs:** basic production visibility.
- **D1 Time Travel:** recovery from accidental writes or migrations.

Durable Objects are not required for the first release. Add them later only if live push updates become important.

## Private beta acceptance criteria

- A trip created on one device opens from its private link on another.
- Both devices can add and edit every type of trip information.
- Optional password protection works without exposing the password or its hash.
- Stale edits are detected instead of silently overwriting newer data.
- The current real trip can be exported locally and imported into production.
- Migrations, application checks and core browser tests run before deployment.
- The production database can be restored after an accidental change.

## Later

- Social login and persistent accounts.
- Owner, editor and viewer roles.
- Fixed group membership lists.
- Live WebSocket updates through Durable Objects.
- Change history and undo.
- Automated transport, accommodation and baggage-price aggregation.
- Notifications and reminders.

## References

- [Cloudflare Astro deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
