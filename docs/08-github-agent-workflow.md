# GitHub workflow (agents + MCP)

Default delivery flow when using **Cursor Agent** with **GitHub MCP**: **issue-driven**, **reviewable**, traceable.

**Repository:** `abelpz/usfm-ast`.

## Principles

1. **Changes tie to issues** when work is planned — cite `Closes #NN` in the PR.
2. **Humans merge** — agents open PRs unless a maintainer explicitly asks to merge in-task.
3. **Draft PRs** until **`CI`** (`.github/workflows/ci.yml`) is green.
4. **Local git** for implementation; use MCP for **issues, milestones, PR metadata**.

## Labels

See [`docs/14-github-bootstrap.md`](./14-github-bootstrap.md): create **`agent`**, **`needs-triage`** (and optional type labels).

## Flow

1. **Issue** — Template “Agent task”; acceptance criteria; label **`agent`** when ready. Use **Milestones** in GitHub for roadmap buckets.
2. **Branch** — `git checkout -b agent/<issue>-short-slug`
3. **Implement** — Follow repo conventions; run `bun install` and `bun run lint` / `check-types` / `test` / `build` as relevant.
4. **Push** & **open PR** — Body must include **`Closes #NN`** when it resolves the issue.
5. **Review** — Human merges; optional **Cleanup merged branch** workflow deletes the head branch.

## MCP (Cursor)

With `GITHUB_MCP_PAT` set and repo access granted, agents can create/update **issues**, **milestones**, **pull requests**, and comments via the GitHub MCP tools — same as sibling repos.
