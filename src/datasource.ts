import type {
  AnnotationQuery,
  AnnotationSupport,
  CoreApp,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
} from "@grafana/data";
import { DataSourceApi } from "@grafana/data";
import { getBackendSrv, isFetchError } from "@grafana/runtime";
import { lastValueFrom, of } from "rxjs";
import { buildIncidentsAnnotationFrame, frameToAnnotationEvents, INCIDENTS_ANNOTATION_LIMIT } from "./annotations.ts";
import { buildResultsQueryParams, mapBucketRowsToFrames, mapRawRowsToFrames } from "./query-mapping.ts";
import {
  type CheckResultsResponse,
  type CheckSummary,
  type ChecksListResponse,
  DEFAULT_QUERY,
  type IncidentRow,
  type IncidentsListResponse,
  isBucketResponse,
  type RealUptimeDataSourceOptions,
  type RealUptimeQuery,
} from "./types.ts";

/**
 * The RealUptime Grafana data source (REA-566): queries
 * `GET /api/v1/checks/results` (REA-564) for panel time series and
 * `GET /api/v1/incidents` for outage annotations.
 *
 * Every request below goes through `${this.proxyUrl}/${route}`, where
 * `this.proxyUrl` is `instanceSettings.url` -- for a `access: "proxy"` data
 * source (what this plugin's provisioning and `ConfigEditor` both set),
 * Grafana rewrites that to its own `/api/datasources/proxy/uid/<uid>/...`
 * path and resolves the trailing route segment (`realuptime-api`, matching
 * `plugin.json`'s `routes[0].path`) on the SERVER, substituting the
 * account's real base URL and injecting the bearer authorization header
 * from the secure config field there. This file never reads that secure
 * field or constructs an authorization header itself -- it cannot: a
 * frontend data source plugin is never handed the decrypted secret value
 * at all. See `datasource-security.test.ts`, which asserts that
 * structurally rather than just by convention.
 */

const RESULTS_ROUTE = "realuptime-api/api/v1/checks/results";
const INCIDENTS_ROUTE = "realuptime-api/api/v1/incidents";
const CHECKS_ROUTE = "realuptime-api/api/v1/checks";

/** How long a fetched check id -> name map is reused for series labeling
 * before the next query re-fetches it. Long enough that a multi-panel
 * dashboard refreshing every few seconds (the REA-564 motivating case)
 * shares one `/checks` call across most of that window; short enough that a
 * renamed or newly-added check shows up within a minute without requiring a
 * dashboard reload. */
const CHECK_NAMES_CACHE_TTL_MS = 60_000;

export class RealUptimeDataSource extends DataSourceApi<RealUptimeQuery, RealUptimeDataSourceOptions> {
  private readonly proxyUrl: string;
  private checkNamesCache: { fetchedAt: number; names: Record<string, string> } | null = null;

  /**
   * Runs the annotation's query through the same `query()` method as an
   * ordinary panel query (`prepareQuery` tags it `queryType: "incidents"`),
   * then converts the resulting frame back into `AnnotationEvent[]`
   * (`frameToAnnotationEvents`). See `annotations.ts` for why the frame
   * round trip exists: it keeps the incidents-to-events mapping pure and
   * unit-testable without a live `AnnotationQueryRunner`.
   *
   * No custom `QueryEditor` here deliberately: every incident annotates
   * (`buildIncidentsAnnotationFrame`'s `checkIds` filter stays available for
   * a future per-annotation check picker, but nothing wires it yet), so
   * Grafana's default annotation editor -- just a name and color -- is
   * enough, and this file stays free of any `@grafana/ui`/React import.
   * That is not just tidiness: it is what keeps `datasource.ts` importable
   * in a plain Node test environment without dragging in `@grafana/ui`'s
   * browser-only chart internals (uPlot, and the global Grafana boot data
   * that `config` from `@grafana/runtime` reads on module load), which
   * `QueryEditor.tsx` and its own tests exercise separately. This file
   * never reads that global itself: any bootstrap info it might ever need
   * (build info, feature toggles) belongs behind `config` from
   * `@grafana/runtime`, not a direct `window` property access, which
   * Grafana's plugin checks reject outright.
   */
  annotations: AnnotationSupport<RealUptimeQuery> = {
    prepareQuery: (annotation: AnnotationQuery<RealUptimeQuery>): RealUptimeQuery => ({
      ...(annotation.target ?? { refId: "Anno" }),
      queryType: "incidents",
    }),
    processEvents: (_annotation, frames) => of(frames.flatMap(frameToAnnotationEvents)),
  };

