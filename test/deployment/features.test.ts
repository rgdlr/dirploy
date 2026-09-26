import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deploy } from '../../src/deployment/deploy.js'
import type { GitClient, GitStatus } from '../../src/git/git-client.js'

describe('deployment advanced features', () => {
	let tempDir: string
	let sourceDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-features-test-'))
		sourceDir = path.join(tempDir, 'dist')
		await fs.mkdir(sourceDir, { recursive: true })
		await fs.writeFile(path.join(sourceDir, 'index.html'), '<h1>Feature Test</h1>')
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	})

	it('detects CNAME in target repository and updates site URL', async () => {
		const mockGit: GitClient = {
			async clone(_repo, dest) {
				await fs.writeFile(path.join(dest, 'CNAME'), 'custom.example.com\n')
			},
			async add() {},
			async commit() {},
			async push() {},
			async status(): Promise<GitStatus> {
				return { changed: true, addedFiles: 1, updatedFiles: 0, removedFiles: 0 }
			},
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'testuser/testuser.github.io',
			destinationPath: 'my-app',
			gitClient: mockGit,
		})

		expect(result.url).toBe('https://custom.example.com/my-app/')
	})

	it('uses explicit domain option over CNAME or default url', async () => {
		const mockGit: GitClient = {
			async clone(_repo, dest) {
				await fs.writeFile(path.join(dest, 'CNAME'), 'cname.example.com')
			},
			async add() {},
			async commit() {},
			async push() {},
			async status(): Promise<GitStatus> {
				return { changed: true, addedFiles: 1, updatedFiles: 0, removedFiles: 0 }
			},
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'testuser/testuser.github.io',
			destinationPath: 'my-app',
			domain: 'override.domain.org',
			gitClient: mockGit,
		})

		expect(result.url).toBe('https://override.domain.org/my-app/')
	})

	it('creates .nojekyll at repository root when nojekyll option is true', async () => {
		let clonedRoot = ''
		let hadNojekyll = false
		const mockGit: GitClient = {
			async clone(_repo, dest) {
				clonedRoot = dest
			},
			async add() {
				hadNojekyll = await fs
					.stat(path.join(clonedRoot, '.nojekyll'))
					.then(() => true)
					.catch(() => false)
			},
			async commit() {},
			async push() {},
			async status(): Promise<GitStatus> {
				return { changed: true, addedFiles: 2, updatedFiles: 0, removedFiles: 0 }
			},
		}

		await deploy({
			sourceDirectory: sourceDir,
			repository: 'testuser/testuser.github.io',
			destinationPath: 'my-app',
			nojekyll: true,
			gitClient: mockGit,
		})

		expect(hadNojekyll).toBe(true)
	})

	it('retries push when remote rejects push with PUSH_REJECTED', async () => {
		let pushAttempts = 0
		const progressSteps: string[] = []

		const mockGit: GitClient = {
			async clone() {},
			async add() {},
			async commit() {},
			async push() {
				pushAttempts++
				if (pushAttempts === 1) {
					const error: any = new Error('Remote rejected push')
					error.code = 'PUSH_REJECTED'
					throw error
				}
			},
			async status(): Promise<GitStatus> {
				return { changed: true, addedFiles: 1, updatedFiles: 0, removedFiles: 0 }
			},
		}

		const result = await deploy({
			sourceDirectory: sourceDir,
			repository: 'testuser/testuser.github.io',
			destinationPath: 'my-app',
			maxRetries: 2,
			gitClient: mockGit,
			onProgress: (step) => {
				progressSteps.push(step)
			},
		})

		expect(pushAttempts).toBe(2)
		expect(progressSteps).toContain('retrying')
		expect(result.changed).toBe(true)
	})
})
