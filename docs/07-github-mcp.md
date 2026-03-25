# GitHub MCP (Cursor)

Project-level MCP config: [`.cursor/mcp.json`](../.cursor/mcp.json). Use the same **GitHub remote MCP** pattern as other org repos ([official server](https://github.com/github/github-mcp-server)).

## Token

1. Create a **fine-grained PAT** (or classic with minimal scopes) — see [GitHub docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).
2. **Repository access:** include **`abelpz/usfm-ast`** (and e.g. **`abelpz/biblia-studio`** if one Cursor workspace works across both).
3. **Permissions** for day-to-day agent work: **Metadata**, **Contents**, **Issues**, **Pull requests** (Read/Write as needed); **Actions** read if you inspect workflows.

## Environment

Expose the token as **`GITHUB_MCP_PAT`** (same variable name as Biblia Studio so one user-level env can cover multiple repos).

- **Windows (User env):** set in System Properties → Environment Variables, or PowerShell `[System.Environment]::SetEnvironmentVariable("GITHUB_MCP_PAT","…","User")`.
- **macOS / Linux:** `export GITHUB_MCP_PAT=…` in your shell profile.

Restart **Cursor** after changing the variable.

## Verify

**Settings → MCP:** GitHub server healthy with a non-zero tool count. In Agent chat, try listing issues for `abelpz/usfm-ast`.

## Troubleshooting

See [GitHub MCP server README](https://github.com/github/github-mcp-server) for PAT scope errors (**403**, empty tool list). Prefer **Bearer** auth in `.cursor/mcp.json`; fully quit Cursor if tools stay empty.
