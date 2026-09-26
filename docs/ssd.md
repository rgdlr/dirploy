# Dirploy

## 1. Product Definition

Dirploy is a small CLI and TypeScript library for publishing static build artifacts from any GitHub repository into an isolated directory of the owner's GitHub User Site repository.

Given:

```text
private-project/
├── src/
├── dist/
└── package.json
```

the tool publishes:

```text
username.github.io/
└── private-project/
    ├── index.html
    └── assets/
```

resulting in:

```text
https://username.github.io/private-project/
```

The source project may remain private. Only the generated static output is published.

The tool is intentionally narrow in scope:

> Build elsewhere. Publish static files here. Never interfere with another published project.

---

# 2. Goals

## Primary goals

1. Publish a local static directory to `username/username.github.io`.
2. Automatically determine the GitHub owner when possible.
3. Automatically determine a sensible deployment path from the source repository name.
4. Allow explicit configuration when automatic detection is insufficient.
5. Isolate each deployed project inside its own destination directory.
6. Update only the destination directory belonging to the current project.
7. Preserve every other file and directory in the target repository.
8. Work both locally and in CI environments.
9. Provide deterministic and understandable failures.
10. Keep the implementation small enough to maintain easily.

## Secondary goals

1. Provide a reusable TypeScript API behind the CLI.
2. Support dry runs.
3. Provide clear deployment output.
4. Make concurrent development and future features possible without coupling the core to CLI concerns.

---

# 3. Non-Goals

The MVP must not attempt to become a general deployment platform.

Explicitly out of scope:

* GitHub App creation
* Hosted authentication services
* Web dashboards
* Deployment history UI
* Rollbacks
* CDN management
* Asset versioning
* Release management
* GitHub API-based file uploads
* GitHub Actions workflow generation
* Multiple Git hosting providers
* GitLab
* Bitbucket
* S3
* Cloudflare
* Netlify
* Vercel
* Automatic build execution
* Monorepo orchestration
* Package manager integrations
* Plugin systems
* Deployment databases
* Remote state management

The tool publishes files. It does not build applications.

---

# 4. Core User Experience

The ideal first-run experience is:

```bash
npx dirploy
```

The tool should infer:

```text
Source directory: ./dist
GitHub owner: username
Target repository: username/username.github.io
Target branch: main
Target path: private-project
```

and publish:

```text
./dist
    ↓
username.github.io/private-project
```

A normal deployment should require no configuration if conventional project structure and GitHub authentication are available.

For non-standard projects:

```bash
npx dirploy ./build --path demos/my-demo
```

---

# 5. CLI

## Command

```text
dirploy [source] [options]
```

## Arguments

### source

Static directory to publish.

Default:

```text
./dist
```

## Options

```text
--path <path>
--repo <owner/repository>
--branch <branch>
--message <message>
--dry-run
--force
--help
--version
```

### `--path`

Destination directory inside the User Site repository.

Example:

```bash
dirploy ./dist --path demos/my-demo
```

### `--repo`

Explicit destination repository.

Example:

```bash
dirploy ./dist --repo username/username.github.io
```

Default:

```text
<detected-owner>/<detected-owner>.github.io
```

### `--branch`

Destination branch.

Default:

```text
main
```

### `--message`

Git commit message.

Default:

```text
Deploy <path>
```

### `--dry-run`

Calculate and display the deployment without modifying the destination repository.

### `--force`

Allow potentially destructive operations explicitly.

The MVP should require this flag for operations that could remove files outside the calculated deployment scope.

---

# 6. Configuration

Configuration should be optional.

Support a project-level configuration file:

```text
dirploy.config.json
```

Example:

```json
{
  "source": "dist",
  "path": "my-project"
}
```

Supported configuration:

```typescript
interface PublisherConfig {
  source: string
  path?: string
  repository?: string
  branch?: string
  message?: string
}
```

CLI arguments override configuration file values.

Configuration precedence:

```text
CLI arguments
    ↓
configuration file
    ↓
defaults
```

