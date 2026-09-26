import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config/config-loader.js'
import { DirployError } from '../../src/errors.js'

describe('loadConfig', () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-config-test-'))
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it('returns null if config file does not exist in cwd', async () => {
		const config = await loadConfig(tmpDir)
		expect(config).toBeNull()
	})

	it('loads valid configuration file (dirploy.config.json)', async () => {
		const configPath = path.join(tmpDir, 'dirploy.config.json')
		await fs.writeFile(configPath, JSON.stringify({ source: 'dist', path: 'my-project' }))

		const config = await loadConfig(tmpDir)
		expect(config).toEqual({ source: 'dist', path: 'my-project' })
	})

	it('throws DirployError if custom config file does not exist', async () => {
		await expect(loadConfig(tmpDir, 'custom.json')).rejects.toThrow(DirployError)
	})

	it('throws DirployError if config file contains invalid JSON', async () => {
		const configPath = path.join(tmpDir, 'dirploy.config.json')
		await fs.writeFile(configPath, '{ invalid json')

		await expect(loadConfig(tmpDir)).rejects.toThrow(DirployError)
	})
})
