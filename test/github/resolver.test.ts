import { describe, expect, it } from 'vitest'
import { DirployError } from '../../src/errors.js'
import {
	buildSiteUrl,
	parseGitHubUrl,
	resolveDestinationPath,
	resolveOwner,
	resolveTargetRepository,
} from '../../src/github/resolver.js'

describe('github resolver', () => {
	describe('parseGitHubUrl', () => {
		it('parses SSH GitHub URLs', () => {
			expect(parseGitHubUrl('git@github.com:alice/my-repo.git')).toEqual({
				owner: 'alice',
				name: 'my-repo',
			})
			expect(parseGitHubUrl('git@github.com:alice/my-repo')).toEqual({
				owner: 'alice',
				name: 'my-repo',
			})
		})

		it('parses HTTPS GitHub URLs', () => {
			expect(parseGitHubUrl('https://github.com/alice/my-repo.git')).toEqual({
				owner: 'alice',
				name: 'my-repo',
			})
			expect(parseGitHubUrl('https://github.com/alice/my-repo')).toEqual({
				owner: 'alice',
				name: 'my-repo',
			})
			expect(parseGitHubUrl('https://token@github.com/alice/my-repo.git')).toEqual({
				owner: 'alice',
				name: 'my-repo',
			})
		})

		it('returns null for non-GitHub or invalid URLs', () => {
			expect(parseGitHubUrl('https://gitlab.com/alice/my-repo.git')).toBeNull()
			expect(parseGitHubUrl('invalid-url')).toBeNull()
		})
	})

	describe('buildSiteUrl', () => {
		it('generates correct GitHub Pages URL', () => {
			expect(buildSiteUrl('alice', 'my-project')).toBe('https://alice.github.io/my-project/')
			expect(buildSiteUrl('alice', '/demos/sample/')).toBe('https://alice.github.io/demos/sample/')
		})
	})

	describe('resolveOwner', () => {
		it('resolves owner from explicitRepo', async () => {
			const owner = await resolveOwner({ explicitRepo: 'bob/custom-repo' })
			expect(owner).toBe('bob')
		})

		it('resolves owner from git remote URL', async () => {
			const owner = await resolveOwner({
				getRemoteUrl: async () => 'git@github.com:dave/project.git',
			})
			expect(owner).toBe('dave')
		})

		it('resolves owner from gh CLI fallback if remote is unavailable', async () => {
			const owner = await resolveOwner({
				getRemoteUrl: async () => null,
				getGhUser: async () => 'charlie',
			})
			expect(owner).toBe('charlie')
		})

		it('throws error if owner cannot be resolved', async () => {
			await expect(
				resolveOwner({
					getGhUser: async () => null,
					getRemoteUrl: async () => null,
				}),
			).rejects.toThrow(DirployError)
		})
	})

	describe('resolveDestinationPath', () => {
		it('prefers explicit path', async () => {
			const path = await resolveDestinationPath({
				explicitPath: 'explicit-path',
				configPath: 'config-path',
				getRemoteUrl: async () => 'git@github.com:user/remote-repo.git',
			})
			expect(path).toBe('explicit-path')
		})

		it('uses config path if no explicit path', async () => {
			const path = await resolveDestinationPath({
				configPath: 'config-path',
				getRemoteUrl: async () => 'git@github.com:user/remote-repo.git',
			})
			expect(path).toBe('config-path')
		})

		it('derives from remote URL if no explicit or config path', async () => {
			const path = await resolveDestinationPath({
				getRemoteUrl: async () => 'git@github.com:user/remote-repo.git',
			})
			expect(path).toBe('remote-repo')
		})

		it('throws error if destination path cannot be determined', async () => {
			await expect(
				resolveDestinationPath({
					getRemoteUrl: async () => null,
				}),
			).rejects.toThrow(DirployError)
		})
	})

	describe('resolveTargetRepository', () => {
		it('resolves explicit repository', () => {
			expect(resolveTargetRepository({ explicitRepo: 'org/site', owner: 'alice' })).toBe('org/site')
		})

		it('resolves config repository', () => {
			expect(resolveTargetRepository({ configRepo: 'org/custom', owner: 'alice' })).toBe(
				'org/custom',
			)
		})

		it('defaults to owner/owner.github.io', () => {
			expect(resolveTargetRepository({ owner: 'alice' })).toBe('alice/alice.github.io')
		})
	})
})
