# Instructions for AI coding agents

1. Read [`docs/08-github-agent-workflow.md`](./docs/08-github-agent-workflow.md) for issue → PR delivery. Parsing and CLIs: [`docs/10-parsing-quickstart.md`](./docs/10-parsing-quickstart.md).
2. **GitHub MCP:** [`docs/07-github-mcp.md`](./docs/07-github-mcp.md) — `GITHUB_MCP_PAT` must include **`abelpz/usfm-ast`** for issues, milestones, and PRs.
3. **Before finishing:** run `bun install` (if needed), then `bun run lint`, `bun run check-types`, `bun run build`. For **tests**, run `CI=true bun run test` to match GitHub Actions (parser + adapters run full Jest except performance tests; see [`docs/09-ci-and-branch-protection.md`](./docs/09-ci-and-branch-protection.md)). After intentional **`USFMParser` / `toJSON()`** output changes, run `bun run regenerate:example-usj` and commit updated `examples/usfm-markers/**/example.usj`.
4. **Humans merge** PRs unless a maintainer explicitly asks the agent to merge that task.
5. **No secrets** in commits — use `.env` locally only (see [`.env.example`](./.env.example)).

When **MCP tools** are used for GitHub, follow the same patterns as [`abelpz/biblia-studio`](https://github.com/abelpz/biblia-studio): draft PRs, **`Closes #NN`**, update issue/milestone text when scope changes.
