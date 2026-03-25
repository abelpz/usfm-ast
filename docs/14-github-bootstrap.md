# GitHub bootstrap (labels, branch protection, PAT)

One-time setup so automation matches this repo.

## Labels (agent workflow)

```sh
OWNER=abelpz
REPO=usfm-ast

gh label create agent --color 0E8A16 --description "Work suitable for an AI coding agent" --repo "$OWNER/$REPO" 2>/dev/null || true
gh label create needs-triage --color FBCA04 --description "Human should refine scope before an agent starts" --repo "$OWNER/$REPO" 2>/dev/null || true
```

## Milestones

Create **Milestones** in **Issues → Milestones** (or via `gh api` / MCP). Attach issues to a milestone for roadmap tracking — same pattern as [Biblia Studio](https://github.com/abelpz/biblia-studio).

## Cursor — GitHub MCP

Set **`GITHUB_MCP_PAT`** with access to **`abelpz/usfm-ast`** — [`docs/07-github-mcp.md`](./07-github-mcp.md). Copy [`.env.example`](../.env.example) locally; never commit secrets.

## Branch protection

After green CI, require the **`checks`** job — [`docs/09-ci-and-branch-protection.md`](./09-ci-and-branch-protection.md).

## Related

- [`docs/08-github-agent-workflow.md`](./08-github-agent-workflow.md)
