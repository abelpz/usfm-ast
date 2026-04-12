# Root-level tests

## `tests/integration/`

Cross-package checks that import **published package entries** (`@usfm-tools/parser`, `@usfm-tools/editor-adapters`, …). Workspace `dist/` outputs must exist.

- **Local:** `bun run test:integration` (runs a filtered `turbo build` for `@usfm-tools/editor-adapters`, then Jest).
- **CI:** Jest runs **after** `bun run build` so all packages are already compiled.

Package-scoped suites live under `packages/*/tests/` and are executed via `bun run test` (Turbo).

## `tests/performance/`

Parser performance / budget tests; see root `package.json` script `test:performance`.
