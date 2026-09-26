import { describe, expect, it } from 'vitest'
import { DirployError } from '../src/errors.js'
import {
	assertSafeDestinationInsideRepository,
	normalizeDestinationPath,
} from '../src/filesystem/paths.js'
import { handleGitError } from '../src/git/git-client.js'

describe('hardening tests', () => {
	describe('path traversal attacks', () => {
		it('rejects traversal attempts with .. in various positions', () => {
			expect(() => normalizeDestinationPath('../evil')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('evil/..')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('evil/../evil')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('../../etc/passwd')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('/var/www')).toThrow(DirployError)
		})

		it('rejects root destination targets', () => {
			expect(() => normalizeDestinationPath('.')).toThrow(DirployError)
			expect(() => normalizeDestinationPath('./')).toThrow(DirployError)
			expect(() => assertSafeDestinationInsideRepository('/tmp/repo', '.')).toThrow(DirployError)
		})
	})

	describe('git error mapping', () => {
		it('maps remote rejected conflict to PUSH_REJECTED with exact retry instruction', () => {
			const fakeError: any = new Error('Command failed')
			fakeError.stderr =
				'To github.com:user/repo.git\n ! [rejected] main -> main (fetch first)\nerror: failed to push some refs'

			try {
				handleGitError(fakeError)
				expect.unreachable('Should have thrown')
			} catch (err: any) {
				expect(err).toBeInstanceOf(DirployError)
				expect(err.code).toBe('PUSH_REJECTED')
				expect(err.message).toBe(
					'Deployment failed because the remote branch changed. Please retry the deployment.',
				)
			}
		})

		it('maps repository not found error to REPOSITORY_UNAVAILABLE', () => {
			const fakeError: any = new Error('Command failed')
			fakeError.stderr = 'ERROR: Repository not found.'

			try {
				handleGitError(fakeError)
				expect.unreachable('Should have thrown')
			} catch (err: any) {
				expect(err).toBeInstanceOf(DirployError)
				expect(err.code).toBe('REPOSITORY_UNAVAILABLE')
				expect(err.message).toContain('Target repository does not exist')
			}
		})

		it('maps authentication failure to AUTHENTICATION_FAILED', () => {
			const fakeError: any = new Error('Command failed')
			fakeError.stderr = 'fatal: Authentication failed for https://github.com/user/repo.git'

			try {
				handleGitError(fakeError)
				expect.unreachable('Should have thrown')
			} catch (err: any) {
				expect(err).toBeInstanceOf(DirployError)
				expect(err.code).toBe('AUTHENTICATION_FAILED')
				expect(err.message).toContain('GitHub authentication failed')
			}
		})
	})
})
