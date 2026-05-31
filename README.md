# BEWI Howden Volume Reporting Dashboard

Operational volume reporting for the Howden warehouse (BEWI Insulation and Construction Ltd). Built on Next.js + Supabase, synced from Unleashed.

This is the prototype build. See the SOW and SKILL.md for the full scope and design rationale.

## What it does

- Pulls open sales orders, sales shipments, and stock-on-hand from Unleashed (Howden / S03 only)
- Ingests Works Order data via CSV POST from the Works Order App
- Surfaces operational volume (m³) by Line of Business, with weight and value alongside
- Calculates shipment volume correctly from shipped quantity (resolves the legacy Power BI flaw)
- Five dashboards: Volume Matrix, Cutting Line Capacity, Timeline, Expected to Ship, Carriers

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` (also from Supabase, kept server-side only)
- `UNLEASHED_API_ID` and `UNLEASHED_API_KEY` for the BEWI tenant
- `BEWI_HOWDEN_WAREHOUSE_GUID` if it differs from the default
- `WORKS_ORDER_INGEST_SECRET` - a strong random secret for the Works Order App to authenticate
- `CRON_SECRET` - a strong random secret for Vercel Cron

### 3. Run database migrations

In the Supabase SQL editor, run the migrations in order:

```
supabase/migrations/00001_initial_schema.sql
supabase/migrations/00002_rls_policies.sql
supabase/migrations/00003_aggregates.sql
supabase/migrations/00004_seed_bewi_config.sql
```

### 4. Create the first user

In Supabase Auth, invite the user(s) who need access. They'll set their password via email link.

### 5. Run the initial sync

```bash
npm run sync:initial
```

This pulls products (with attributes including NetM3 and Category/cutting line), customers, open sales orders, open shipments, and stock-on-hand for Howden. Allow up to a few minutes - 9,000 products is on the slower end but should complete in a single run.

### 6. Seed mock works orders (until the Works Order App is live)

```bash
npm run seed:mock-works-orders
```

This creates around 60 mock works orders distributed across the four cutting lines so the cutting line dashboards render meaningfully. Once the real Works Order App is posting to the ingest endpoint, this script can stop being used.

### 7. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`, sign in, and the volume matrix should be populated.

## How the volume calculation works

Centralised in `lib/volume/calculate.ts` and `public.line_volume_m3` SQL function. NetM3 is the authoritative figure (confirmed by the customer). Dimensional calculation (W × H × D) is only used when NetM3 is null on a product. Products falling back to dimensional are flagged in the `v_data_quality_missing_volume` view.

Shipment volume uses each line's `shipped_quantity`, not the parent order's total quantity. This is the fix vs the legacy Power BI report.

## Manual refresh button

On the dashboard header, "Refresh data" triggers an immediate operational sync against Unleashed (orders, shipments, stock - not the full product catalogue). It has a 60-second per-user cooldown, a concurrency check (no parallel runs), and logs every press to `sync_runs` with `trigger='manual'`.

## Works Order ingestion

The Works Order App posts a CSV to `/api/v1/works-orders/ingest` (note: the API route currently sits at `/api/works-orders/ingest` and is versioned via the file structure; if a true `/v1/` URL is needed for the contract, move the route or add a rewrite).

Auth: `X-API-Key` header matching `WORKS_ORDER_INGEST_SECRET`.

Body: `text/csv` directly, or `multipart/form-data` with a `file` part.

Required columns:

| Column | Notes |
|---|---|
| `works_order_id` | Unique ID from the Works Order App. Used as the upsert key. |
| `sku` | Must match an Unleashed `ProductCode`. Unmatched SKUs are quarantined. |
| `quantity` | Numeric. |
| `cutting_line` | One of `SC`, `5MCL`, `LPC`, `SPC`. |
| `status` | Free text. Terminal statuses: `Completed`, `Cancelled`, `Rejected`. Anything else is treated as in-progress. |
| `created_at` | ISO 8601 timestamp. |
| `expected_completion_at` | ISO 8601 timestamp, nullable. |
| `completed_at` | ISO 8601 timestamp, nullable. |

Snapshot semantics: each POST is treated as the full current state of in-progress works orders. Records present in the previous post but absent in the current one are marked `missing_from_feed = true` (not deleted).

## Project structure

```
app/
  api/
    cron/sync-unleashed/       Vercel Cron endpoint (10-min schedule)
    sync/manual/               Manual refresh, cooldown-protected
    works-orders/ingest/       CSV ingest from Works Order App
    export/csv/                CSV export for the dashboards
  matrix/                      Volume Matrix (headline view)
  capacity/                    Cutting Line Capacity
  timeline/                    Sales and Works Order Timelines
  expected-to-ship/            Shipments by required date
  carrier/                     Carrier volume distribution (Campeys highlighted)
  login/                       Sign in
components/
  dashboard/                   Dashboard UI components
  auth/                        Sign-in form
lib/
  unleashed/                   HMAC-signed API client, types, .NET date parser
  volume/                      Centralised m3 calculation utility
  sync/                        Per-entity sync logic and orchestrator
  works-orders/                CSV ingestion and mock generator
  supabase/                    Server and browser Supabase clients
  config/                      BEWI runtime configuration
supabase/
  migrations/                  SQL migrations (run in order)
scripts/
  initial-sync.ts              One-off CLI to run a first full sync
  seed-mock-works-orders.ts    Populate cutting line dashboards before the Works Order App is live
```

## Deployment

1. Push to GitHub
2. Connect to Vercel (Pro plan required for 300s function timeouts)
3. Set environment variables in Vercel project settings
4. Vercel Cron is configured in `vercel.json` (10-minute schedule)
5. First deploy will not run the cron; trigger an initial sync manually via the CLI or by hitting `/api/cron/sync-unleashed` with the `Bearer ${CRON_SECRET}` header

## Known limitations of the prototype

- Single user role (all authenticated users have full access)
- No saved filter configurations on the export tool yet
- No data quality view UI (the underlying SQL view exists; UI to come in a later iteration)
- Mock works orders rather than live Works Order App integration
- Reconciliation sweep not yet scheduled (currently only delta sync runs on cron)

## Reference

- SOW: `Statement of Work: BEWI Howden Volume Reporting Dashboard`
- Design notes: `BEWI-SKILL.md` in the SupplyLens skills library
- Parent platform: BEWI PO Boards app (`bewi-po-boards-app` skill) - same conventions for Next.js, Supabase, HMAC signing, audit events
