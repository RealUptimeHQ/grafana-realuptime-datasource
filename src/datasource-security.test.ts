import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * REA-566's security-critical requirement, checked structurally rather than
 * just by code-review convention: the frontend code that builds outgoing
 * requests (`datasource.ts`, `query-mapping.ts`, `annotations.ts`) must
 * never reference `secureJsonData` or the decrypted API key at all. It is
 * not merely unused today -- it is architecturally unreachable, because a
 * data source plugin's frontend `query()` method never receives the
 * decrypted secure value in the first place (Grafana only ever hands the
 * frontend `secureJsonFields`, a boolean "is this configured" map). The
 * actual `Authorization: Bearer <apiKey>` header is attached by Grafana's
 * own datasource-proxy route, entirely server-side, via `plugin.json`'s
 * `routes[0].headers` template. If a future change ever tried to thread the
 * key through this file (e.g. to append it to a query string "for
 * debugging"), that would defeat the entire point of a secure field --
 * the key would then show up in the browser's network tab and in
 * Grafana's query inspector. This test fails loudly if that ever happens.
 *
 * `config-editor-logic.ts`/`config-editor-logic.test.ts` cover the other
 * half: that the key is written to `secureJsonData` (never `jsonData`) in
 * the first place.
 */

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const FRONTEND_QUERY_PATH_FILES = ["./datasource.ts", "./query-mapping.ts", "./annotations.ts", "./components/QueryEditor.tsx"];

describe("the frontend query path never touches the secure API key", () => {
  it.each(FRONTEND_QUERY_PATH_FILES)("%s never references secureJsonData or apiKey", (path) => {
    const source = readSource(path);
    expect(source).not.toMatch(/secureJsonData/);
    expect(source).not.toMatch(/apiKey/);
  });

  it("plugin.json injects the Authorization header server-side, not the frontend", () => {
    const pluginJson = JSON.parse(readSource("./plugin.json"));
    expect(pluginJson.routes[0].headers[0]).toEqual({
      name: "Authorization",
      content: "Bearer {{ .SecureJsonData.apiKey }}",
    });
  });
});
