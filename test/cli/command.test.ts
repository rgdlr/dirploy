import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from '../../src/cli/command.js'

describe('CLI command runner', () => {
	let tmpDir: string
	const originalCwd = process.cwd()

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-cli-test-'))
		process.chdir(tmpDir)
	})

	afterEach(async () => {
		process.chdir(originalCwd)
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it('exits with code 0 on --help', async () => {
		const code = await runCli(['node', 'dirploy', '--help'])
		expect(code).toBe(0)
	})

	it('exits with code 0 on --version', async () => {
		const code = await runCli(['node', 'dirploy', '--version'])
		expect(code).toBe(0)
	})

	it('exits with code 2 on unknown option', async () => {
		const code = await runCli(['node', 'dirploy', '--unknown-option'])
		expect(code).toBe(2)
	})

	it('exits with code 1 if source directory does not exist', async () => {
		const code = await runCli([
			'node',
			'dirploy',
			'./non-existent-dist',
			'--path',
			'demo',
			'--repo',
			'testuser/testuser.github.io',
		])
		expect(code).toBe(1)
	})
})
