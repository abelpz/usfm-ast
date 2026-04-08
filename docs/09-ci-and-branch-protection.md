# CI and branch protection

## Continuous Integration

**Workflow:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

On **push** to `main` and **pull requests** targeting `main`:

1. Checkout on Ubuntu
2. **Bun** `1.3.3` (see root `packageManager`) + **Node** `>=18` for tooling where required (`engines`)
3. `bun install --frozen-lockfile`
4. `bun run lint` → `bun run check-types` → `bun run test` → `bun run examples:check` → `bun run build` (orchestrated by **Turborepo** — [`turbo.json`](../turbo.json))

The **Test** step sets `RUN_RELAY_POOL_TESTS=1` so `@usfm-tools/relay-server` Vitest integration tests run on Linux (`vitest-pool-workers` + Durable Objects). See [`docs/21-collab-relay-server.md`](./21-collab-relay-server.md).

`bun run examples:check` runs `check-missing-usj.sh` to ensure each `examples/usfm-markers/**/example.usfm` has a paired `example.usj`. **`@usfm-tools/parser`** also runs a small **perf budget** test (`parser.perf-budget.test.ts`) on every CI run (separate from ignored `parser.performance.test.ts`).

GitHub Actions sets **`CI=true`**. **`@usfm-tools/parser`** and **`@usfm-tools/adapters`** run their full Jest suites except **`performance`** tests (`testPathIgnorePatterns` in each package’s `jest.config.js`). Golden `example.usj` files under `examples/usfm-markers/` are regenerated from **`USFMParser`** when parser output changes intentionally (`bun run regenerate:example-usj` after building the parser).

## Dependabot

**Config:** [`.github/dependabot.yml`](../.github/dependabot.yml) — npm + GitHub Actions, weekly.

## CodeQL

**Workflow:** [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml)  
**Config:** [`.github/codeql/codeql-config.yml`](../.github/codeql/codeql-config.yml)

## Branch protection (manual)

After the first **green** CI run on `main` or a PR:

1. **Settings** → **Branches** → rule for `main`
2. Require **pull request** before merging (optional for solo maintainers)
3. Require status check **`checks`** (job id from `ci.yml`)

Exact check name in the UI may appear as **`CI / checks`**.

## Housekeeping

- **Turborepo cache:** `.turbo/` is gitignored. If it was ever committed by mistake, remove it from the index with `git rm -r --cached .turbo` (then commit). Do not commit cache artifacts.

## Related

- [`docs/14-github-bootstrap.md`](./14-github-bootstrap.md)