Environment variables should be limited to authentication and CI-specific concerns.

Do not create a large configuration system.

---

# 7. Deployment Model

The target repository is a normal Git repository:

```text
username.github.io/
├── index.html
├── project-a/
├── project-b/
└── project-c/
```

Each project owns exactly one destination subtree:

```text
project-a/
```

A deployment is allowed to modify:

```text
project-a/**
```

It must not modify:

```text
project-b/**
project-c/**
```

or unrelated root files.

This isolation rule is the most important correctness requirement of the product.

---

# 8. Deployment Algorithm

The deployment algorithm should be intentionally simple.

## Step 1 — Validate source

Verify:

* source exists
* source is a directory
* source contains at least one file
* source path is not the target repository
* target path is valid and relative

Reject:

```text
../
absolute paths
empty target paths
paths containing "." as the complete destination
```

unless explicitly supported by a future version.

The MVP should strongly prefer a non-root deployment path.

---

## Step 2 — Resolve GitHub target

Determine:

```text
owner
repository
branch
destination path
```

Owner detection should use the authenticated GitHub CLI when available.

The tool should support:

```bash
gh auth status
```

as the preferred local authentication mechanism.

In CI, authentication should be possible through Git credentials or an explicitly configured GitHub token.

Do not implement an OAuth flow.

---

# 9. Authentication

Authentication is intentionally delegated to existing Git tooling.

## Local development

Preferred:

```text
GitHub CLI
```

The user authenticates once:

```bash
gh auth login
```

The publisher then uses authenticated Git operations.

## CI

Support the standard GitHub Actions environment:

```text
GITHUB_TOKEN
```

The tool must never print credentials.

Tokens must never be written to configuration files.

Tokens must never appear in error messages.

The implementation should prefer HTTPS authentication in CI and the existing Git credential mechanism where available.

---

# 10. Git Strategy

The MVP should use Git itself rather than GitHub's REST API.

This gives us:

* straightforward authentication
* local Git semantics
* atomic commits
* predictable diffs
* compatibility with GitHub and GitHub Actions
* no dependency on GitHub API upload limits
* simpler implementation

The publisher should use an isolated temporary working directory.

Conceptually:

```text
temporary directory
        ↓
git clone target repository
        ↓
checkout target branch
        ↓
synchronize destination directory
        ↓
git diff
        ↓
commit
        ↓
push
        ↓
cleanup
```

The user's source repository must never be modified.

---

# 11. Safe Synchronization

This is the critical part of the implementation.

Given:

```text
target/
├── project-a/
├── project-b/
└── project-c/
```

and source:

```text
dist/
├── index.html
└── assets/
```

with:

```text
path = project-b
```

the resulting repository must be:

```text
target/
├── project-a/
├── project-b/
│   ├── index.html
│   └── assets/
└── project-c/
```

The synchronization operation must:

1. Remove files previously deployed inside `project-b`.
2. Copy the current source files into `project-b`.
3. Preserve everything outside `project-b`.

The implementation must never perform:

```text
rm -rf target/*
```

or equivalent repository-wide replacement.

The synchronization abstraction should be isolated behind a dedicated module.

Suggested interface:

```typescript
interface DirectorySynchronizer {
  synchronize(sourceDirectory: string, destinationDirectory: string): Promise<void>
}
```

The synchronizer owns only the destination directory.

---

# 12. Path Safety

The target path must be normalized before any filesystem operation.

For example:

```text
project-a
project-a/
demos/example
```

are valid.

These must be rejected:

```text
../project-a
../../
/tmp/project
.
```

The resolved destination must remain inside the cloned repository.

The following invariant must always hold:

```text
resolve(repositoryRoot, targetPath)
```

must start with:

```text
resolve(repositoryRoot)
```

after normalization.

Path traversal protection is mandatory.

---

# 13. Root Deployment

The MVP should not encourage deployment to the repository root.

The default behavior should derive a project path from the source repository.

Example:

