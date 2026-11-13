# Security

This is the RealUptime Monitor data source for Grafana. It is a
frontend-only plugin: it stores the API key in Grafana's encrypted secure
JSON data, and the browser never receives it back after it is saved.

## Reporting a vulnerability

Email security@realuptime.io with the subject "RealUptime security report".
Please do not open a public issue for anything you believe is exploitable.

- The policy (scope, what we commit to in response, coordinated disclosure,
  and the protection given to good-faith researchers) is at
  https://realuptime.io/security/disclosure.
- The same contact in machine-readable form (RFC 9116):
  https://realuptime.io/.well-known/security.txt.

Include what is affected, how to reproduce it and the impact you believe it
has. Do not include secrets you do not need to share.

## Supported versions

The latest release receives security fixes. A fix ships as a new release;
every release is listed in CHANGELOG.md and on the releases page.
