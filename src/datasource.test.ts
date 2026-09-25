import type { DataSourceInstanceSettings } from "@grafana/data";
import { of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealUptimeDataSourceOptions } from "./types.ts";

const fetchMock = vi.fn();
vi.mock("@grafana/runtime", () => ({
  getBackendSrv: () => ({ fetch: fetchMock }),
  isFetchError: (err: unknown): err is { status: number; statusText?: string; data?: { error?: string } } =>
    typeof err === "object" && err !== null && "status" in err,
}));

const { RealUptimeDataSource } = await import("./datasource.ts");

const PROXY_URL = "/api/datasources/proxy/uid/ds-uid";

function instanceSettings(): DataSourceInstanceSettings<RealUptimeDataSourceOptions> {
  return {
    id: 1,
    uid: "ds-uid",
    type: "realuptime-monitor-datasource",
    name: "RealUptime Monitor",
    meta: {} as never,
    url: PROXY_URL,
    jsonData: { baseUrl: "https://api.realuptime.io" },
    readOnly: false,
    access: "proxy",
  } as unknown as DataSourceInstanceSettings<RealUptimeDataSourceOptions>;
}

/**
 * Proves the actual HTTP request the plugin issues for a given panel time
 * range: what REA-566's acceptance criteria calls "changing the panel time
 * range demonstrably narrows the API query rather than filtering
 * client-side."
 */
describe("RealUptimeDataSource.query", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("requests GET .../checks/results with from/to/step derived from the panel's range and interval, and no results in query params", async () => {
    fetchMock.mockImplementation((req: { url: string }) => {
      if (req.url.includes("/checks/results")) {
        return of({ data: { results: [], next_cursor: null, meta: {} } });
      }
      return of({ data: { checks: [] } });
    });

    const ds = new RealUptimeDataSource(instanceSettings());
    const range = {
      from: { valueOf: () => Date.parse("2026-08-01T00:00:00Z") },
      to: { valueOf: () => Date.parse("2026-08-01T06:00:00Z") },
    };
    await ds.query({
      targets: [{ refId: "A", metric: "uptime" }],
      range,
      intervalMs: 30_000,
    } as never);

    const resultsCall = fetchMock.mock.calls.map((call) => call[0].url as string).find((url) => url.includes("/checks/results"));
    expect(resultsCall).toBeDefined();
    expect(resultsCall).toBe(
      `${PROXY_URL}/realuptime-api/api/v1/checks/results?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-01T06%3A00%3A00.000Z&step=30s`,
    );
  });

  it("narrows the query when the panel range narrows -- proves range changes reach the API, not just client-side filtering", async () => {
    const urls: string[] = [];
    fetchMock.mockImplementation((req: { url: string }) => {
      urls.push(req.url);
      return of({ data: req.url.includes("/checks") && !req.url.includes("results") ? { checks: [] } : { results: [], next_cursor: null, meta: {} } });
    });
    const ds = new RealUptimeDataSource(instanceSettings());

    const wideRange = {
      from: { valueOf: () => Date.parse("2026-08-01T00:00:00Z") },
      to: { valueOf: () => Date.parse("2026-08-08T00:00:00Z") },
    };
    await ds.query({ targets: [{ refId: "A", metric: "uptime" }], range: wideRange, intervalMs: 3_600_000 } as never);

    const narrowRange = {
      from: { valueOf: () => Date.parse("2026-08-01T00:00:00Z") },
      to: { valueOf: () => Date.parse("2026-08-01T01:00:00Z") },
    };
    await ds.query({ targets: [{ refId: "A", metric: "uptime" }], range: narrowRange, intervalMs: 30_000 } as never);

    const wideCall = urls.find((url) => url.includes("2026-08-08"));
    const narrowCall = urls.find((url) => url.includes("2026-08-01T01"));
    expect(wideCall).toContain("step=1h");
    expect(narrowCall).toContain("step=30s");
    expect(narrowCall).not.toBe(wideCall);
  });

  it("never sends step for a status_code query, requesting raw rows instead", async () => {
    fetchMock.mockImplementation((req: { url: string }) =>
      of({ data: req.url.includes("/checks/results") ? { results: [], next_cursor: null, meta: {} } : { checks: [] } }),
    );
    const ds = new RealUptimeDataSource(instanceSettings());
    const range = {
      from: { valueOf: () => Date.parse("2026-08-01T00:00:00Z") },
      to: { valueOf: () => Date.parse("2026-08-01T06:00:00Z") },
    };
    await ds.query({ targets: [{ refId: "A", metric: "status_code" }], range, intervalMs: 3_600_000 } as never);

    const resultsCall = fetchMock.mock.calls.map((call) => call[0].url as string).find((url) => url.includes("/checks/results"));
    expect(resultsCall).not.toContain("step=");
  });

  it("routes annotation-mode targets to /incidents instead of /checks/results", async () => {
    fetchMock.mockImplementation((req: { url: string }) => {
      if (req.url.includes("/incidents")) {
        return of({ data: { incidents: [] } });
      }
      return of({ data: { results: [], next_cursor: null, meta: {} } });
    });
    const ds = new RealUptimeDataSource(instanceSettings());
    const range = {
      from: { valueOf: () => Date.parse("2026-08-01T00:00:00Z") },
      to: { valueOf: () => Date.parse("2026-08-01T06:00:00Z") },
    };
    const response = await ds.query({ targets: [{ refId: "Anno", queryType: "incidents" }], range, intervalMs: 30_000 } as never);

    expect(fetchMock.mock.calls.some((call) => (call[0].url as string).includes("/realuptime-api/api/v1/incidents"))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => (call[0].url as string).includes("/checks/results"))).toBe(false);
    expect(response.data).toHaveLength(1);
  });
});

describe("RealUptimeDataSource.testDatasource", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("succeeds when the checks endpoint answers", async () => {
    fetchMock.mockImplementation(() => of({ data: { checks: [] } }));
    const ds = new RealUptimeDataSource(instanceSettings());
    await expect(ds.testDatasource()).resolves.toMatchObject({ status: "success" });
  });

  it("reports a fetch error's status/statusText rather than throwing", async () => {
    fetchMock.mockImplementation(() => throwError(() => ({ status: 401, statusText: "Unauthorized", data: { error: "bad key" } })));
    const ds = new RealUptimeDataSource(instanceSettings());
    const result = await ds.testDatasource();
    expect(result.status).toBe("error");
    expect(result.message).toContain("401");
    expect(result.message).toContain("bad key");
  });
});
