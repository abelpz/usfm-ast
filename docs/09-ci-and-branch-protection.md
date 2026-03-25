# CI and branch protection

## Continuous Integration

**Workflow:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

On **push** to `main` and **pull requests** targeting `main`:

1. Checkout on Ubuntu
2. **Bun** `1.3.3` (see root `packageManager`) + **Node** `>=18` for tooling where required (`engines`)
3. `bun install --frozen-lockfile`
4. `bun run lint` → `bun run check-types` → `bun run test` → `bun run build` (orchestrated by **Turborepo** — [`turbo.json`](../turbo.json))

GitHub Actions sets **`CI=true`**. For **`@usfm-tools/parser`** and **`@usfm-tools/adapters`**, Jest is limited to [`tests/ci-smoke.test.ts`](../packages/usfm-parser/tests/ci-smoke.test.ts) / the adapters equivalent so the workflow stays green while legacy suites (expectations for an older AST shape) are updated. Locally, omit `CI` to run the full test files under `tests/`.

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

## Related

- [`docs/14-github-bootstrap.md`](./14-github-bootstrap.md)
