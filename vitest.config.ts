import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @grafana/data pulls in moment-timezone, a CommonJS package whose
    // named-export shape Node's own ESM loader can't statically analyze
    // (`Named export 'tz' not found`) when vitest runs it un-transformed.
    // Inlining it (and every @grafana/* package, which shares the same
    // transitive dependency) routes it through vitest's esbuild-based
    // transform instead, which handles the CJS/ESM interop the same way a
    // browser bundler would.
    server: {
      deps: {
        inline: [/@grafana\//, "moment-timezone", "moment"],
      },
    },
  },
});
