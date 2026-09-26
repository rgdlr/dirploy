# Dirploy Future Roadmap & Development Tasks

This document contains prioritized feature proposals, architectural requirements, and task checklists designed for AI agents and maintainers implementing subsequent versions of **Dirploy** (`v0.2.0`+).

---

## Architectural Invariants (Must Be Upheld)

Every new feature or command must strictly adhere to the project invariants:
1. **Zero Runtime Dependencies**: `dependencies` in `package.json` must remain empty `{}`. Use standard Node.js APIs (`node:fs`, `node:path`, `node:util parseArgs`, `node:child_process`).
2. **Subdirectory Isolation**: Operations must only affect the targeted path. Sibling projects and root files must remain untouched.
3. **No Force Push**: Commands must never rewrite remote Git history.
4. **Credential Safety**: Authentication tokens and secrets must never leak into terminal output, configuration files, or error messages.
5. **Path Traversal Protection**: Guard against `..` or escaping directory boundaries.
6. **Code Style**: Tabs for indentation, self-descriptive English code with zero unnecessary comments.

---

## Phase 1: `dirploy list` (Observability & Inspection)

### Goal
Allow developers to view all active deployed projects and subdirectories in their GitHub User Site repository without needing to manually clone or navigate GitHub.

### CLI Syntax
```bash
dirploy list [options]
dirploy ls [options]
```

### Options
- `--repo <owner/repo>`: Target repository (default: resolved from origin / config / owner).
- `--branch <branch>`: Target branch (default: `main`).
- `--json`: Output result as JSON for programmatic consumption.
- `--ssh` / `--no-ssh`: Force protocol.

### Expected Output
```text
Projects deployed on rgdlr/rgdlr.github.io (branch: main):

  Path         URL                                   Last Updated
  ─────────────────────────────────────────────────────────────────────────────
  /dirploy     https://rgdlr.github.io/dirploy/      2026-09-26 (feat: release)
  /showcase    https://rgdlr.github.io/showcase/     2026-09-20 (update demo)
  /client-app  https://rgdlr.github.io/client-app/    2026-08-15 (initial deploy)
```

### Implementation Checklist
- [ ] Add `list` command to `parseArgs` in `src/cli/command.ts`.
- [ ] Implement `listDeployedProjects(options)` in a new module `src/deployment/list.ts`.
- [ ] Shallow clone or fetch tree: Use `git ls-tree --name-only <branch>` or shallow fetch to discover top-level directories while filtering out dotfiles (`.git`, `.github`), root files (`CNAME`, `index.html`, `README.md`), and hidden directories.
- [ ] Retrieve last commit date/message per directory using `git log -1 --format="%cd (%s)" --date=short -- <path>`.
- [ ] Format tabular output in `src/cli/output.ts` with clean column alignment.
- [ ] Add `--json` flag to print structured JSON array `Array<{ path: string, url: string, lastUpdated?: string }>`.
- [ ] Add comprehensive unit and integration tests in `test/deployment/list.test.ts`.

---

## Phase 2: `dirploy remove <path>` (Lifecycle Teardown)

### Goal
Allow developers to decommission and safely delete a deployed subpath from their User Site without manual repository management.

### CLI Syntax
```bash
dirploy remove <path> [options]
dirploy rm <path> [options]
dirploy delete <path> [options]
```

### Safety Requirements
- **Root Protection**: Forbid removing root (`/`, ``, `.`).
- **Confirmation Guard**: Require `--yes` or `-y` flag in non-interactive / CI environments. In interactive TTY, prompt for confirmation unless `--force` / `-y` is provided.
- **Isolation Verification**: Only delete files inside `<path>`. Sibling folders must not be touched.

### Options
- `<path>`: The subdirectory to remove (required positional argument).
- `--repo <owner/repo>`: Target repository.
- `--branch <branch>`: Target branch.
- `-y, --yes, --force`: Skip interactive confirmation prompt.
- `--message <message>`: Git commit message (default: `Remove <path> deployment`).
- `--dry-run`: Display what files would be deleted without committing or pushing.