```text
source repository:
github.com/username/my-private-project

target:
username.github.io/my-private-project
```

A future release may explicitly support:

```bash
--path .
```

but this should not be part of the default flow.

The reason is simple: the product's core value is safe multi-project publishing.

---

# 14. Project Path Resolution

Default path resolution:

1. Explicit `--path`
2. Configuration `path`
3. Source Git repository name

Example:

```text
github.com/username/my-project
```

becomes:

```text
my-project
```

If the source directory is not inside a Git repository and no explicit path is provided, fail with an actionable error.

Do not attempt to guess from the filesystem directory name unless explicitly configured as a future enhancement.

---

# 15. Repository Resolution

Default repository:

```text
<github-owner>/<github-owner>.github.io
```

Explicit repository:

```bash
--repo username/username.github.io
```

The repository must be validated before deployment.

The tool should verify:

1. repository exists
2. branch exists
3. repository can be cloned
4. authenticated user has push permission

Avoid separate GitHub API calls unless required.

A failed `git clone` or `git push` should produce a meaningful error.

---

# 16. Empty and Missing Target Repository

The first MVP should support an existing target repository.

If:

```text
username.github.io
```

does not exist, fail with a clear instruction to create it.

Do not automatically create repositories in v1.

This avoids:

* GitHub API authentication complexity
* repository creation permissions
* accidental repository creation
* organization-specific edge cases

Future versions may add initialization.

---

# 17. Commit Behavior

If the synchronized content produces no changes:

```text
No changes to deploy.
```

The tool should exit successfully without creating a commit.

Otherwise:

```text
Deploy my-project
```

should be used as the default commit message.

Example:

```text
Deploy my-project
```

The commit should contain only changes produced by the synchronization operation.

---

# 18. Push Behavior

Push only the configured branch.

Example:

```text
git push origin main
```

Do not force push.

Do not rewrite history.

Do not reset the remote branch.

Do not amend existing commits.

The publisher is a normal Git client, not a history management tool.

---

# 19. Concurrency

The MVP does not need a distributed locking system.

However, the deployment flow should detect push rejection caused by the remote branch changing during deployment.

Example:

```text
Developer A clones
Developer B clones
Developer A pushes
Developer B pushes
```

Developer B's push may fail.

The correct behavior is:

```text
Deployment failed because the remote branch changed.
Please retry the deployment.
```

Do not automatically force push.

Do not automatically overwrite the remote repository.

A future release can implement safe retry/rebase logic if real usage demonstrates the need.

---

# 20. Dry Run

Example:

```bash
npx dirploy ./dist --dry-run
```

Expected output:

```text
Source:      ./dist
Repository:  username/username.github.io
Branch:      main
Destination: my-project

Files to add:    12
Files to update: 4
Files to remove: 2

No changes were made.
```

Dry run should perform all validation and synchronization calculations without pushing.

---

# 21. CLI Output

Normal deployment:

```text
Dirploy

Source:      ./dist
Repository:  username/username.github.io
Branch:      main
Destination: my-project

Synchronizing files...
Creating commit...
Pushing changes...

Published successfully.

URL:
https://username.github.io/my-project/
```

Errors should be concise and actionable.

Bad:

```text
Error: ENOENT
```

Good:

```text
Source directory "./dist" does not exist.

Build the project first or specify another source directory.
```

---

# 22. Exit Codes

Use standard process semantics.

```text
0  Success
1  Deployment or validation failure
2  Invalid CLI usage
```

No custom exit-code hierarchy is required in v1.

---

# 23. Architecture

Use a small layered architecture.

```text
src/
├── cli/
│   ├── command.ts
│   └── output.ts
├── config/
│   ├── config-loader.ts
│   └── config-types.ts
├── github/
│   ├── owner-resolver.ts
│   └── repository-resolver.ts
├── git/
│   ├── git-client.ts
│   └── repository.ts
├── deployment/
│   ├── deploy.ts
│   ├── deployment-plan.ts
│   └── directory-synchronizer.ts
├── filesystem/
│   └── paths.ts
└── index.ts
```

