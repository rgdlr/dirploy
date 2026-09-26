# Contributing to Dirploy

Thank you for your interest in contributing to **Dirploy**! We aim to keep the tool focused, safe, and dependency-free in production.

## Development Setup

Requirements:
- Node.js >= 20.0.0
- Git installed on your system

Clone and install development dependencies:

```bash
git clone https://github.com/rgdlr/dirploy.git
cd dirploy
npm install
```

## Available Scripts

- `npm test`: Runs the test suite using Vitest (includes local git integration tests; requires no GitHub token or network access).
- `npm run build`: Compiles TypeScript to `./dist`.
- `npm run typecheck`: Validates TypeScript types with `tsc --noEmit`.
- `npm run deploy:site`: Builds and deploys the landing page in `site/` to your GitHub Pages site under the `dirploy` path.

## Core Architectural Invariants

When submitting PRs or modifying the codebase, the following invariants **must never be violated**:

1. **Subdirectory Isolation**: A deployment may only modify its configured destination path. Sibling projects and root files must remain completely untouched.
2. **Zero Runtime Dependencies**: Keep `dependencies` in `package.json` empty. Standard Node.js APIs (`node:fs`, `node:path`, `node:util parseArgs`, `node:child_process`) are preferred over external libraries.
3. **No Force Push**: Deployments must never force-push (`--force`) or rewrite remote Git history.
4. **Credential Safety**: Authentication tokens or secrets must never appear in logs, configuration files, or error messages.
5. **Path Traversal Protection**: Any path containing `..` or attempting to resolve outside the cloned repository must be rejected before any filesystem modification.

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/my-feature`.
2. Ensure all tests pass: `npm run typecheck && npm test`.
3. Keep changes minimal and focused on a single responsibility.
4. Open a Pull Request with a clear description of the problem and your solution.
