import { type DataFrame, FieldType, createDataFrame } from "@grafana/data";
import type { IncidentRow } from "./types.ts";

/**
 * Incidents (`GET /api/v1/incidents`) into panel annotations (REA-566): an
 * outage draws a shaded region on the panel from the incident's
 * `opened_at` to its `resolved_at` (or to "now" while still open), with the
 * incident title as the annotation text.
 *
 * `GET /incidents` has no `from`/`to` query parameters (docs/api.md: it
 * takes only `limit`) -- incidents are kept indefinitely and the dashboard
 * case is "show me what's already on screen", not a paginated history
 * browse. So this fetches a bounded page (see `datasource.ts`'s
 * `INCIDENTS_ANNOTATION_LIMIT`) and filters to the panel's visible range
 * here, client-side, rather than inventing request parameters the endpoint
 * does not document or accept.
 */

/** A generous page: an account with more open-plus-recent incidents than
 * this in view at once has bigger problems than an annotation query, and
 * this still stays well under the `incidents` list's hard cap
 * (`incidentsListSchema`, 1-500) documented in docs/api.md. */
export const INCIDENTS_ANNOTATION_LIMIT = 500;

export interface TimeRangeMillis {
  from: number;
  to: number;
}

/** True when the incident's [opened_at, resolved_at-or-now) window overlaps
 * the requested range at all -- the same half-open interval overlap test
 * `clampToRetentionWindow` uses server-side, so a long-running incident that
 * started before the visible range still draws (clipped visually by the
 * panel's own x-axis, not dropped here). */
export function incidentOverlapsRange(incident: IncidentRow, range: TimeRangeMillis): boolean {
  const openedAt = new Date(incident.opened_at).valueOf();
  const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at).valueOf() : Number.POSITIVE_INFINITY;
  return openedAt < range.to && resolvedAt >= range.from;
}

/**
 * Filters incidents to `checkIds` (when the annotation query names any --
 * omitted means every check, matching the panel query's own "omit means
 * all" contract) and to the visible range, then shapes them into the frame
 * `datasource.ts`'s `query()` returns for an annotation-mode target: `time`/
 * `timeEnd`/`text`/`tags` fields, the exact shape `frameToAnnotationEvents`
 * below reads back. `timeEnd` for a still-open incident is the range's own
 * `to` bound (never a future timestamp), so the shaded region always
 * reaches the panel's right edge rather than appearing to end at "now" and
 * then reappearing on the next poll.
 */
export function buildIncidentsAnnotationFrame(
  incidents: IncidentRow[],
  range: TimeRangeMillis,
  refId: string,
  checkIds?: string[],
): DataFrame {
  const checkIdSet = checkIds && checkIds.length > 0 ? new Set(checkIds) : null;

  const rows = incidents
    .filter((incident) => (checkIdSet ? checkIdSet.has(incident.check_id) : true))
    .filter((incident) => incidentOverlapsRange(incident, range));

  const time: number[] = [];
  const timeEnd: number[] = [];
  const text: string[] = [];
  const tags: string[][] = [];

  for (const incident of rows) {
    time.push(new Date(incident.opened_at).valueOf());
    timeEnd.push(incident.resolved_at ? new Date(incident.resolved_at).valueOf() : range.to);
    text.push(incident.title);
    tags.push(["incident", incident.status]);
  }

  return createDataFrame({
    refId,
    name: "incidents",
    fields: [
      { name: "time", type: FieldType.time, values: time },
      { name: "timeEnd", type: FieldType.time, values: timeEnd },
      { name: "text", type: FieldType.string, values: text },
      { name: "tags", type: FieldType.other, values: tags },
    ],
  });
}

export interface AnnotationEvent {
  time: number;
  timeEnd?: number;
  text?: string;
  tags?: string[];
  isRegion?: boolean;
}

/** The inverse of `buildIncidentsAnnotationFrame`'s field shape: reads a
 * frame produced by that function (returned from `query()` for an
 * annotation-mode target) back into the `AnnotationEvent[]` Grafana's
 * annotation support (`datasource.ts`'s `annotations.processEvents`)
 * needs. `isRegion: true` throughout is what turns each event into a
 * shaded band rather than a single marker line. */
export function frameToAnnotationEvents(frame: DataFrame): AnnotationEvent[] {
  const timeField = frame.fields.find((field) => field.name === "time");
  const timeEndField = frame.fields.find((field) => field.name === "timeEnd");
  const textField = frame.fields.find((field) => field.name === "text");
  const tagsField = frame.fields.find((field) => field.name === "tags");

  const length = timeField?.values.length ?? 0;
  const events: AnnotationEvent[] = [];
  for (let i = 0; i < length; i++) {
    events.push({
      time: timeField?.values[i] as number,
      timeEnd: timeEndField?.values[i] as number | undefined,
      text: textField?.values[i] as string | undefined,
      tags: tagsField?.values[i] as string[] | undefined,
      isRegion: true,
    });
  }
  return events;
}
