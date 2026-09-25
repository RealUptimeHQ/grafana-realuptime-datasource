import webpack from "webpack";

const PLUGIN_NAME = "BuildModeWebpack";

/** Stamps the build mode (`production`/`development`) onto the emitted
 * `plugin.json`, so `buildMode` in an installed plugin's manifest always
 * reflects how its dist/ was actually built. Verbatim from
 * `@grafana/create-plugin`'s own scaffold. */
export class BuildModeWebpackPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        async () => {
          const assets = compilation.getAssets();
          for (const asset of assets) {
            if (asset.name.endsWith("plugin.json")) {
              const pluginJsonString = asset.source.source().toString();
              const pluginJsonWithBuildMode = JSON.stringify(
                { ...JSON.parse(pluginJsonString), buildMode: compilation.options.mode },
                null,
                4,
              );
              compilation.updateAsset(asset.name, new webpack.sources.RawSource(pluginJsonWithBuildMode));
            }
          }
        },
      );
    });
  }
}
