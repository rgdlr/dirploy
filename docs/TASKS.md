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

---

## Phase 6: Contributor Experience & CI Hardening

### Goal
Prevent contributor confusion, catch environment-specific regressions early, and enforce quality standards before PRs are merged.

### Implementation Checklist
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist:
  - Verification of zero runtime dependencies.
  - Conventional Commits format adherence.
  - Test suites passing (`npm test`, `npm run typecheck`, `npm run lint`).
  - Changeset inclusion (`npm run changeset`) for user-facing changes.
- [ ] Implement Node.js Matrix in `.github/workflows/ci.yml`:
  - Run verification jobs across `[20, 22]` to ensure full compliance with `"engines": { "node": ">=20.0.0" }`.
- [ ] Document installing `@changesets/bot` GitHub App to automatically comment on pull requests missing a changeset.
- [ ] Add `npm audit --omit=dev` step in CI to guard against compromised devDependencies.

---

## Phase 7: Diagnostic Command (`dirploy doctor`)

### Goal
Provide a single command to diagnose authentication, network, and configuration issues, eliminating troubleshooting friction for both users and contributors.

### CLI Syntax
```bash
dirploy doctor [options]
```

### Checks Performed
1. **Git Runtime**: Verifies Git is installed (`git --version`) and accessible in PATH.
2. **Authentication Detection**:
   - Checks presence of `DIRPLOY_TOKEN` or `GITHUB_TOKEN`.
   - Checks presence of SSH keys (`~/.ssh/id_*`) and running SSH agent (`SSH_AUTH_SOCK`).
3. **Target Repository Reachability**:
   - Tests `git ls-remote` against the resolved target repository via the active protocol.
4. **Local Configuration**:
   - Validates `dirploy.config.json` against `schema.json` if present.
5. **Asset Warnings**:
   - Scans `./dist` or configured source directory for absolute asset references (`/assets/...`) that would break on subpaths.

### Implementation Checklist
- [ ] Register `doctor` command in `src/cli/command.ts`.
- [ ] Implement diagnostic checks in `src/cli/doctor.ts`.
- [ ] Format colored status output (✔ / ✖ / ⚠) in `src/cli/output.ts`.
- [ ] Add unit tests in `test/cli/doctor.test.ts`.

---

## Phase 8: Landing Page Mobile Responsiveness & UX Polish (`site/`)

### Goal
Ensure the documentation and marketing website (`site/`) renders flawlessly across all mobile viewport sizes (320px to 768px), specifically fixing the header navigation crowding and the pipeline flow layout.

### Identified Issues
1. **Header Navigation Crowding**: On viewports under 640px, the 3 anchor links (`#how-it-works`, `#features`, `#quickstart`) crowd against the brand logo and the GitHub button, causing layout wrapping or horizontal overflow.
2. **"How It Works" Pipeline Alignment**: In mobile view, cards and arrows wrap unevenly. The arrow indicator (`➔`) rotates 90deg but lacks centered vertical alignment and consistent margins, leaving cards mismatched.
3. **Hero & Command Snippet Scaling**: On small screens (< 400px), the `npx dirploy ./dist` box and copy button can feel cramped; typography scale needs responsive reduction.
4. **Code Tabs Horizontal Overflow**: The configuration tab buttons in Quick Start can overflow narrow screens if not set to horizontally scrollable.

### Implementation Checklist
- [ ] **Header (`.site-header`, `.nav-links`)**:
  - Add media query `< 640px` to hide anchor links (`nav-links a:not(.btn-nav) { display: none; }`) while preserving the compact GitHub action button, or introduce a lightweight CSS-only mobile drawer.
  - Ensure `.brand` and `.btn-nav` maintain clean spacing and do not wrap on screens down to 320px.
- [ ] **"How It Works" Section (`.pipeline-flow`, `.pipeline-card`, `.pipeline-arrow`)**:
  - Under `< 768px`, enforce `.pipeline-flow { flex-direction: column; align-items: stretch; gap: 0.75rem; }`.
  - Set `.pipeline-card { width: 100%; max-width: 100%; min-width: 0; }` so cards fill the container naturally without horizontal overflow.
  - Center vertical flow arrows (`text-align: center; margin: 0.5rem auto; transform: rotate(90deg);`).
- [ ] **Hero Section (`.hero-title`, `.command-box`)**:
  - Adjust `.hero-title` to `clamp(1.85rem, 6vw, 2.5rem)` on screens `< 480px`.
  - Ensure `.command-box` uses `max-width: 100%; word-break: break-all;` and adjust internal padding on narrow devices.
- [ ] **Quick Start Tabs (`.tab-nav`, `.tab-content pre`)**:
  - Set `.tab-nav { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }` to enable smooth finger-swiping between tabs without line wrapping.
  - Verify all code blocks (`pre`) have `overflow-x: auto` with clean scrollbars.
