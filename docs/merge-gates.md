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

## Implemented decisions and test rationale

Recorded on 2026-10-02 from [PR #113](https://github.com/Y-Kanekoo/pocket-dev-relay/pull/113),
merged as [42c72fd4](https://github.com/Y-Kanekoo/pocket-dev-relay/commit/42c72fd48419bec9fdbd6cc1d1c18c03d059eee9).
The authentication choices and alternatives remain owned by
[auth-safety.md](auth-safety.md); this section supplies the test rationale rather
than duplicating that design record. It describes implemented behavior, not a
new approval of deployment or the Web/CLI product choice in #116.

### Test the boundary with the smallest useful real stack

- Unit/boundary tests isolate configuration validity, exact credential matching
  and pre-listener startup refusal. A successful comparison is not enough:
  negative tests also require that no listener or session execution is reached
- [`websocket-lifecycle.test.ts`](../tests/server/websocket-lifecycle.test.ts)
  controls deferred promises for shell and SSH startup. Duplicate start, stop or
  disconnect during startup, late completion and retry have independent expected
  call counts and fixed protocol messages. Real terminals would not make these
  event orderings deterministic
- [`auth-network.test.ts`](../tests/integration/auth-network.test.ts) adds real
  Express, multer and WebSocket transport on temporary loopback ports. Literal
  HTTP status/JSON and WS close-code expectations check the actual boundary;
  rejected starts must not call terminal/SSH factories. Synthetic files are
  inspected after upload rejection and retry, so a response alone cannot hide a
  write or leftover staging file

This split avoids two inadequate alternatives: mocked request/response objects
alone miss middleware and multipart/transport wiring; real PTY/SSH in every
protocol test couples deterministic checks to host configuration and processes.
The cost is that transport success with mocked sessions does not establish actual
terminal execution, SSH teardown or browser reconnect. #115 owns those checks.

### Implemented lifecycle and upload trade-offs

The [WS service](../src/services/websocket.ts) keeps pending startup state as well
as a running session ID. A late session is stopped after disconnect or a pending
stop instead of sending a stale success. This adds state to the handler but makes
duplicate starts and cleanup observable without starting real processes.

The [upload route](../src/routes/files.ts) checks the write flag before multer,
uses unique staging, then validates and commits the destination. Failure paths
attempt to remove staged content. The integration tests cover cleanup after
mkdir/rename rejection and successful retry. Compared with writing directly to
the destination, this adds staging/cleanup work but lets tests prove that the
covered rejected attempts preserve existing files. Host-level cleanup failure
remains a limitation; this is not a filesystem transaction or proof of every
filesystem boundary. Broader operational acceptance remains in #115.

### Evidence, ownership and revision

[package.json](../package.json) owns `test:unit` and `test:integration`;
[CI](../.github/workflows/ci.yml) owns the Node.js 20/22 matrix and validation
commands. The feature map above remains the single test-strategy index.

The [post-merge reference run](https://github.com/Y-Kanekoo/pocket-dev-relay/actions/runs/36962449550)
belongs to `42c72fd48419bec9fdbd6cc1d1c18c03d059eee9`. The earlier counts and
pre-publication CI note in auth-safety.md are historical, not the final run.
Each later PR must supply exact-head pass, fail, skipped, not-run or blocked
evidence; link logs/artifacts instead of copying them here. Fixtures must remain
synthetic and must not contain user tokens, terminal output or private files.
Revisit the boundary when the protocol, session implementation or supported host
changes, or when a real-host failure is hidden by a mock.

## Tracked follow-up work

- [#115](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/115): Docker, HTTPS, real PTY/SSH and browser reconnect acceptance
- [#116](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/116): Web/CLI decision and overlapping PR integration

[#114](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/114) is the completed
dependency repair history, not an open acceptance gap (state checked 2026-10-02).
