import type { DataSourceJsonData } from "@grafana/data";
import type { DataQuery } from "@grafana/schema";

/**
 * Types for the RealUptime Grafana data source plugin (REA-566), the
 * consumer of `GET /api/v1/checks/results` (REA-564) and, for annotations,
 * `GET /api/v1/incidents`.
 */

export const METRICS = ["uptime", "latency", "status_code"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABELS: Record<Metric, string> = {
  uptime: "Uptime %",
  latency: "Latency (ms)",
  status_code: "HTTP status code",
};

/** `status_code` has no meaningful aggregate (the API's downsample buckets
 * carry sample/ok counts and latency percentiles only, never a status
 * code -- see docs/api.md's `GET /checks/results` bucket shape), so it is
 * always queried raw regardless of the panel's interval. */
export function metricSupportsDownsampling(metric: Metric): boolean {
  return metric !== "status_code";
}

export type RealUptimeQueryType = "results" | "incidents";

export interface RealUptimeQuery extends DataQuery {
  /** Distinguishes a normal panel query from an annotation query executed
   * through the same `query()` method (`datasource.ts`'s `annotations.
   * prepareQuery` sets this to `"incidents"`). Omitted/`"results"` for an
   * ordinary panel query. */
  queryType?: RealUptimeQueryType;
  /** Omitted means every check the account owns, matching the REST API's
   * own "omit check_ids for everything" contract. */
  checkIds?: string[];
  /** Omitted means every live region. */
  region?: string;
  metric?: Metric;
}

export const DEFAULT_QUERY: Partial<RealUptimeQuery> = {
  metric: "uptime",
};

/** Non-secret instance settings: visible in `GET /api/datasources/uid/:uid`,
 * exported provisioning-as-code, and Grafana's query inspector. The API key
 * NEVER lives here -- see `RealUptimeSecureJsonData` below. */
export interface RealUptimeDataSourceOptions extends DataSourceJsonData {
  /** The customer's RealUptime API base, e.g. `https://api.realuptime.io`.
   * Combined server-side (via this plugin's `plugin.json` `routes` entry)
   * with the account's API key to form the real request; the frontend only
   * ever calls Grafana's own datasource-proxy path, never this URL
   * directly. */
  baseUrl?: string;
}

/**
 * Secure instance settings: encrypted at rest, write-only from the
 * frontend's perspective (a saved value round-trips as `secureJsonFields.
 * apiKey: true`, never as the value itself), and interpolated into the
 * outgoing request's `Authorization` header entirely on Grafana's server
 * side via `plugin.json`'s `routes[0].headers` template
 * (`{{ .SecureJsonData.apiKey }}`). `datasource.ts` never reads this type at
 * all -- there being no code path in the frontend bundle that could -- so a
 * dashboard export, a query-inspector panel, or a browser devtools request
 * trace can never show the key, whether or not this file's discipline is
 * followed correctly elsewhere: see `datasource-security.test.ts`.
 */
export interface RealUptimeSecureJsonData {
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Wire types, mirroring `apps/web/app/api/v1/checks/results/route.ts` (REA-564)
// and `apps/web/app/api/v1/incidents/route.ts`'s response envelopes exactly.
// ---------------------------------------------------------------------------

export interface CheckResultRow {
  check_id: string;
  region: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
}

export interface CheckResultsBucketRow {
  check_id: string;
  region: string;
  bucket_start: string;
  sample_count: number;
  ok_count: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
}

export interface CheckResultsMeta {
  from: string;
  to: string;
  requested_from: string;
  requested_to: string;
  clamped: boolean;
  tier: string;
  history_days: number;
  check_ids: string[];
  region: string | null;
  step: string | null;
  row_cap: number;
  rows: number;
}

export interface CheckResultsRawResponse {
  results: CheckResultRow[];
  next_cursor: string | null;
  meta: CheckResultsMeta;
}

export interface CheckResultsBucketResponse {
  buckets: CheckResultsBucketRow[];
  next_cursor: string | null;
  meta: CheckResultsMeta;
}

export type CheckResultsResponse = CheckResultsRawResponse | CheckResultsBucketResponse;

export function isBucketResponse(response: CheckResultsResponse): response is CheckResultsBucketResponse {
  return Object.hasOwn(response, "buckets");
}

export interface IncidentRow {
  id: string;
  status_page_id: string;
  check_id: string;
  region: string | null;
  title: string;
  body: string;
  status: string;
  opened_at: string;
  resolved_at: string | null;
}

export interface IncidentsListResponse {
  incidents: IncidentRow[];
}

export interface CheckSummary {
  id: string;
  name: string;
}

export interface ChecksListResponse {
  checks: CheckSummary[];
}
