import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DirployError } from '../../src/errors.js'
import {
	assertSafeDestinationInsideRepository,
	detectSubpathAssetWarnings,
	normalizeDestinationPath,
	validateSourceDirectory,
} from '../../src/filesystem/paths.js'

describe('paths safety and validation', () => {
	describe('normalizeDestinationPath', () => {
		it('normalizes valid destination paths', () => {
			expect(normalizeDestinationPath('project')).toBe('project')
			expect(normalizeDestinationPath('project/')).toBe('project')
			expect(normalizeDestinationPath('nested/project')).toBe('nested/project')
			expect(normalizeDestinationPath('nested/project/')).toBe('nested/project')
		})

		it('rejects empty, root, and traversal paths', () => {
			expect(() => normalizeDestinationPath('')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('   ')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('.')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('./')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('../project')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('../../project')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('foo/../../bar')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('/tmp/project')).toThrow(DirployError)
		})
	})

	describe('assertSafeDestinationInsideRepository', () => {
		let repoRoot: string

		beforeEach(async () => {
			repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-paths-test-'))
		})

		afterEach(async () => {
			await fs.rm(repoRoot, { recursive: true, force: true })
		})

		it('resolves safe subpath inside repository root', () => {
			const resolved = assertSafeDestinationInsideRepository(repoRoot, 'my-app')
			expect(resolved).toBe(path.resolve(repoRoot, 'my-app'))
		})

		it('rejects destination that resolves to root or outside root', () => {
			expect(() => assertSafeDestinationInsideRepository(repoRoot, '.')).toThrow(DirployError)
			expect(() => assertSafeDestinationInsideRepository(repoRoot, '..')).toThrow(DirployError)
			expect(() => assertSafeDestinationInsideRepository(repoRoot, '../outside')).toThrow(
				DirployError,
			)
		})
	})

	describe('validateSourceDirectory', () => {
		let tmpDir: string

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-src-test-'))
		})

		afterEach(async () => {
			await fs.rm(tmpDir, { recursive: true, force: true })
		})

		it('rejects non-existent directory', async () => {
			await expect(validateSourceDirectory(path.join(tmpDir, 'does-not-exist'))).rejects.toThrow(
				DirployError,
			)
		})

		it('rejects a file instead of directory', async () => {
			const filePath = path.join(tmpDir, 'file.txt')
			await fs.writeFile(filePath, 'hello')
			await expect(validateSourceDirectory(filePath)).rejects.toThrow(DirployError)
		})

		it('rejects empty directory', async () => {
			await expect(validateSourceDirectory(tmpDir)).rejects.toThrow(DirployError)
		})

		it('accepts directory containing at least one file', async () => {
			await fs.writeFile(path.join(tmpDir, 'index.html'), '<h1>Hello</h1>')
			const validated = await validateSourceDirectory(tmpDir)
			expect(validated).toBe(tmpDir)
		})
	})

	describe('detectSubpathAssetWarnings', () => {
		let tmpDir: string

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-warn-test-'))
		})

		afterEach(async () => {
			await fs.rm(tmpDir, { recursive: true, force: true })
		})

		it('returns empty warnings when no index.html exists', async () => {
			const warnings = await detectSubpathAssetWarnings(tmpDir, 'my-subpath')
			expect(warnings).toEqual([])
		})

		it('returns empty warnings when assets use relative paths', async () => {
			await fs.writeFile(
				path.join(tmpDir, 'index.html'),
				'<html><head><script src="./assets/app.js"></script><link rel="stylesheet" href="./style.css"></head></html>',
			)
			const warnings = await detectSubpathAssetWarnings(tmpDir, 'my-subpath')
			expect(warnings).toEqual([])
		})

		it('returns empty warnings when assets already include the subpath prefix', async () => {
			await fs.writeFile(
				path.join(tmpDir, 'index.html'),
				'<html><head><script src="/my-subpath/assets/app.js"></script></head></html>',
			)
			const warnings = await detectSubpathAssetWarnings(tmpDir, 'my-subpath')
			expect(warnings).toEqual([])
		})

		it('detects root-relative asset URLs and warns with guidance', async () => {
			await fs.writeFile(
				path.join(tmpDir, 'index.html'),
				'<html><head><script src="/assets/app.js"></script><link rel="stylesheet" href="/style.css"></head></html>',
			)
			const warnings = await detectSubpathAssetWarnings(tmpDir, 'my-subpath')
			expect(warnings).toHaveLength(1)
			expect(warnings[0]).toContain('Detected root-relative asset URLs')
			expect(warnings[0]).toContain('/assets/app.js')
			expect(warnings[0]).toContain('Configure your bundler base URL')
		})
	})
})
