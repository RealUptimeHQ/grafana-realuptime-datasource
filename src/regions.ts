/**
 * Vendored copy of `packages/db/region-catalog.ts`'s `LIVE_REGIONS`/
 * `LIVE_REGION_LABELS` (REA-566). This plugin ships to a public mirror
 * (`scripts/publish-sdk-mirrors.mjs`, same pattern the errors SDKs use), so
 * it cannot import the private monorepo's `@realuptime/db` package -- the
 * query editor's region picker needs its own copy of the live fleet list,
 * the same way each SDK mirror vendors its own `scrub-vectors.json` rather
 * than reaching across the workspace boundary.
 *
 * Re-sync this file by hand whenever a region goes live
 * (docs/runbooks/add-probe-region.md); `region-catalog.test.ts` in
 * `packages/db` is the source of truth this can drift from, not the other
 * way around.
 */

export const LIVE_REGIONS = ["iad", "sjc", "fra", "nrt", "ord", "yyz", "lhr", "sin", "syd", "gru"] as const;

export type LiveRegion = (typeof LIVE_REGIONS)[number];

export const LIVE_REGION_LABELS: Record<LiveRegion, string> = {
  iad: "US-East",
  sjc: "US-West",
  fra: "Europe",
  nrt: "Asia-Pacific",
  ord: "US-Central",
  yyz: "Canada",
  lhr: "UK",
  sin: "Southeast Asia",
  syd: "Australia",
  gru: "South America",
};

export function isLiveRegion(code: string): code is LiveRegion {
  return (LIVE_REGIONS as readonly string[]).includes(code);
}
