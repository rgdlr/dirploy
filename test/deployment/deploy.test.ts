import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../../src/deployment/deploy.js'
import type { GitClient } from '../../src/git/git-client.js'

const execFileAsync = promisify(execFile)

describe('deploy service', () => {
	let tmpDir: string
	let sourceDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-deploy-test-'))
		sourceDir = path.join(tmpDir, 'dist')
		await fs.mkdir(sourceDir, { recursive: true })
		await fs.writeFile(path.join(sourceDir, 'index.html'), '<h1>Hello World</h1>')
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it('performs dry run without committing or pushing', async () => {
		const mockGit: GitClient = {
			clone: vi.fn().mockResolvedValue(undefined),
			add: vi.fn().mockResolvedValue(undefined),
			commit: vi.fn().mockResolvedValue(undefined),
			push: vi.fn().mockResolvedValue(undefined),
			status: vi.fn().mockResolvedValue({
				changed: true,
				addedFiles: 2,
				updatedFiles: 1,
				removedFiles: 0,
			}),
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'alice/alice.github.io',
			destinationPath: 'my-project',
			dryRun: true,
			gitClient: mockGit,
		})

		expect(result.changed).toBe(true)
		expect(result.addedFiles).toBe(2)
		expect(result.url).toBe('https://alice.github.io/my-project/')
		expect(mockGit.commit).not.toHaveBeenCalled()
		expect(mockGit.push).not.toHaveBeenCalled()
	})

	it('exits cleanly without committing if no files changed', async () => {
		const mockGit: GitClient = {
			clone: vi.fn().mockResolvedValue(undefined),
			add: vi.fn().mockResolvedValue(undefined),
			commit: vi.fn().mockResolvedValue(undefined),
			push: vi.fn().mockResolvedValue(undefined),
			status: vi.fn().mockResolvedValue({
				changed: false,
				addedFiles: 0,
				updatedFiles: 0,
				removedFiles: 0,
			}),
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'alice/alice.github.io',
			destinationPath: 'my-project',
			dryRun: false,
			gitClient: mockGit,
		})

		expect(result.changed).toBe(false)
		expect(mockGit.commit).not.toHaveBeenCalled()
		expect(mockGit.push).not.toHaveBeenCalled()
	})

	it('commits and pushes when changes exist', async () => {
		const mockGit: GitClient = {
			clone: vi.fn().mockResolvedValue(undefined),
			add: vi.fn().mockResolvedValue(undefined),
			commit: vi.fn().mockResolvedValue(undefined),
			push: vi.fn().mockResolvedValue(undefined),
			status: vi.fn().mockResolvedValue({
				changed: true,
				addedFiles: 1,
				updatedFiles: 0,
				removedFiles: 0,
			}),
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'alice/alice.github.io',
			destinationPath: 'my-project',
			commitMessage: 'Deploy test',
			dryRun: false,
			gitClient: mockGit,
		})

		expect(result.changed).toBe(true)
		expect(mockGit.add).toHaveBeenCalledWith(['.'])
		expect(mockGit.commit).toHaveBeenCalledWith('Deploy test')
		expect(mockGit.push).toHaveBeenCalledWith('origin', 'main')
	})
})

describe('git end-to-end integration test with local repositories', () => {
	let tmpDir: string
	let remoteRepoDir: string
	let sourceDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-e2e-test-'))
		remoteRepoDir = path.join(tmpDir, 'remote.git')
		sourceDir = path.join(tmpDir, 'dist')

		await fs.mkdir(remoteRepoDir, { recursive: true })
		await execFileAsync('git', ['init', '--bare', remoteRepoDir])

		const initCloneDir = path.join(tmpDir, 'init-clone')
		await execFileAsync('git', ['clone', remoteRepoDir, initCloneDir])
		await execFileAsync('git', ['checkout', '-b', 'main'], { cwd: initCloneDir })
		await execFileAsync('git', ['config', 'user.name', 'Tester'], { cwd: initCloneDir })
		await execFileAsync('git', ['config', 'user.email', 'tester@test.com'], { cwd: initCloneDir })

		await fs.mkdir(path.join(initCloneDir, 'project-a'), { recursive: true })
		await fs.writeFile(path.join(initCloneDir, 'project-a', 'index.html'), 'Project A original')

		await fs.mkdir(path.join(initCloneDir, 'project-b'), { recursive: true })
		await fs.writeFile(path.join(initCloneDir, 'project-b', 'old-script.js'), 'console.log("old")')
		await fs.writeFile(path.join(initCloneDir, 'project-b', 'index.html'), 'Project B original')

		await execFileAsync('git', ['add', '.'], { cwd: initCloneDir })
		await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: initCloneDir })
		await execFileAsync('git', ['push', 'origin', 'main'], { cwd: initCloneDir })

		await fs.mkdir(sourceDir, { recursive: true })
		await fs.writeFile(path.join(sourceDir, 'index.html'), 'Project B updated')
		await fs.writeFile(path.join(sourceDir, 'new-file.css'), 'body { background: black; }')
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it('deploys to project-b, updating it and deleting stale files while leaving project-a untouched', async () => {
		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: remoteRepoDir,
			destinationPath: 'project-b',
			branch: 'main',
		})

		expect(result.changed).toBe(true)

		const verifyDir = path.join(tmpDir, 'verify-clone')
		await execFileAsync('git', ['clone', '--branch', 'main', remoteRepoDir, verifyDir])

		const projectAContent = await fs.readFile(
			path.join(verifyDir, 'project-a', 'index.html'),
			'utf-8',
		)
		expect(projectAContent).toBe('Project A original')

		const projectBIndex = await fs.readFile(
			path.join(verifyDir, 'project-b', 'index.html'),
			'utf-8',
		)
		expect(projectBIndex).toBe('Project B updated')
		const projectBCss = await fs.readFile(
			path.join(verifyDir, 'project-b', 'new-file.css'),
			'utf-8',
		)
		expect(projectBCss).toBe('body { background: black; }')

		await expect(fs.stat(path.join(verifyDir, 'project-b', 'old-script.js'))).rejects.toThrow()
	})

	it('second deployment with same files produces no changes and no commit', async () => {
		await deploy({
			sourceDirectory: sourceDir,
			repository: remoteRepoDir,
			destinationPath: 'project-b',
			branch: 'main',
		})

		const secondResult = await deploy({
			sourceDirectory: sourceDir,
			repository: remoteRepoDir,
			destinationPath: 'project-b',
			branch: 'main',
		})

		expect(secondResult.changed).toBe(false)
	})
})