Do not create additional abstraction layers without a concrete need.

---

# 24. Core Domain Model

The central domain object should be simple.

```typescript
export interface DeploymentOptions {
  sourceDirectory: string
  repository: string
  branch: string
  destinationPath: string
  commitMessage: string
  dryRun: boolean
}
```

The deployment result:

```typescript
export interface DeploymentResult {
  changed: boolean
  addedFiles: number
  updatedFiles: number
  removedFiles: number
  repository: string
  branch: string
  destinationPath: string
  url: string
}
```

---

# 25. Git Client

Keep Git execution behind one small abstraction.

```typescript
export interface GitClient {
  clone(repository: string, destination: string, branch: string): Promise<void>
  add(paths: string[]): Promise<void>
  commit(message: string): Promise<void>
  push(remote: string, branch: string): Promise<void>
  status(): Promise<GitStatus>
}
```

The implementation may use `child_process` to execute the installed `git` binary.

Do not implement Git protocol functionality.

Git is an external dependency.

---

# 26. Git Status

Represent only what the application needs.

```typescript
export interface GitStatus {
  changed: boolean
  addedFiles: number
  updatedFiles: number
  removedFiles: number
}
```

Do not build a complete Git status parser.

---

# 27. Deployment Service

The core service should have a single responsibility:

```typescript
export interface DeploymentService {
  deploy(options: DeploymentOptions): Promise<DeploymentResult>
}
```

Implementation flow:

```text
validate
    ↓
create temporary repository
    ↓
clone
    ↓
resolve destination
    ↓
synchronize
    ↓
calculate changes
    ↓
commit if changed
    ↓
push if changed
    ↓
cleanup
```

---

# 28. Temporary Repository Handling

Use a temporary directory created by the runtime.

The temporary repository must be removed after execution regardless of success or failure.

Use structured cleanup:

```typescript
try {
  await deploy()
} finally {
  await cleanup()
}
```

Never leave authenticated repository URLs or credentials in persistent temporary files.

---

# 29. Dependency Strategy

Keep dependencies minimal.

Recommended runtime dependencies:

```text
commander
```

Potentially:

```text
picocolors
```

for terminal output.

Avoid adding libraries for functionality easily implemented with Node's standard library.

Git operations should use the installed Git executable.

Filesystem operations should use Node's standard library.

Configuration parsing should use JSON and the Node filesystem APIs.

---

# 30. Runtime

Target modern Node.js.

Recommended minimum:

```text
Node.js 20
```

Support:

```text
Node.js 20+
```

Do not support old Node versions in v1.

Use TypeScript.

Build to a standard ESM package unless a concrete compatibility requirement dictates otherwise.

---

# 31. Package API

The public package should expose both:

```text
CLI
```

and:

```text
programmatic deployment API
```

Example:

```typescript
import { deploy } from "dirploy"

await deploy({
  sourceDirectory: "./dist",
  repository: "username/username.github.io",
  branch: "main",
  destinationPath: "my-project",
  commitMessage: "Deploy my-project",
  dryRun: false
})
```

The CLI should be a thin adapter over this API.

---

# 32. CLI Architecture

The CLI should only:

1. Parse arguments.
2. Load configuration.
3. Resolve defaults.
4. Invoke the deployment service.
5. Format the result.
6. Translate failures into process exit codes.

It must not contain deployment logic.

This allows the deployment engine to be tested independently.

---

# 33. Error Model

Define application-level errors.

```typescript
export class PublisherError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
  }
}
```

Examples:

```text
SOURCE_NOT_FOUND
INVALID_SOURCE
INVALID_DESTINATION
REPOSITORY_UNAVAILABLE
BRANCH_UNAVAILABLE
AUTHENTICATION_FAILED
PUSH_REJECTED
DEPLOYMENT_FAILED
```

The exact hierarchy should remain small.

Avoid creating a class for every possible error.

---

# 34. Security Requirements

