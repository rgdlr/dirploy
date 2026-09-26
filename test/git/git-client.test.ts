import { promises as fs } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTemporaryRepository, sanitizeCredentials } from '../../src/git/git-client.js'

describe('git client and credentials', () => {
	it('sanitizes credentials in URLs and tokens', () => {
		const textWithHttpsToken =
			'fatal: unable to access https://ghp_secretToken12345@github.com/user/repo.git: 403'
		const sanitized = sanitizeCredentials(textWithHttpsToken)
		expect(sanitized).not.toContain('ghp_secretToken12345')
		expect(sanitized).toContain('https://***@github.com/user/repo.git')

		const patText = 'Error with token github_pat_abc123_XYZ'
		expect(sanitizeCredentials(patText)).toBe('Error with token ***')
	})

	it('creates and cleans up temporary repository', async () => {
		const repo = await createTemporaryRepository()
		expect(repo.path).toBeDefined()

		const statBefore = await fs.stat(repo.path)
		expect(statBefore.isDirectory()).toBe(true)

		await repo.cleanup()

		await expect(fs.stat(repo.path)).rejects.toThrow()
	})
})
