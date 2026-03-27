# Project goal

This monorepo provides **libraries and tooling** for [USFM](https://ubsicap.github.io/usfm/) and **USJ** so downstream apps (scripture editors, viewers, print pipelines) can parse, transform, validate, and serialize scripture markup reliably.

## Definition of success (maintainer contract)

1. **Green automation:** On every PR, `bun run lint`, `bun run check-types`, `bun run build`, and `bun run test` succeed with **`CI=true`** (matching GitHub Actions).
2. **Canonical parser:** **`USFMParser`** (`@usfm-tools/parser`) is the supported production API for USFM → structured USJ. **`UsfmParser`** remains an experimental registry-driven implementation until it reaches parity and replaces or merges with `USFMParser`.
3. **Golden examples:** Files under `examples/usfm-markers/**/example.usj` match **`USFMParser.prototype.toJSON()`** output for the paired `example.usfm` (regenerated when parser behavior intentionally changes).
4. **Adapters:** `@usfm-tools/adapters` tests exercise real visitor flows against parser output (not smoke-only in CI).
5. **Honest packaging:** Packages published to npm declare accurate `repository` URLs and versioning; scaffold-only packages stay clearly marked until implemented.

## Non-goals (for this milestone)

- Finishing every `@usj-tools/*` stub in one pass.
- Guaranteeing **UsfmParser** matches all goldens (tracked separately until parity work lands).
