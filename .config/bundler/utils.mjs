/**
 * Adapted, with attribution, from `@grafana/create-plugin`'s own generated
 * `.config/bundler/utils.ts` (the golden-path scaffold every other Grafana
 * data source plugin ships), trimmed to what this package's webpack config
 * actually calls -- see `../webpack/webpack.config.mjs`'s module comment for
 * what else was trimmed and why.
 *
 * Plain `.mjs`, not TypeScript: this is build tooling webpack-cli loads
 * directly at build time, not part of the plugin's own typechecked source
 * (`src/**`, covered by this package's `typecheck` script). Loading a `.ts`
 * webpack config needs a second, separately-versioned TypeScript loader
 * (ts-node or equivalent) registered underneath webpack-cli, which is one
 * more moving part than a handful of small, already-untyped helper
 * functions need.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { glob } from "glob";
import { SOURCE_DIR } from "./constants.mjs";

export function isWSL() {
  if (process.platform !== "linux") {
    return false;
  }
  if (os.release().toLowerCase().includes("microsoft")) {
    return true;
  }
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

function loadJson(jsonPath) {
  const rawJson = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(rawJson);
}

export function getPackageJson() {
  return loadJson(path.resolve(process.cwd(), "package.json"));
}

export function getPluginJson() {
  return loadJson(path.resolve(process.cwd(), `${SOURCE_DIR}/plugin.json`));
}

export function hasReadme() {
  return fs.existsSync(path.resolve(process.cwd(), SOURCE_DIR, "README.md"));
}

// Support bundling nested plugins by finding all plugin.json files in src
// then checking for a sibling module.[jt]sx? file. This plugin has exactly
// one, at src/module.ts, but keeping the same discovery logic the official
// scaffold uses means a future nested-plugin split needs no config change.
export async function getEntries() {
  const pluginsJson = await glob("**/src/**/plugin.json", { absolute: true });

  const plugins = await Promise.all(
    pluginsJson.map((pluginJson) => {
      // `glob` returns platform-native paths, so on Windows `path.dirname`
      // hands back a backslash-separated string. Glob patterns are always
      // POSIX-shaped and read `\` as an escape character, so interpolating
      // one produces a pattern that matches nothing.
      //
      // The failure is silent and total: `getEntries()` returns `{}`,
      // webpack reports "compiled successfully", and `dist/` ends up with
      // plugin.json, README, LICENSE and the logo but no `module.js` at all,
      // i.e. a plugin Grafana's loader cannot load. Found 2026-09-06
      // (REA-703) while building the catalog-submission ZIP on Windows;
      // `src/build-entries.test.ts` fails if this normalization is removed.
      const folder = path.dirname(pluginJson).split(path.sep).join("/");
      return glob(`${folder}/module.{ts,tsx,js,jsx}`, { absolute: true });
    }),
  );

  return plugins.reduce((result, modules) => {
    return modules.reduce((innerResult, module) => {
      const pluginPath = path.dirname(module);
      const pluginName = path.relative(process.cwd(), pluginPath).replace(/src\/?/i, "");
      const entryName = pluginName === "" ? "module" : `${pluginName}/module`;
      innerResult[entryName] = module;
      return innerResult;
    }, result);
  }, {});
}
