import type { DataSourceSettings } from "@grafana/data";
import type { RealUptimeDataSourceOptions, RealUptimeSecureJsonData } from "./types.ts";

/**
 * Pure state transitions behind `ConfigEditor.tsx`, split out so the
 * security-critical half of REA-566 (the API key is a SECURE field) is unit
 * testable without rendering React (`config-editor-logic.test.ts`).
 *
 * The rule this file exists to enforce: an API key value is written ONLY
 * under `secureJsonData`, never under `jsonData`. `jsonData` is the half of
 * a data source's settings that round-trips to the frontend on every load
 * (`GET /api/datasources/uid/:uid`), appears in provisioning-as-code
 * exports, and is visible in Grafana's own admin UI for the data source --
 * so a plain-`jsonData` key would leak the secret through every one of
 * those paths even though no *dashboard* ever embeds it directly. Grafana
 * encrypts `secureJsonData` at rest and never sends its value back to the
 * frontend after saving: a saved key round-trips only as
 * `secureJsonFields.apiKey: true`, a boolean "this is configured" flag, not
 * the value itself.
 */

export type RealUptimeSettings = DataSourceSettings<RealUptimeDataSourceOptions, RealUptimeSecureJsonData>;

export function setBaseUrl(
  options: RealUptimeSettings,
  baseUrl: string,
): RealUptimeSettings {
  return {
    ...options,
    jsonData: {
      ...options.jsonData,
      baseUrl,
    },
  };
}

export function setApiKey(
  options: RealUptimeSettings,
  apiKey: string,
): RealUptimeSettings {
  return {
    ...options,
    secureJsonData: {
      ...options.secureJsonData,
      apiKey,
    },
  };
}

/** Clears a previously-saved key: flips `secureJsonFields.apiKey` back to
 * `false` (so the UI shows the input as empty/unconfigured again) and
 * blanks the in-flight `secureJsonData.apiKey` the form was holding, so a
 * cancelled edit can never resurrect a half-typed value on the next save. */
export function resetApiKey(options: RealUptimeSettings): RealUptimeSettings {
  return {
    ...options,
    secureJsonFields: {
      ...options.secureJsonFields,
      apiKey: false,
    },
    secureJsonData: {
      ...options.secureJsonData,
      apiKey: "",
    },
  };
}