The tool handles credentials indirectly and must be conservative.

Requirements:

* Never print tokens.
* Never store tokens in configuration.
* Never include credentials in logs.
* Never force push.
* Never delete outside the deployment path.
* Reject path traversal.
* Never execute files from the source directory.
* Never evaluate project configuration as JavaScript.
* Treat all source filenames as untrusted filesystem paths.

The source build is data, not executable input.

---

# 35. Important Security Boundary

The publisher makes public whatever is present in the source directory.

Therefore the CLI should print a warning on first deployment:

```text
The contents of "./dist" will be published publicly at:

https://username.github.io/my-project/

Make sure the directory does not contain secrets or private files.
```

Do not attempt to implement a secret scanner in v1.

That would create false confidence.

---

# 36. Testing Strategy

Prioritize tests around the critical 20%.

## Unit tests

### Path safety

Test:

```text
project
project/
nested/project
../project
../../project
/tmp/project
.
```

### Configuration precedence

Test:

```text
CLI > config > defaults
```

### Repository detection

Test:

```text
username/project
username.github.io
nested Git remotes
SSH remote
HTTPS remote
```

### Directory synchronization

This is the most important test suite.

Given:

```text
target/
├── app-a/
├── app-b/
└── app-c/
```

deploy into:

```text
app-b/
```

verify:

```text
app-a unchanged
app-c unchanged
app-b exactly matches source
```

Test file additions, updates and deletions.

---

# 37. Integration Tests

Integration tests should use temporary Git repositories.

Scenario:

```text
create source repo
create target repo
populate target with two projects
run publisher
inspect target Git tree
verify commit
verify unrelated project unchanged
```

Do not require a real GitHub account for the main test suite.

Git behavior can be tested entirely with local repositories.

A small optional end-to-end suite may use a real GitHub repository in CI later.

---

# 38. Acceptance Criteria

The MVP is complete when all of the following work:

### Case 1 — Basic deployment

```bash
npx dirploy
```

publishes:

```text
./dist
```

to:

```text
username.github.io/<project-name>
```

### Case 2 — Explicit path

```bash
npx dirploy ./dist --path demos/example
```

publishes to:

```text
username.github.io/demos/example
```

### Case 3 — Existing projects remain untouched

Deploying project B must not modify project A.

### Case 4 — Deleted files are removed

If:

```text
previous deployment:
project/index.html
project/old.js
```

becomes:

```text
new deployment:
project/index.html
```

then:

```text
old.js
```

must be removed.

### Case 5 — No changes

A second deployment with identical files must produce:

```text
No changes to deploy.
```

and no new commit.

### Case 6 — Dry run

No repository changes occur.

### Case 7 — Authentication failure

The user receives an actionable message.

### Case 8 — Push conflict

The tool refuses to overwrite remote changes.

### Case 9 — Path traversal

Invalid paths are rejected before filesystem mutation.

---

# 39. README

The README should communicate the product in less than one minute.

Opening:

```markdown
# Dirploy

Publish static builds from private repositories to isolated paths in your
GitHub User Site.

Your source repository can stay private:

private-project
    ↓
username.github.io/private-project
    ↓
https://username.github.io/private-project/
```

Basic usage:

```bash
npm install --save-dev dirploy
```

```bash
npx dirploy ./dist
```

Explicit path:

```bash
npx dirploy ./dist --path demos/example
```

Configuration:

```json
{
  "source": "dist",
  "path": "my-project"
}
```

Authentication:

```bash
gh auth login
```

The README should then contain:

* how it works
* configuration
* CI usage
* safety model
* limitations
* troubleshooting

Do not write a huge README.

---

# 40. CI Support

The package must work in GitHub Actions without a special integration.

Example:

