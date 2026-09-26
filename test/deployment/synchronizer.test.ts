import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SafeDirectorySynchronizer } from '../../src/deployment/synchronizer.js'

describe('SafeDirectorySynchronizer', () => {
	let tmpDir: string
	let targetDir: string
	let sourceDir: string
	const synchronizer = new SafeDirectorySynchronizer()

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-sync-test-'))
		targetDir = path.join(tmpDir, 'target')
		sourceDir = path.join(tmpDir, 'dist')

		await fs.mkdir(targetDir, { recursive: true })
		await fs.mkdir(sourceDir, { recursive: true })

		await fs.mkdir(path.join(targetDir, 'app-a'), { recursive: true })
		await fs.writeFile(path.join(targetDir, 'app-a', 'index.html'), 'App A')
		await fs.writeFile(path.join(targetDir, 'root-file.txt'), 'Root')

		await fs.mkdir(path.join(targetDir, 'app-c'), { recursive: true })
		await fs.writeFile(path.join(targetDir, 'app-c', 'style.css'), 'body {}')

		await fs.mkdir(path.join(targetDir, 'app-b'), { recursive: true })
		await fs.writeFile(path.join(targetDir, 'app-b', 'old-file.js'), 'console.log("old")')
		await fs.writeFile(path.join(targetDir, 'app-b', 'index.html'), 'Old App B')

		await fs.writeFile(path.join(sourceDir, 'index.html'), 'New App B')
		await fs.mkdir(path.join(sourceDir, 'assets'), { recursive: true })
		await fs.writeFile(path.join(sourceDir, 'assets', 'app.js'), 'console.log("new")')
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it('synchronizes target directory while preserving unrelated directories and files', async () => {
		const destAppB = path.join(targetDir, 'app-b')
		await synchronizer.synchronize(sourceDir, destAppB)

		expect(await fs.readFile(path.join(targetDir, 'app-a', 'index.html'), 'utf-8')).toBe('App A')
		expect(await fs.readFile(path.join(targetDir, 'root-file.txt'), 'utf-8')).toBe('Root')
		expect(await fs.readFile(path.join(targetDir, 'app-c', 'style.css'), 'utf-8')).toBe('body {}')

		expect(await fs.readFile(path.join(destAppB, 'index.html'), 'utf-8')).toBe('New App B')
		expect(await fs.readFile(path.join(destAppB, 'assets', 'app.js'), 'utf-8')).toBe(
			'console.log("new")',
		)

		await expect(fs.stat(path.join(destAppB, 'old-file.js'))).rejects.toThrow()
	})

	it('synchronizes to a new subdirectory that did not previously exist', async () => {
		const destNew = path.join(targetDir, 'nested', 'new-app')
		await synchronizer.synchronize(sourceDir, destNew)

		expect(await fs.readFile(path.join(destNew, 'index.html'), 'utf-8')).toBe('New App B')
		expect(await fs.readFile(path.join(destNew, 'assets', 'app.js'), 'utf-8')).toBe(
			'console.log("new")',
		)
	})

	it('preserves existing files when clean is set to false', async () => {
		const destAppB = path.join(targetDir, 'app-b')
		await synchronizer.synchronize(sourceDir, destAppB, { clean: false })

		expect(await fs.readFile(path.join(destAppB, 'index.html'), 'utf-8')).toBe('New App B')
		expect(await fs.readFile(path.join(destAppB, 'old-file.js'), 'utf-8')).toBe(
			'console.log("old")',
		)
	})

	it('excludes files matching exclude patterns', async () => {
		await fs.writeFile(path.join(sourceDir, 'app.js.map'), '{"version":3}')
		await fs.writeFile(path.join(sourceDir, '.DS_Store'), 'ignored')

		const destAppB = path.join(targetDir, 'app-b')
		await synchronizer.synchronize(sourceDir, destAppB, {
			exclude: ['*.map', '.DS_Store'],
		})

		expect(await fs.readFile(path.join(destAppB, 'index.html'), 'utf-8')).toBe('New App B')
		await expect(fs.stat(path.join(destAppB, 'app.js.map'))).rejects.toThrow()
		await expect(fs.stat(path.join(destAppB, '.DS_Store'))).rejects.toThrow()
	})
})
