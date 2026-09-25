# RealUptime Monitor data source for Grafana

Query [RealUptime](https://realuptime.io) Monitor check results (uptime,
latency, HTTP status code) and incident annotations directly from Grafana.

Maintained by RealUptime. The API this plugin reads is documented at
[docs.realuptime.io/api](https://docs.realuptime.io/api); support and bug
reports go to `jose.franco@realuptime.io`.

<!--
Maintainer note, not rendered on the catalog page.

This file ships inside the plugin archive (.config/bundler/copyFiles.mjs
copies it into dist/) and is what the Grafana catalog renders on the
plugin's page, so every link in it must be publicly reachable: Grafana's
own `plugincheck2` reports a broken link as a warning on every submission
review.

Two claims were removed here on 2026-09-06 (REA-703): a link to the
company's private monorepo on GitHub, which is a permanent 404 to everyone
outside the company (plugincheck2 flagged exactly that link, so do not
reintroduce it, in prose or in a comment), and a pointer to
scripts/publish-sdk-mirrors.mjs as the thing that
turns this package into a published plugin. That script mirrors the five
Errors SDKs only; it has never known about this package, and there is no
public mirror repo for it. See docs/marketing/directory-listings/grafana-submission.md.
-->


## What it queries

- **Panels**: `GET /api/v1/checks/results` (REA-564) -- time-ranged,
  multi-check, multi-region results, honoring the panel's own
  `$__timeFrom()`/`$__timeTo()`/`$__interval`. A wide panel maps its
  interval onto the API's `step` parameter and gets pre-downsampled buckets
  back (sample/ok counts, p50/p95 latency) instead of pulling raw rows and
  binning them client-side.
- **Annotations**: `GET /api/v1/incidents` -- open and resolved incidents
  become shaded regions on the panel from `opened_at` to `resolved_at` (or
  to "now" while still open), so an outage is visible on the same graph as
  the metric it affected.

## Configuration

- **Base URL**: your RealUptime API base, e.g. `https://api.realuptime.io`.
- **API key**: a read-scoped RealUptime API key
  (dashboard -> API & MCP access). Stored as a Grafana **secure** field:
  encrypted at rest, never returned to the browser after saving, and never
  exported with a dashboard. The key is attached to outgoing requests by
  Grafana's own datasource-proxy route (`plugin.json`'s `routes`), entirely
  server-side -- this plugin's frontend code never has access to the
  decrypted value, by construction (see `src/datasource-security.test.ts`).

## Query options

| Field | Meaning |
| --- | --- |
| Checks | Which checks to query. Omitted means every check the account owns. |
| Region | One live probe region, or every region. The API takes at most one region per request. |
| Metric | `Uptime %`, `Latency (ms)` (p50/p95 once downsampled), or `HTTP status code` (always raw -- the API's downsampled buckets carry no status code). |

## Local development

```bash
pnpm --filter realuptime-monitor-datasource build
docker compose up --build   # from this package's directory
```

`docker-compose.yaml` runs a local Grafana with this plugin mounted from
`dist/` and provisions a data source pointed at `REALUPTIME_BASE_URL`/
`REALUPTIME_API_KEY` (see `provisioning/datasources/datasources.yml`) plus
the starter dashboard at `provisioning/dashboards/realuptime-monitor.json`.

## Tests

```bash
pnpm --filter realuptime-monitor-datasource test
```

Unit tests cover the query-to-API mapping (`query-mapping.test.ts`,
including the interval-to-step mapping), incident-to-annotation mapping
(`annotations.test.ts`), the secure-field config editor logic
(`config-editor-logic.test.ts`), and the actual outgoing HTTP request shape
for a given panel range (`datasource.test.ts`).