```yaml
name: Deploy

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build
      - run: npx dirploy ./dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The initial implementation should not generate this workflow automatically.

---

# 41. GitHub Actions Target Repository Permissions

CI must have permission to push to the target repository.

If source and target repositories belong to the same user but the workflow token cannot access the target repository under the applicable GitHub configuration, the deployment must fail clearly.

The tool should not attempt to solve repository permission configuration automatically.

Document this explicitly.

---

# 42. URL Generation

For the standard User Site repository:

```text
username/username.github.io
```

the default URL is:

```text
https://username.github.io/<destination-path>/
```

URL generation belongs to a small pure function.

```typescript
export function buildSiteUrl(
  owner: string,
  destinationPath: string
): string {
  const normalizedPath = destinationPath.replace(/^\/+|\/+$/g, "")
  return `https://${owner}.github.io/${normalizedPath}/`
}
```

If custom domains are supported in the future, URL resolution must become configurable.

Do not add custom-domain support to v1.

---

# 43. Repository Owner Detection

Owner detection should follow this order:

1. Explicit repository owner from `--repo`.
2. GitHub CLI authenticated account.
3. Git remote owner.
4. Fail with an actionable error.

The implementation should not depend entirely on the current repository's Git remote because a repository can be mirrored, forked or configured with a non-GitHub remote.

---

# 44. Repository Name Detection

Default project path should be derived from the source repository.

Given:

```text
git@github.com:username/my-project.git
```

derive:

```text
my-project
```

Given:

```text
https://github.com/username/my-project.git
```

derive:

```text
my-project
```

The parser should support only GitHub SSH and HTTPS remotes in v1.

Do not implement arbitrary Git URL parsing.

---

# 45. Design Principles

The project should follow these principles:

## Small public API

Prefer:

```text
deploy()
```

over a large framework.

## Explicit behavior

Prefer:

```text
--path demos/foo
```

over magic configuration.

## Safe defaults

Never overwrite unrelated content.

## Standard tooling

Use:

```text
Git
GitHub CLI
Node.js
```

instead of rebuilding their functionality.

## Library first

The CLI should depend on the core library, not the reverse.

## No speculative abstractions

Do not introduce interfaces unless they protect a real boundary or materially improve testing.

---

# 46. Recommended Initial Project Structure

```text
dirploy/
├── src/
│   ├── cli/
│   │   ├── command.ts
│   │   └── output.ts
│   ├── config/
│   │   ├── config-loader.ts
│   │   └── config-types.ts
│   ├── deployment/
│   │   ├── deploy.ts
│   │   ├── deployment-plan.ts
│   │   └── directory-synchronizer.ts
│   ├── filesystem/
│   │   └── paths.ts
│   ├── git/
│   │   ├── git-client.ts
│   │   └── repository.ts
│   ├── github/
│   │   ├── owner-resolver.ts
│   │   └── repository-resolver.ts
│   ├── errors.ts
│   └── index.ts
├── test/
│   ├── config/
│   ├── deployment/
│   ├── filesystem/
│   ├── git/
│   └── github/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
└── .gitignore
```

Do not create directories for future functionality.

---

# 47. Initial Package API

```typescript
export interface DeploymentOptions {
  sourceDirectory: string
  repository: string
  branch: string
  destinationPath: string
  commitMessage: string
  dryRun?: boolean
}

export interface DeploymentResult {
  changed: boolean
  addedFiles: number
  updatedFiles: number
  removedFiles: number
  repository: string
  branch: string
  destinationPath: string
  url: string
}

