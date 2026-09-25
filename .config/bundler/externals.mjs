/**
 * Everything Grafana itself already provides to every plugin at runtime via
 * its own AMD loader -- bundling any of these into `dist/module.js` would
 * both bloat the artifact and risk a second, out-of-sync copy of React or
 * `@grafana/data` running inside the host page. Matches
 * `@grafana/create-plugin`'s own scaffolded externals list, trimmed to the
 * subset a dependency-free-of-legacy-Angular/jQuery data source plugin like
 * this one actually imports (`rxjs`, `react`, and the three `@grafana/*`
 * packages) plus the few entries that must stay listed regardless of
 * whether this plugin imports them, because Grafana's host page always
 * provides them under these exact module ids.
 */
export const externals = [
  // Required for dynamic publicPath resolution.
  { "amd-module": "module" },
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "rxjs",
  /^@grafana\/ui/i,
  /^@grafana\/runtime/i,
  /^@grafana\/data/i,

  // Mark legacy SDK imports as external if their name starts with the
  // "grafana/" prefix.
  ({ request }, callback) => {
    const prefix = "grafana/";
    if (request?.startsWith(prefix)) {
      return callback(undefined, request.slice(prefix.length));
    }
    callback();
  },
];
