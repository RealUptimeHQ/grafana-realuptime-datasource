# Changelog

## 0.1.1

Fixes for the Grafana catalog's automated checks (REA-703): moved the build
tooling onto `@grafana/create-plugin`'s own scaffold (`.config/webpack`,
`.config/bundler`, tsconfig, eslint and prettier config all now match a
freshly-scaffolded plugin, satisfying the `non-standard-frontend-build-tooling`
check), removed a source comment that named the restricted
`window.grafanaBootData` property (`code-rules-window-properties`), and added
a config-editor screenshot to `plugin.json`'s `info.screenshots`.

## 0.1.0

Initial release (REA-566): checks/results panel queries (uptime, latency,
status code), interval-to-step downsampling, and incident annotations.
