# Merge acceptance gates

Apply these gates to the final PR head against the latest base. A green job whose
command suppresses an error is not evidence of a pass. CI no longer masks audit
failure. No credentials, network exposure, deployment, repository protection, or
product consolidation decisions are included.

## Required evidence

- On Node.js 20 and 22: clean `npm ci`, source and test type checks,
  `test:unit`, `test:integration`, and all build targets pass
- ESLint has zero warnings; source and new integration/lifecycle test formatting checks pass
- Unmasked `npm audit --audit-level=high` passes on the lockfile. Record all
  remaining findings and evaluate reachability; CI success is not a blanket
  declaration that deployment is safe
- Independent review finds no unresolved material correctness/security issue
- Immediately before merge, re-read the head/base and required checks; specify
  the exact reviewed head, never bypass rules, and observe post-merge CI to completion
- Deferred verification/architecture work has Issues with acceptance and test plans

## Feature to evidence map

| Feature | Unit / boundary tests | Real protocol integration |
| --- | --- | --- |
| Token configuration | `auth-config`, `auth-boundary`, `auth-startup`: unset/empty/whitespace/placeholders, HTTP/HTTPS pre-listener gate, exact token compatibility | HTTP wrong/missing/scheme mismatch rejected; valid credential retry |
| HTTP authorization | `auth`, `auth-boundary`: production and legacy helpers reject invalid config; localhost/Host/Origin are not credentials | actual 401 JSON, repeated denial followed by 200 |
| WS authorization | `auth-boundary`: missing/wrong/duplicate query parameter semantics; denied connection attaches no message listener | actual 4001 close before session execution; valid connection after denial; close cleanup |
| Async WS lifecycle | `websocket-lifecycle`: duplicate pending shell/SSH start, disconnect before completion, pending stop, failure/retry | authorized start/close uses real WS transport; terminal/SSH implementations are mocked |
| Upload write boundary | production router checks feature flag before multer and stages under a unique name | disabled/unauthorized upload, invalid destination, oversized upload, retry; existing files preserved on rejection |
| Existing API behavior | feature files under `tests/server` cover clipboard, snippets, health, files, sessions, URLs and utilities | existing 190 tests retained alongside focused additions |

The network fixture exercises real Express/multer/WebSocket stacks on ephemeral
loopback ports with temporary files and test-only tokens. It does not create real
terminals, SSH sessions, external AI calls, public listeners, Docker deployments,
or TLS credentials. Docker, HTTPS certificate flows, real PTY/SSH sessions and
browser reconnect behavior remain separately scoped acceptance work.

Do not merge the overlapping #37/#46 changes without re-running these gates. #77
changes the product into a CLI and requires an explicit architecture decision;
it is not part of this safety work.

## Tracked follow-up work

- https://github.com/Y-Kanekoo/pocket-dev-relay/issues/114
- https://github.com/Y-Kanekoo/pocket-dev-relay/issues/115
- https://github.com/Y-Kanekoo/pocket-dev-relay/issues/116
