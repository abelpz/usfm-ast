# Monorepo tools comparison

## Current stack (this repository)

This monorepo uses:

- **[Bun](https://bun.sh/)** — package manager and runtime (`bun.lock`, `workspaces` in root `package.json`).
- **[Turborepo](https://turbo.build/)** — task graph, caching, and parallel `build` / `lint` / `check-types` / `test` (see root `turbo.json`).

Typical commands from the repository root:

```bash
bun install
bun run build
bun run lint
bun run check-types
bun run test
```

Run work in one package under `packages/<dir>`:

```bash
bun run do -- usfm-parser test
```

Or scope Turborepo:

```bash
bunx turbo run build --filter=@usfm-tools/parser
```

Publishing still goes through npm-compatible tooling (see root `publish:*` scripts).

---

## Feature comparison (Bun + Turbo vs alternatives)

| Feature | Bun workspaces + Turborepo | pnpm workspaces | Nx | Lerna |
| --------|----------------------------|-----------------|-----|-------|
| **Performance** | Very fast installs; incremental task cache | Very fast installs | Fast; strong caching | Moderate |
| **Setup** | `package.json` workspaces + `turbo.json` | `pnpm-workspace.yaml` + root scripts | Heavier config | Simple, dated |
| **Task orchestration** | Turborepo graph and caching | Mostly serial/filter scripts; can add Turbo | First-class | Basic |
| **Library focus** | Strong fit | Strong fit | Often app-centric | Publishing-focused |
| **Publishing** | npm / `npm publish` per package | Excellent filters | OK | Excellent |

---

## Bun workspaces + Turborepo

### Pros

- Single toolchain: install and run scripts with Bun; CI can match local commands.
- Turborepo gives ordered builds across packages (`^build`, etc.) without ad-hoc `pnpm --filter` chains.
- Fits multi-package libraries the same way as other modern monorepos (e.g. Biblia Studio).

### Cons

- Contributors must install Bun (or use CI as reference).
- Turborepo adds a small amount of config to learn (`turbo.json`).

### Configuration (reference)

Root `package.json` (workspaces + scripts) and `turbo.json` (tasks). The lockfile is committed as `bun.lock` (Bun 1.x).

---

## pnpm workspaces (alternative)

### Pros

- Mature workspace protocol; strict `node_modules` layout.
- Great filtering and publishing ergonomics without Turborepo.

### Cons

- Another install tool if the rest of the org standardizes on Bun.
- Heavy use of `--filter` for cross-package builds unless you add Turborepo or similar.

**Resources:** [pnpm workspaces](https://pnpm.io/workspaces)

---

## Nx

### Pros

- Deep task graph, generators, affected commands — strong for large apps.

### Cons

- Often more setup than needed for a library-only monorepo.

**Resources:** [Nx](https://nx.dev/)

---

## Lerna

### Pros

- Simple publishing and versioning story; well known.

### Cons

- Less active; weaker defaults for modern install/cache than pnpm or Bun.

**Resources:** [Lerna](https://lerna.js.org/)

---

## Historical note

An older iteration of this repo used **pnpm** workspaces. Migration to **Bun + Turborepo** keeps behavior (workspaces, scoped packages) while aligning install and CI with current tooling. Legacy helper scripts may still mention pnpm for historical context only.

## Resources

- [Bun documentation](https://bun.sh/docs)
- [Turborepo documentation](https://turbo.build/docs)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Monorepo.tools](https://monorepo.tools/)
