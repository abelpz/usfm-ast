# Production readiness

How to ship and operate **`@usfm-tools/*`** and **`@usj-tools/*`** packages in real apps.

## Versioning and releases

- Each **published** package under `packages/` has its own **semver** in `package.json`.
- **Breaking** changes to the public API or to stable JSON shapes (e.g. `USFMParser.prototype.toJSON()`) require a **major** bump; document them in the root [`CHANGELOG.md`](../CHANGELOG.md).
- Publish scripts: `bun run publish:usfm`, `bun run publish:usj`, or `bun run publish:all` (see [`scripts/publish-scope.cjs`](../scripts/publish-scope.cjs)). Run `bun run build` first.
- **npm provenance** (supply chain attestation): from a clean tree, with npm 9+ and appropriate permissions, you can use `npm publish --access public --provenance` from each package directory, or configure your CI to publish with OIDC. See [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Parser logging (`USFMParser`)

- **`getLogs()`** always returns structured `{ type: 'warn' | 'error', message }[]` for the last parse, regardless of other options.
- **Note:** `USFMMarkerRegistry` is a **process-wide singleton**. Unknown markers are inferred once per marker name; repeated parses of the same unknown marker will not emit duplicate “unsupported marker” warnings. Integration tests should vary marker names if they need to assert logging every time.
- **`silentConsole: true`** — omit `console.warn` / `console.error` for parse-time messages (use in servers and tests to avoid noisy stdout).
- **`logger: { warn?, error? }`** — custom sinks; if a handler is provided for a channel, it is used **instead of** `console` for that channel (unless you combine with `silentConsole` only for the default path).

Default behavior matches earlier releases: warnings and errors are mirrored to `console` when no custom logger is set and `silentConsole` is not true.

## USFM / USJ compatibility

| Topic | Behavior |
| ----- | -------- |
| **USJ version** | Output is **USJ 3.1** (`type: 'USJ', version: '3.1'`). Input may declare `\\usfm 3.0`; a **warning** may be logged about mismatch. |
| **Snippets** | Verse-first fragments without `\\p` are accepted; root-level text after `\\v` / notes / milestones matches common USJ patterns. |
| **Coverage** | Marker examples under `examples/usfm-markers/` are golden-checked against `toJSON()` when regenerated. |

## Runtimes

- **Node**: primary target; `engines.node >= 18` at repo root.
- **Browser**: not guaranteed unless a package documents a browser build; adapters that use `DOMParser` (e.g. XML checks in tests) are **Node / test** utilities unless stated otherwise.

## Errors vs warnings

- The parser generally **continues** and returns an AST while **warning** (unknown markers, version mismatch, etc.). Treat **`getLogs()`** as the integration point for telemetry.
- **Throwing** behavior is reserved for true parse failures (see API docs / tests for specific cases).

## Related

- [`00-project-goal.md`](./00-project-goal.md) — maintainer contract  
- [`09-ci-and-branch-protection.md`](./09-ci-and-branch-protection.md) — CI pipeline  
- [`10-parsing-quickstart.md`](./10-parsing-quickstart.md) — parse / CLI quickstart  
