import { describe, expect, it } from "vitest";
import {
  buildResultsQueryParams,
  intervalToStep,
  mapBucketRowsToFrames,
  mapRawRowsToFrames,
  MAX_STEP_SECONDS,
  MIN_STEP_SECONDS,
} from "./query-mapping.ts";
import type { CheckResultsBucketRow, CheckResultRow, RealUptimeQuery } from "./types.ts";

describe("intervalToStep", () => {
  it("spells a whole number of the largest unit that divides evenly", () => {
    expect(intervalToStep(30_000)).toBe("30s");
    expect(intervalToStep(5 * 60_000)).toBe("5m");
    expect(intervalToStep(60 * 60_000)).toBe("1h");
    expect(intervalToStep(24 * 60 * 60_000)).toBe("1d");
  });

  it("falls back to seconds when nothing coarser divides evenly", () => {
    expect(intervalToStep(90_000)).toBe("90s");
  });

  it("clamps below the API's minimum step (10s) up to the floor", () => {
    expect(intervalToStep(1_000)).toBe("10s");
    expect(intervalToStep(0)).toBe("10s");
  });

  it("clamps above the API's maximum step (7d) down to the ceiling", () => {
    expect(MAX_STEP_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(intervalToStep(30 * 24 * 60 * 60_000)).toBe("7d");
  });

  it("treats non-finite intervals as the floor rather than throwing", () => {
    expect(intervalToStep(Number.NaN)).toBe("10s");
    expect(intervalToStep(Number.POSITIVE_INFINITY)).toBe("10s");
    expect(intervalToStep(Number.NEGATIVE_INFINITY)).toBe("10s");
    expect(intervalToStep(-500)).toBe("10s");
  });

  it("never produces a step outside [MIN_STEP_SECONDS, MAX_STEP_SECONDS]", () => {
    for (const ms of [1, 999, 10_000, 5_000_000, 999_999_999]) {
      const step = intervalToStep(ms);
      const match = /^(\d+)([smhd])$/.exec(step);
      expect(match).not.toBeNull();
      const unitSeconds = { s: 1, m: 60, h: 3600, d: 86_400 }[match![2] as "s" | "m" | "h" | "d"];
      const seconds = Number(match![1]) * unitSeconds;
      expect(seconds).toBeGreaterThanOrEqual(MIN_STEP_SECONDS);
      expect(seconds).toBeLessThanOrEqual(MAX_STEP_SECONDS);
    }
  });
});

describe("buildResultsQueryParams", () => {
  const range = { from: Date.parse("2026-08-01T00:00:00Z"), to: Date.parse("2026-08-08T00:00:00Z") };

  it("sends ISO from/to and maps the panel interval onto step", () => {
    const query: RealUptimeQuery = { refId: "A", metric: "uptime" };
    const params = buildResultsQueryParams(query, range, 5 * 60_000);
    expect(params.get("from")).toBe("2026-08-01T00:00:00.000Z");
    expect(params.get("to")).toBe("2026-08-08T00:00:00.000Z");
    expect(params.get("step")).toBe("5m");
  });

  it("narrows the query when checkIds/region are set, and omits them when not", () => {
    const withFilters = buildResultsQueryParams(
      { refId: "A", metric: "uptime", checkIds: ["c1", "c2"], region: "iad" },
      range,
      60_000,
    );
    expect(withFilters.get("check_ids")).toBe("c1,c2");
    expect(withFilters.get("region")).toBe("iad");

    const withoutFilters = buildResultsQueryParams({ refId: "A", metric: "uptime" }, range, 60_000);
    expect(withoutFilters.has("check_ids")).toBe(false);
    expect(withoutFilters.has("region")).toBe(false);
  });

  it("never sends step for status_code, since the API cannot bucket it", () => {
    const params = buildResultsQueryParams({ refId: "A", metric: "status_code" }, range, 5 * 60_000);
    expect(params.has("step")).toBe(false);
  });

  it("defaults metric to uptime and still downsamples when metric is omitted", () => {
    const params = buildResultsQueryParams({ refId: "A" }, range, 60_000);
    expect(params.get("step")).toBe("1m");
  });

  it("forwards an explicit row-cap limit", () => {
    const params = buildResultsQueryParams({ refId: "A", metric: "uptime" }, range, 60_000, { limit: 50 });
    expect(params.get("limit")).toBe("50");
  });
});

describe("mapRawRowsToFrames", () => {
  const rows: CheckResultRow[] = [
    { check_id: "c1", region: "iad", ok: true, status_code: 200, latency_ms: 100, error: null, checked_at: "2026-08-01T00:00:00Z" },
    { check_id: "c1", region: "iad", ok: false, status_code: 500, latency_ms: 200, error: "boom", checked_at: "2026-08-01T00:01:00Z" },
    { check_id: "c1", region: "fra", ok: true, status_code: 200, latency_ms: 50, error: null, checked_at: "2026-08-01T00:00:30Z" },
    { check_id: "c2", region: "iad", ok: true, status_code: 200, latency_ms: 80, error: null, checked_at: "2026-08-01T00:00:15Z" },
  ];

  it("produces one frame per check/region pair -- a multi-check, multi-region query yields multiple series", () => {
    const frames = mapRawRowsToFrames(rows, "uptime", "A");
    expect(frames).toHaveLength(3);
    const names = frames.map((frame) => frame.name).sort();
    expect(names).toEqual(["c1 (fra)", "c1 (iad)", "c2 (iad)"]);
  });

  it("uses a supplied check-name map instead of the bare id", () => {
    const frames = mapRawRowsToFrames(rows, "uptime", "A", { c1: "Homepage", c2: "API" });
    const names = frames.map((frame) => frame.name).sort();
    expect(names).toEqual(["API (iad)", "Homepage (fra)", "Homepage (iad)"]);
  });

  it("maps ok/latency_ms/status_code to the right value column per metric", () => {
    const uptime = mapRawRowsToFrames(rows, "uptime", "A").find((frame) => frame.name === "c1 (iad)")!;
    expect(uptime.fields[1].values).toEqual([100, 0]);

    const latency = mapRawRowsToFrames(rows, "latency", "A").find((frame) => frame.name === "c1 (iad)")!;
    expect(latency.fields[1].values).toEqual([100, 200]);

    const statusCode = mapRawRowsToFrames(rows, "status_code", "A").find((frame) => frame.name === "c1 (iad)")!;
    expect(statusCode.fields[1].values).toEqual([200, 500]);
  });

  it("returns no frames for an empty result set", () => {
    expect(mapRawRowsToFrames([], "uptime", "A")).toEqual([]);
  });
});

describe("mapBucketRowsToFrames", () => {
  const rows: CheckResultsBucketRow[] = [
    { check_id: "c1", region: "iad", bucket_start: "2026-08-01T00:00:00Z", sample_count: 10, ok_count: 9, p50_latency_ms: 100, p95_latency_ms: 300 },
    { check_id: "c1", region: "iad", bucket_start: "2026-08-01T00:05:00Z", sample_count: 10, ok_count: 10, p50_latency_ms: 110, p95_latency_ms: 250 },
  ];

  it("computes uptime % as ok_count/sample_count * 100", () => {
    const [frame] = mapBucketRowsToFrames(rows, "uptime", "A");
    expect(frame.fields[1].values).toEqual([90, 100]);
  });

  it("never divides by zero: a zero-sample bucket maps to null, not NaN", () => {
    const zeroSample: CheckResultsBucketRow[] = [{ ...rows[0], sample_count: 0, ok_count: 0 }];
    const [frame] = mapBucketRowsToFrames(zeroSample, "uptime", "A");
    expect(frame.fields[1].values).toEqual([null]);
  });

  it("carries both p50 and p95 as separate fields for latency", () => {
    const [frame] = mapBucketRowsToFrames(rows, "latency", "A");
    const byName = Object.fromEntries(frame.fields.map((field) => [field.name, field.values]));
    expect(byName.p50).toEqual([100, 110]);
    expect(byName.p95).toEqual([300, 250]);
  });
});