- [ ] **Build & Visual Verification**:
  - Verify build with `npm run site:build`.
  - Test responsive layout across 320px (iPhone SE), 375px, 414px, and 768px viewports.

---

## Phase 9: README Visual Polish, Status Badges & Documentation Enhancements

### Goal
Elevate the open-source presentation of `README.md` to professional industry standards with live Shields.io status badges, a feature comparison table, structured navigation, and GitHub alert callouts.

### Desired Elements
1. **Status Badges Bar** (placed right beneath the main title):
   - **npm Version**: `https://img.shields.io/npm/v/dirploy.svg?color=a78bfa&label=npm` (linking to npmjs.com/package/dirploy)
   - **npm Downloads**: `https://img.shields.io/npm/dm/dirploy.svg?color=6366f1`
   - **CI Status**: `https://github.com/rgdlr/dirploy/actions/workflows/ci.yml/badge.svg`
   - **Zero Dependencies**: `https://img.shields.io/badge/dependencies-0-success.svg?color=10b981`
   - **License**: `https://img.shields.io/badge/license-MIT-blue.svg`
   - **Node.js Compatibility**: `https://img.shields.io/node/v/dirploy.svg`
2. **Feature Comparison Table ("Why Dirploy?")**:
   - Compare `dirploy` against the traditional `gh-pages` npm package and GitHub Pages native branch deploy across key capabilities:
     - Multi-project isolation on a single domain.
     - Publishing from private repositories to public User Sites without paying for GitHub Pro.
     - Zero runtime dependencies (`0` vs `10+` external dependencies).
     - Subpath asset broken-link warnings.
3. **Table of Contents (TOC)**:
   - Provide clickable anchor links at the top of the README for easy navigation through all sections (Quick Start, Features, Configuration, CI/CD, FAQ).
4. **Enhanced GitHub Alert Callouts**:
   - Format crucial tips using `> [!TIP]` (for dogfooding and performance tips) and `> [!IMPORTANT]` (for `DIRPLOY_TOKEN` permission setup).

### Implementation Checklist
- [ ] Add Shields.io badge row at the top of `README.md` directly below the `# Dirploy` header.
- [ ] Add a clean Table of Contents with markdown anchor links.
- [ ] Add the "Why Dirploy? (Comparison)" section with a markdown table comparing alternatives.
- [ ] Modernize important notes into GitHub Alert syntax (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`).
- [ ] Verify that all badge links, image references, and documentation links resolve cleanly.

---

## Phase 10: AI Agent Ecosystem Integration (Agent Skill & MCP Server)

### Goal
Empower AI coding assistants (such as Google Antigravity, Claude Code, Cursor, Windsurf, and VS Code Copilot) to autonomously deploy static applications, diagnose path issues, and generate CI workflows on behalf of the developer.

### Proposed Integrations

#### 1. Dirploy Agent Skill (`skills/dirploy/SKILL.md`)
A lightweight, declarative skill definition teaching AI agents:
- How to detect project build systems (Vite, Astro, Next.js static export, SvelteKit, Hugo, pure HTML).
- How to verify and adjust the framework base path (e.g. `base: './'` or `base: '/my-project/'`) before building to avoid broken asset paths on subpaths.
- How to execute `npx dirploy` with dry-run verification first.
- How to configure `.github/workflows/deploy.yml` and explain the `DIRPLOY_TOKEN` secret to the user.

#### 2. Model Context Protocol (MCP) Server (`dirploy mcp` or `@dirploy/mcp-server`)
A standard Model Context Protocol (JSON-RPC over stdio) server exposing native tools to AI agents:
- `dirploy_deploy`: Deploy a directory to GitHub Pages with parameter schema (`source`, `destinationPath`, `repository`, `branch`, `dryRun`).
- `dirploy_validate_assets`: Scan an HTML/CSS build output directory to report any absolute links that will fail when served under a subpath.
- `dirploy_generate_config`: Interactively generate a `dirploy.config.json` based on the agent's inspection of the current workspace.

### Implementation Checklist
- [ ] Create `skills/dirploy/SKILL.md` with YAML frontmatter (`name: dirploy`, `description: "Deploy static projects to isolated GitHub Pages subpaths with zero friction"`).
- [ ] Document framework base path rules in `skills/dirploy/references/frameworks.md` (Vite, Astro, Next.js, SvelteKit).
- [ ] Implement `dirploy mcp` subcommand in CLI or as a companion package (`@dirploy/mcp-server`).
- [ ] Expose MCP tools: `deploy`, `validate_assets`, `inspect_config`.
- [ ] Document MCP installation in `README.md` for Claude Desktop, Antigravity (`mcp_config.json`), and Cursor.




