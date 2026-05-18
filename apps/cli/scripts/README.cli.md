# @alpharages/lore

> CLI for [Lore](https://github.com/Alpharages/lore) — institutional memory for AI-driven development teams.

Lore captures lessons from code reviews and developer sessions, embeds them semantically, and surfaces the right ones to AI agents before each task — so the same mistake is never explained twice.

This CLI wires a self-hosted Lore server into your local AI tools (Cursor, Claude Code, Claude Desktop, Windsurf, Cline, Continue, and more).

---

## Requirements

- Node.js ≥ 20
- A running Lore server ([self-host in minutes](https://github.com/Alpharages/lore#quick-start))

---

## Install

```bash
npm install -g @alpharages/lore
# or
npx @alpharages/lore <command>
```

---

## Commands

### `lore init`

Initialize a new project. Creates `lore.yaml`, `CLAUDE.md`, `ops/constitution.md`, and per-repo
`REPO_IDENTITY.md`. Registers the project with the Lore server and prints an API key.

```bash
export LORE_ADMIN_SECRET=<your-admin-secret>
lore init
```

### `lore install`

Reads `lore.yaml` and configures the local machine:

- Interactive checkbox picker to select which AI tools to configure
- Writes MCP entries for: **Cursor**, **Claude Desktop**, **Claude Code**, **Google Antigravity**, **Windsurf**, **Cline**, **Continue**
- Appends a Lore include to `~/.claude/CLAUDE.md`
- Installs `post-commit` / `post-merge` git hooks in declared repos
- Records progress in `~/.lore/install-state.json` for idempotency

```bash
lore install                           # interactive picker
lore install --ide cursor,claude-code  # non-interactive, specific targets
lore install --ide all                 # configure every supported target
lore install --ide detected            # configure only installed targets
lore install --force                   # clear state and redo everything
```

### `lore inbox`

Fetch cross-project lesson suggestions and accept or reject them one-by-one.

```bash
export LORE_API_KEY=<your-project-api-key>
lore inbox
```

### `lore update`

Check the running server version against the latest compatible Docker tag, show release notes, verify migration compatibility, and upgrade in place.

```bash
lore update
```

---

## lore.yaml

A `lore.yaml` at the project root describes your workspace. `lore init` generates this for you.

```yaml
project: my-project
server: https://your-lore-server.example.com
stackTags:
  - typescript
  - postgres
repos:
  - name: api
    path: ./apps/api
  - name: web
    path: ./apps/web
```

---

## License

MIT — see [LICENSE](https://github.com/Alpharages/lore/blob/main/LICENSE)