export async function deploy(
  options: DeploymentOptions
): Promise<DeploymentResult>
```

This is the only public API required for v1.

---

# 48. Implementation Order

The agent should implement in this order.

## Phase 1 — Foundation

1. TypeScript project.
2. Package metadata.
3. CLI entry point.
4. Configuration loading.
5. Error model.
6. Path validation.

## Phase 2 — Git

1. Git command runner.
2. Temporary repository creation.
3. Clone.
4. Branch checkout.
5. Status.
6. Commit.
7. Push.

## Phase 3 — Synchronization

1. Directory synchronization.
2. Safe deletion.
3. File statistics.
4. Isolation tests.

## Phase 4 — Resolution

1. GitHub owner resolution.
2. Source repository detection.
3. Target repository resolution.
4. Project path resolution.
5. Site URL generation.

## Phase 5 — CLI

1. Argument parsing.
2. Configuration precedence.
3. Output.
4. Dry run.
5. Exit codes.

## Phase 6 — Hardening

1. Error messages.
2. Path traversal tests.
3. Git conflict behavior.
4. Authentication failures.
5. Documentation.
6. CI validation.

Do not implement future features before all six phases are complete.

---

# 49. Definition of Done

The agent must not consider the project complete because the CLI runs once.

The project is complete when:

* `npm test` passes.
* TypeScript compilation passes.
* linting passes.
* the CLI can publish a real static directory.
* repeated deployment is idempotent.
* stale files are removed only inside the deployment path.
* unrelated directories remain unchanged.
* dry run does not mutate the target repository.
* push conflicts do not trigger force pushes.
* authentication failures are understandable.
* path traversal is rejected.
* README contains a complete happy-path example.
* CI usage is documented.
* package can be installed and invoked through `npx`.

---

# 50. Future Roadmap

Only after real usage identifies a need.

Possible future features:

```text
v1.1
- better conflict recovery
- optional deployment metadata

v1.2
- target repository initialization

v1.3
- custom domain awareness

v2
- GitHub API integration
- deployment management
```

These are deliberately not part of the MVP.

---

# 51. Technical Trade-offs

## Git instead of GitHub API

Chosen because it is simpler, battle-tested and naturally supports the required repository operations.

## Temporary clone instead of direct filesystem manipulation

Chosen because it provides a clean isolation boundary and makes Git state explicit.

## User Site as shared target

Chosen because one User Site can host multiple static paths under the same `github.io` domain.

## Subdirectory isolation

Chosen because it provides the simplest multi-project model while preserving unrelated deployments.

## No automatic repository creation

Chosen to reduce permissions, API and security complexity.

## No automatic build

Chosen because build systems are already well served by npm scripts, Vite, Next.js, Astro, Rollup and GitHub Actions.

## No force push

Chosen because the target repository may contain multiple independent deployments and potentially manual changes.

---

# 52. Critical Invariants

These invariants must never be violated.

### Invariant 1

A deployment may only modify its configured destination path.

### Invariant 2

A deployment must never force push.

### Invariant 3

A deployment must never expose source files automatically.

Only the specified source directory is published.

### Invariant 4

A failed deployment must not leave the user's source repository modified.

### Invariant 5

A deployment with identical source content must produce no commit.

### Invariant 6

Authentication credentials must never appear in logs.

### Invariant 7

The resolved destination must always remain inside the cloned target repository.

These invariants are more important than adding features.

---

# 53. Agent Instructions

The implementing AI agent should follow these rules:

1. Read this document before changing architecture.
2. Implement the smallest solution satisfying the acceptance criteria.
3. Do not add dependencies without a concrete reason.
4. Do not add abstractions without a concrete boundary.
5. Do not add future functionality to the MVP.
6. Do not modify unrelated files during deployment.
7. Never use force push.
8. Never silently ignore deployment errors.
9. Never print secrets.
10. Write all source code, tests, CLI output and documentation in English.
11. Do not use code comments as a substitute for good naming.
12. Prefer descriptive names and small functions.
13. Keep functions focused on one responsibility.
14. Make filesystem mutation easy to identify in the code.
15. Add tests before changing behavior that affects deployment safety.
16. Treat deployment isolation as the highest-priority correctness requirement.
17. Prefer standard Node.js APIs over dependencies.
18. Do not optimize prematurely.
19. Do not implement functionality that is not required by the acceptance criteria.
20. When uncertain, choose the simpler behavior and document it.

---

# 54. Success Metric

The product should be judged by one question:

> Can a developer with a private GitHub repository publish `dist/` to `https://username.github.io/project/` with one command, while being confident that every other project hosted there remains untouched?

If yes, the MVP has succeeded.

Everything else is secondary.