### Implementation Checklist
- [ ] Add `remove` / `rm` / `delete` command to CLI in `src/cli/command.ts`.
- [ ] Implement `removeDeployment(options)` in a new module `src/deployment/remove.ts`.
- [ ] Ensure `assertSafeDestinationInsideRepository(destinationPath)` is called before removing files.
- [ ] Check if the destination path actually exists in the cloned repository; if not, throw friendly error (`Path "<path>" is not currently deployed in repository`).
- [ ] Delete destination folder using `fs.rm(targetDir, { recursive: true, force: true })`.
- [ ] Stage changes (`git add -A`) and verify with `git status`.
- [ ] Commit with `Remove <path> deployment` and push using retry logic.
- [ ] Output success summary (`Successfully removed /<path> from username.github.io`).
- [ ] Add end-to-end integration tests in `test/deployment/remove.test.ts`.

---

## Phase 3: `dirploy init --ci` (Workflow Automation Generator)

### Goal
Provide a zero-friction setup command to generate a ready-to-use GitHub Actions workflow file in the source repository.

### CLI Syntax
```bash
dirploy init --ci
dirploy init --workflow
```

### Generated File
`.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy to GitHub User Site
        run: npx dirploy ./dist
        env:
          DIRPLOY_TOKEN: ${{ secrets.DIRPLOY_TOKEN }}
```

### Implementation Checklist
- [ ] Add `--ci` / `--workflow` flags to `dirploy init` in `src/cli/command.ts` and `src/cli/init.ts`.
- [ ] Implement `initWorkflow(options)` in `src/cli/init.ts`.
- [ ] Prompt (or auto-generate) `.github/workflows/deploy.yml` with source directory from config.
- [ ] Guard against overwriting an existing workflow file unless `--force` is specified.
- [ ] Output instructions reminding developer to add `DIRPLOY_TOKEN` to GitHub Repository Secrets.
- [ ] Add unit tests in `test/cli/init.test.ts`.

---

## Phase 4: Native GitHub Action (`action.yml`)

### Goal
Publish Dirploy as a native GitHub Action on GitHub Marketplace so teams can use `uses: rgdlr/dirploy@v1` without manual `npx` steps.

### Example Usage
```yaml
- uses: rgdlr/dirploy@v1
  with:
    source: ./dist
    path: my-app
    token: ${{ secrets.DIRPLOY_TOKEN }}
```

### Implementation Checklist
- [ ] Create `action.yml` in repository root declaring action inputs (`source`, `path`, `repo`, `branch`, `token`, `dry-run`).
- [ ] Configure `action.yml` as a composite action running `node dist/cli/command.js`.
- [ ] Ensure `dist/` is bundled or checked into tagged release branches (`v1`, `v1.0.0`).
- [ ] Test action invocation in `.github/workflows/deploy.yml`.

---

## Phase 5: Single-Page Application (SPA) Routing Helper (`--spa`)

### Goal
GitHub Pages returns a 404 when directly requesting deep client-side routes (e.g. `username.github.io/my-app/dashboard`) because only `index.html` exists. Provide built-in support to handle SPA routing gracefully.

### Solution Pattern
In subpath deployments, copying `index.html` as `404.html` inside the subpath works if GitHub Pages routes to subpath 404s, or generating a lightweight redirect script for the root `404.html`.

### CLI Option
- `--spa`: Automatically duplicates `index.html` as `404.html` in the destination directory to mitigate client-side routing 404s.

### Implementation Checklist
- [ ] Add `spa?: boolean` to `DeploymentOptions` and `dirploy.config.json` schema.
- [ ] In `SafeDirectorySynchronizer`, if `spa: true` and `index.html` exists in destination, copy `index.html` to `404.html` if no custom `404.html` was provided.
- [ ] Add tests in `test/deployment/features.test.ts`.
