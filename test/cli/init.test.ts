import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from '../../src/cli/command.js'
import { initConfig } from '../../src/cli/init.js'
import { CONFIG_FILE_NAME, loadConfig } from '../../src/config/config-loader.js'
import { DirployError } from '../../src/errors.js'

describe('init command', () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-init-test-'))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	})

	it('creates dirploy.config.json with default values', async () => {
		const createdPath = await initConfig({ cwd: tempDir })
		expect(createdPath).toBe(path.join(tempDir, CONFIG_FILE_NAME))

		const config = await loadConfig(tempDir)
		expect(config).toBeDefined()
		expect(config?.source).toBe('dist')
		expect(config?.clean).toBe(true)
		expect(config?.path).toBe(path.basename(tempDir))
	})

	it('fails if dirploy.config.json already exists without force flag', async () => {
		await initConfig({ cwd: tempDir })

		await expect(initConfig({ cwd: tempDir })).rejects.toThrow(DirployError)
		await expect(initConfig({ cwd: tempDir })).rejects.toThrow('already exists')
	})

	it('overwrites dirploy.config.json if force is true', async () => {
		await initConfig({ cwd: tempDir })
		await fs.writeFile(path.join(tempDir, CONFIG_FILE_NAME), '{"modified":true}', 'utf-8')

		await initConfig({ cwd: tempDir, force: true })
		const config = await loadConfig(tempDir)
		expect(config?.source).toBe('dist')
	})

	it('runs dirploy init via runCli', async () => {
		const originalCwd = process.cwd()
		try {
			process.chdir(tempDir)
			const exitCode = await runCli(['init'])
			expect(exitCode).toBe(0)

			const config = await loadConfig(tempDir)
			expect(config?.source).toBe('dist')
		} finally {
			process.chdir(originalCwd)
		}
	})
})
