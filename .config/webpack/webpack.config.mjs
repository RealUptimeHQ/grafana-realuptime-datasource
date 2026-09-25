/**
 * Bundles `src/module.ts` into `dist/module.js`, an AMD module Grafana's own
 * plugin loader can `System.import`, plus everything `copyFilePatterns`
 * copies alongside it (`plugin.json`, `README.md`, `LICENSE`, the logo).
 * Adapted from `@grafana/create-plugin`'s own scaffolded
 * `.config/webpack/webpack.config.ts` (the golden path every Grafana data
 * source plugin is generated with), trimmed for this plugin's actual
 * surface:
 *
 *  - No Angular/jQuery/moment/lodash/d3/emotion externals or CSS/Sass/image/
 *    font loaders: this plugin has no legacy-SDK imports and ships no
 *    stylesheet or image import (the logo is copied as a static file, not
 *    imported from TS), so those rules and externals would just be dead
 *    weight -- see `../bundler/externals.mjs`'s own comment for the trimmed
 *    external list.
 *  - No dev-mode `ESLintPlugin`/`ForkTsCheckerWebpackPlugin`/
 *    `LiveReloadPlugin`: this repo lints with Biome (`pnpm lint` at the
 *    repo root, AGENTS.md "Branches, merges, and deploys") and typechecks with
 *    plain `tsc --noEmit` (this package's own `typecheck` script), not
 *    ESLint or an in-webpack type-checker fork; running a second, unused
 *    linter here would just be another thing to keep configured.
 *  - Plain `.mjs`, not `.ts`: webpack-cli loads this file directly at build
 *    time. A `.ts` config needs a second TypeScript loader (ts-node or
 *    equivalent) registered underneath webpack-cli, with its own tsconfig
 *    resolution and version-compatibility surface, entirely separate from
 *    this package's own `tsc --noEmit` over `src/**` -- one fewer moving
 *    part for build tooling that has no types to check.
 *
 * Everything else -- the AMD `library.type`, the `amd-module`
 * public-path virtual module, `%VERSION%`/`%TODAY%` substitution into the
 * copied `plugin.json`/`README.md`, subresource integrity, and the
 * production Terser pass -- is unchanged from the scaffold, because that is
 * exactly the machinery Grafana's plugin loader and the catalog's signing
 * step expect.
 */
import path from "node:path";
import CopyWebpackPlugin from "copy-webpack-plugin";
import ReplaceInFileWebpackPlugin from "replace-in-file-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import { SubresourceIntegrityPlugin } from "webpack-subresource-integrity";
import VirtualModulesPlugin from "webpack-virtual-modules";
import { copyFilePatterns } from "../bundler/copyFiles.mjs";
import { DIST_DIR, SOURCE_DIR } from "../bundler/constants.mjs";
import { externals } from "../bundler/externals.mjs";
import { getEntries, getPackageJson, getPluginJson, isWSL } from "../bundler/utils.mjs";
import { BuildModeWebpackPlugin } from "./BuildModeWebpackPlugin.mjs";

const pluginJson = getPluginJson();
const pluginVersion = getPackageJson().version;

const virtualPublicPath = new VirtualModulesPlugin({
  "node_modules/grafana-public-path.js": `
import amdMetaModule from 'amd-module';

__webpack_public_path__ =
  amdMetaModule && amdMetaModule.uri
    ? amdMetaModule.uri.slice(0, amdMetaModule.uri.lastIndexOf('/') + 1)
    : 'public/plugins/${pluginJson.id}/';
`,
});

const config = async (env) => {
  const baseConfig = {
    cache: {
      type: "filesystem",
      buildDependencies: {
        config: [path.resolve(process.cwd(), ".config", "webpack", "webpack.config.mjs")],
      },
    },

    context: path.join(process.cwd(), SOURCE_DIR),

    devtool: env.production ? "source-map" : "eval-source-map",

    entry: await getEntries(),

    externals,

    mode: env.production ? "production" : "development",

    module: {
      rules: [
        // Must come first, or it breaks source maps.
        {
          test: /src\/(?:.*\/)?module\.tsx?$/,
          use: [{ loader: "imports-loader", options: { imports: "side-effects grafana-public-path" } }],
        },
        {
          exclude: /(node_modules)/,
          test: /\.[tj]sx?$/,
          use: {
            loader: "swc-loader",
            options: {
              jsc: {
                baseUrl: path.resolve(process.cwd(), SOURCE_DIR),
                target: "es2015",
                loose: false,
                parser: { syntax: "typescript", tsx: true, decorators: false, dynamicImport: true },
                transform: { react: { runtime: "automatic" } },
              },
            },
          },
        },
      ],
    },

    optimization: {
      minimize: Boolean(env.production),
      minimizer: [
        new TerserPlugin({
          extractComments: { banner: false, filename: "LICENSE.txt" },
          terserOptions: {
            format: { comments: (_match, { type, value }) => type === "comment2" && value.trim().startsWith("[create-plugin]") },
            compress: { drop_console: ["log", "info"] },
          },
        }),
      ],
    },

    output: {
      clean: true,
      filename: "[name].js",
      chunkFilename: env.production ? "[name].js?_cache=[contenthash]" : "[name].js",
      library: { type: "amd" },
      path: path.resolve(process.cwd(), DIST_DIR),
      publicPath: `public/plugins/${pluginJson.id}/`,
      uniqueName: pluginJson.id,
      crossOriginLoading: "anonymous",
    },

    plugins: [
      new BuildModeWebpackPlugin(),
      virtualPublicPath,
      new webpack.BannerPlugin({
        banner: `/* [create-plugin] plugin: ${pluginJson.id}@${pluginVersion} */`,
        raw: true,
        entryOnly: true,
      }),
      new CopyWebpackPlugin({ patterns: copyFilePatterns }),
      new ReplaceInFileWebpackPlugin([
        {
          dir: DIST_DIR,
          test: [/(^|\/)plugin\.json$/, /(^|\/)README\.md$/],
          rules: [
            { search: /%VERSION%/g, replace: pluginVersion },
            { search: /%TODAY%/g, replace: new Date().toISOString().substring(0, 10) },
            { search: /%PLUGIN_ID%/g, replace: pluginJson.id },
          ],
        },
      ]),
      new SubresourceIntegrityPlugin({ hashFuncNames: ["sha256"] }),
    ],

    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx"],
      modules: [path.resolve(process.cwd(), "src"), "node_modules"],
      unsafeCache: true,
    },
  };

  if (isWSL()) {
    baseConfig.watchOptions = { poll: 3000, ignored: /node_modules/ };
  }

  return baseConfig;
};

export default config;
