import { describe, expect, it } from "vitest";
import { resetApiKey, setApiKey, setBaseUrl, type RealUptimeSettings } from "./config-editor-logic.ts";

/**
 * The security-critical half of REA-566: the API key must be a Grafana
 * SECURE field, never a plain `jsonData` one. `jsonData` round-trips to the
 * frontend on every load and appears in provisioning-as-code exports;
 * `secureJsonData` is write-only and encrypted at rest. See
 * `../src/datasource-security.test.ts` for the complementary check that the
 * datasource's own request-building code never reads the key back out.
 */

function baseOptions(): RealUptimeSettings {
  return {
    id: 1,
    uid: "ds1",
    orgId: 1,
    name: "RealUptime Monitor",
    type: "realuptime-monitor-datasource",
    typeName: "RealUptime Monitor",
    typeLogoUrl: "",
    access: "proxy",
    url: "",
    user: "",
    database: "",
    basicAuth: false,
    basicAuthUser: "",
    isDefault: false,
    jsonData: {},
    secureJsonData: {},
    secureJsonFields: {},
    readOnly: false,
    withCredentials: false,
  } as unknown as RealUptimeSettings;
}

describe("setApiKey", () => {
  it("writes the key only under secureJsonData, never under jsonData", () => {
    const next = setApiKey(baseOptions(), "ru_live_secret");
    expect(next.secureJsonData?.apiKey).toBe("ru_live_secret");
    expect(next.jsonData).not.toHaveProperty("apiKey");
    expect(JSON.stringify(next.jsonData)).not.toContain("ru_live_secret");
  });

  it("does not disturb jsonData (e.g. an already-set base URL) when only the key changes", () => {
    const options = setBaseUrl(baseOptions(), "https://api.realuptime.io");
    const next = setApiKey(options, "ru_live_secret");
    expect(next.jsonData.baseUrl).toBe("https://api.realuptime.io");
    expect(next.secureJsonData?.apiKey).toBe("ru_live_secret");
  });
});

describe("resetApiKey", () => {
  it("flips secureJsonFields.apiKey back to false and blanks the in-flight value", () => {
    const configured = { ...baseOptions(), secureJsonFields: { apiKey: true }, secureJsonData: { apiKey: "stale" } };
    const next = resetApiKey(configured);
    expect(next.secureJsonFields?.apiKey).toBe(false);
    expect(next.secureJsonData?.apiKey).toBe("");
  });
});

describe("setBaseUrl", () => {
  it("writes baseUrl under jsonData (non-secret) and touches nothing else", () => {
    const next = setBaseUrl(baseOptions(), "https://api.realuptime.io");
    expect(next.jsonData.baseUrl).toBe("https://api.realuptime.io");
    expect(next.secureJsonData).toEqual({});
  });
});