  constructor(instanceSettings: DataSourceInstanceSettings<RealUptimeDataSourceOptions>) {
    super(instanceSettings);
    this.proxyUrl = instanceSettings.url ?? "";
  }

  getDefaultQuery(_app: CoreApp): Partial<RealUptimeQuery> {
    return DEFAULT_QUERY;
  }

  filterQuery(query: RealUptimeQuery): boolean {
    return !query.hide;
  }

  async query(request: DataQueryRequest<RealUptimeQuery>): Promise<DataQueryResponse> {
    const range = { from: request.range.from.valueOf(), to: request.range.to.valueOf() };
    const intervalMs = request.intervalMs ?? 60_000;

    const frames = await Promise.all(
      request.targets.filter((target) => this.filterQuery(target)).map((target) => this.runTarget(target, range, intervalMs)),
    );

    return { data: frames.flat() };
  }

  private async runTarget(
    target: RealUptimeQuery,
    range: { from: number; to: number },
    intervalMs: number,
  ): Promise<DataFrame[]> {
    if (target.queryType === "incidents") {
      const incidents = await this.fetchIncidents();
      return [buildIncidentsAnnotationFrame(incidents, range, target.refId, target.checkIds)];
    }

    const metric = target.metric ?? "uptime";
    const params = buildResultsQueryParams(target, range, intervalMs);
    const [response, checkNames] = await Promise.all([this.fetchResults(params), this.getCheckNames()]);

    if (isBucketResponse(response)) {
      if (metric === "status_code") {
        // Unreachable in practice: buildResultsQueryParams never sets `step`
        // for status_code, so the API never buckets it. Fail loudly rather
        // than silently mis-plotting if that contract ever changes.
        throw new Error("RealUptime data source: received bucketed results for a status_code query.");
      }
      return mapBucketRowsToFrames(response.buckets, metric, target.refId, checkNames);
    }
    return mapRawRowsToFrames(response.results, metric, target.refId, checkNames);
  }

  /**
   * Checks whether the configured base URL and API key can actually reach
   * the account's RealUptime data -- exercised from the config page's "Save
   * & test" button.
   */
  async testDatasource(): Promise<{ status: "success" | "error"; message: string }> {
    try {
      await this.getChecks();
      return { status: "success", message: "Successfully connected to the RealUptime API." };
    } catch (err) {
      if (isFetchError(err)) {
        const detail = typeof err.data?.error === "string" ? `: ${err.data.error}` : "";
        return {
          status: "error",
          message: `Cannot connect to the RealUptime API (${err.status}${err.statusText ? ` ${err.statusText}` : ""})${detail}`,
        };
      }
      const message = err instanceof Error ? err.message : "Cannot connect to the RealUptime API.";
      return { status: "error", message };
    }
  }

  /** Every check the account owns, for the query editor's picker and for
   * labeling series with a check's name instead of its bare id. */
  async getChecks(): Promise<CheckSummary[]> {
    const response = await this.fetchJson<ChecksListResponse>(CHECKS_ROUTE);
    return response.checks;
  }

  private async getCheckNames(): Promise<Record<string, string>> {
    const now = Date.now();
    if (this.checkNamesCache && now - this.checkNamesCache.fetchedAt < CHECK_NAMES_CACHE_TTL_MS) {
      return this.checkNamesCache.names;
    }
    const checks = await this.getChecks();
    const names = Object.fromEntries(checks.map((check) => [check.id, check.name]));
    this.checkNamesCache = { fetchedAt: now, names };
    return names;
  }

  private fetchResults(params: URLSearchParams): Promise<CheckResultsResponse> {
    return this.fetchJson<CheckResultsResponse>(RESULTS_ROUTE, params);
  }

  private async fetchIncidents(): Promise<IncidentRow[]> {
    const params = new URLSearchParams({ limit: String(INCIDENTS_ANNOTATION_LIMIT) });
    const response = await this.fetchJson<IncidentsListResponse>(INCIDENTS_ROUTE, params);
    return response.incidents;
  }

  private async fetchJson<T>(route: string, params?: URLSearchParams): Promise<T> {
    const query = params && [...params.keys()].length > 0 ? `?${params.toString()}` : "";
    const response = await lastValueFrom(getBackendSrv().fetch<T>({ url: `${this.proxyUrl}/${route}${query}` }));
    return response.data;
  }
}
