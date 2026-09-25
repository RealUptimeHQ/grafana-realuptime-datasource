import { getPluginJson, hasReadme } from "./utils.mjs";

const pluginJson = getPluginJson();
const logoPaths = Array.from(new Set([pluginJson.info?.logos?.large, pluginJson.info?.logos?.small])).filter(Boolean);
const screenshotPaths = pluginJson.info?.screenshots?.map((s) => s.path) || [];

export const copyFilePatterns = [
  // If src/README.md exists use it; otherwise the package root README.
  { from: hasReadme() ? "README.md" : "../README.md", to: ".", force: true },
  { from: "plugin.json", to: "." },
  { from: "../LICENSE", to: "." },
  { from: "../CHANGELOG.md", to: ".", force: true },
  { from: "**/*.json", to: "." },
  ...logoPaths.map((logoPath) => ({ from: logoPath, to: logoPath })),
  ...screenshotPaths.map((screenshotPath) => ({ from: screenshotPath, to: screenshotPath })),
];
