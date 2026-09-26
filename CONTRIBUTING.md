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

Git hooks are automatically configured via Husky:
- **`pre-commit`**: Automatically lints and formats staged files using Biome.
- **`commit-msg`**: Automatically verifies commit messages adhere to [Conventional Commits](https://www.conventionalcommits.org/).
- **`pre-push`**: Automatically runs TypeScript type checks and the Vitest suite before pushing.

## Available Scripts

- `npm test`: Runs the test suite using Vitest (includes local git integration tests).
- `npm run build`: Compiles TypeScript to `./dist`.
- `npm run typecheck`: Validates TypeScript types with `tsc --noEmit`.
- `npm run lint`: Checks formatting and linting with Biome.
- `npm run format`: Automatically formats codebase using Biome.
- `npm run check:package`: Validates package exports and types using Publint and ATTW.
- `npm run site:build`: Builds the landing page in `site/`.
- `npm run site:deploy`: Builds and deploys the landing page to GitHub Pages using dirploy.
- `npm run changeset`: Generates a changeset file to document version bumps and changelog notes.

## Core Architectural Invariants

When submitting PRs or modifying the codebase, the following invariants **must never be violated**:

1. **Subdirectory Isolation**: A deployment may only modify its configured destination path. Sibling projects and root files must remain completely untouched.
2. **Zero Runtime Dependencies**: Keep `dependencies` in `package.json` empty. Standard Node.js APIs (`node:fs`, `node:path`, `node:util parseArgs`, `node:child_process`) are preferred over external libraries.
3. **No Force Push**: Deployments must never force-push (`--force`) or rewrite remote Git history.
4. **Credential Safety**: Authentication tokens or secrets must never appear in logs, configuration files, or error messages.
5. **Path Traversal Protection**: Any path containing `..` or attempting to resolve outside the cloned repository must be rejected before any filesystem modification.

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feat/my-feature`.
2. Make your changes and commit them using [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `docs:`, `chore:`). Husky will automatically format staged files and validate the commit message.
3. If your PR introduces user-facing changes (new features, bug fixes, breaking changes), generate a changeset:
   ```bash
   npm run changeset
   ```
   Follow the prompts to select the appropriate bump (`patch`, `minor`, `major`) and enter a summary for the changelog. Internal refactors and documentation PRs do not require a changeset.
4. Push your branch (`git push -u origin feat/my-feature`). Husky will automatically run typecheck and test suites before pushing.
5. Open a Pull Request with a clear description of your change.
