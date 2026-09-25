import { describe, expect, it } from "vitest";
import path from "node:path";
// @ts-expect-error -- build tooling, deliberately untyped plain .mjs (see the
// module comment in .config/bundler/utils.mjs for why it is not TypeScript).
import { getEntries } from "../.config/bundler/utils.mjs";

// The webpack entry map is the one part of this plugin's build that can fail
// to nothing. `getEntries()` discovers `src/module.ts` by globbing, and an
// empty result is not an error to webpack: it reports "compiled
// successfully" and emits a `dist/` holding plugin.json, README, LICENSE and
// the logo, with no `module.js`. Grafana's loader cannot load that, and the
// catalog's signing step happily signs it, so the first signal would be a
// reviewer or a customer installing a plugin that does nothing.
//
// That is exactly what happened on Windows before REA-703: `path.dirname`
// returns backslash-separated paths there, glob reads `\` as an escape, and
// the second glob matched nothing. This test pins the contract that matters
// (one entry, named `module`, pointing at the real source file) rather than
// the path-separator detail, so it also catches a future rename or a moved
// src directory.
describe("webpack entry discovery", () => {
  it("finds exactly the module entry Grafana's loader needs", async () => {
    const previousCwd = process.cwd();
    // getEntries() reads from process.cwd(), the package root: that is how
    // webpack-cli invokes it (`webpack -c ./.config/...` runs with the
    // package as cwd), and vitest may run from the repo root instead.
    process.chdir(path.resolve(import.meta.dirname, ".."));
    try {
      const entries = await getEntries();

      expect(Object.keys(entries)).toEqual(["module"]);
      expect(entries.module.split(path.sep).join("/")).toMatch(/\/src\/module\.ts$/);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
