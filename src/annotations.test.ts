import { describe, expect, it } from "vitest";
import { buildIncidentsAnnotationFrame, frameToAnnotationEvents, incidentOverlapsRange } from "./annotations.ts";
import type { IncidentRow } from "./types.ts";

const range = { from: Date.parse("2026-08-01T00:00:00Z"), to: Date.parse("2026-08-02T00:00:00Z") };

function incident(overrides: Partial<IncidentRow> = {}): IncidentRow {
  return {
    id: "i1",
    status_page_id: "sp1",
    check_id: "c1",
    region: "iad",
    title: "Homepage is down",
    body: "Investigating",
    status: "investigating",
    opened_at: "2026-08-01T06:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

describe("incidentOverlapsRange", () => {
  it("is true for an incident opened and resolved inside the range", () => {
    expect(incidentOverlapsRange(incident({ opened_at: "2026-08-01T06:00:00Z", resolved_at: "2026-08-01T07:00:00Z" }), range)).toBe(true);
  });

  it("is true for a still-open incident (resolved_at null) that started inside the range", () => {
    expect(incidentOverlapsRange(incident({ resolved_at: null }), range)).toBe(true);
  });

  it("is true for an incident that started before the range and is still open", () => {
    expect(incidentOverlapsRange(incident({ opened_at: "2026-07-01T00:00:00Z", resolved_at: null }), range)).toBe(true);
  });

  it("is false for an incident fully resolved before the range starts", () => {
    expect(incidentOverlapsRange(incident({ opened_at: "2026-07-01T00:00:00Z", resolved_at: "2026-07-02T00:00:00Z" }), range)).toBe(false);
  });

  it("is false for an incident that opens after the range ends", () => {
    expect(incidentOverlapsRange(incident({ opened_at: "2026-08-03T00:00:00Z", resolved_at: null }), range)).toBe(false);
  });
});

describe("buildIncidentsAnnotationFrame", () => {
  it("draws a shaded region from opened_at to resolved_at for a resolved incident", () => {
    const frame = buildIncidentsAnnotationFrame(
      [incident({ opened_at: "2026-08-01T06:00:00Z", resolved_at: "2026-08-01T07:00:00Z", title: "DB outage" })],
      range,
      "Anno",
    );
    const byName = Object.fromEntries(frame.fields.map((field) => [field.name, field.values]));
    expect(byName.time).toEqual([Date.parse("2026-08-01T06:00:00Z")]);
    expect(byName.timeEnd).toEqual([Date.parse("2026-08-01T07:00:00Z")]);
    expect(byName.text).toEqual(["DB outage"]);
  });

  it("extends a still-open incident's region to the range's own `to`, never into the future", () => {
    const frame = buildIncidentsAnnotationFrame([incident({ resolved_at: null })], range, "Anno");
    const byName = Object.fromEntries(frame.fields.map((field) => [field.name, field.values]));
    expect(byName.timeEnd).toEqual([range.to]);
  });

  it("filters out incidents that don't overlap the range", () => {
    const frame = buildIncidentsAnnotationFrame(
      [incident({ opened_at: "2020-01-01T00:00:00Z", resolved_at: "2020-01-02T00:00:00Z" })],
      range,
      "Anno",
    );
    expect(frame.length).toBe(0);
  });

  it("filters to the given checkIds when the annotation query names any", () => {
    const incidents = [incident({ check_id: "c1" }), incident({ check_id: "c2", title: "Other check" })];
    const frame = buildIncidentsAnnotationFrame(incidents, range, "Anno", ["c2"]);
    const byName = Object.fromEntries(frame.fields.map((field) => [field.name, field.values]));
    expect(byName.text).toEqual(["Other check"]);
  });

  it("includes every check's incidents when checkIds is omitted", () => {
    const incidents = [incident({ check_id: "c1" }), incident({ check_id: "c2", title: "Other check" })];
    const frame = buildIncidentsAnnotationFrame(incidents, range, "Anno");
    expect(frame.length).toBe(2);
  });
});

describe("frameToAnnotationEvents", () => {
  it("round-trips buildIncidentsAnnotationFrame's output into AnnotationEvent[], always as a region", () => {
    const frame = buildIncidentsAnnotationFrame(
      [incident({ opened_at: "2026-08-01T06:00:00Z", resolved_at: "2026-08-01T07:00:00Z", title: "DB outage", status: "resolved" })],
      range,
      "Anno",
    );
    const events = frameToAnnotationEvents(frame);
    expect(events).toEqual([
      {
        time: Date.parse("2026-08-01T06:00:00Z"),
        timeEnd: Date.parse("2026-08-01T07:00:00Z"),
        text: "DB outage",
        tags: ["incident", "resolved"],
        isRegion: true,
      },
    ]);
  });

  it("returns an empty array for an empty frame", () => {
    const frame = buildIncidentsAnnotationFrame([], range, "Anno");
    expect(frameToAnnotationEvents(frame)).toEqual([]);
  });
});
