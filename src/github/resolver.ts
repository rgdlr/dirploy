import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { DirployError } from '../errors.js'
import { normalizeDestinationPath } from '../filesystem/paths.js'

const execFileAsync = promisify(execFile)

export interface GitHubRepoInfo {
	owner: string
	name: string
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
	if (!url) return null
	const trimmed = url.trim()

	const sshMatch = trimmed.match(
		/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/,
	)
	if (sshMatch) {
		return { owner: sshMatch[1], name: sshMatch[2] }
	}

	const httpsMatch = trimmed.match(
		/^(?:https?|ssh):\/\/(?:[^@\s]+@)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/)?$/,
	)
	if (httpsMatch) {
		return { owner: httpsMatch[1], name: httpsMatch[2] }
	}

	return null
}

export async function getGitRemoteUrl(dir: string = process.cwd()): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
			cwd: dir,
		})
		return stdout.trim() || null
	} catch {
		try {
			const { stdout } = await execFileAsync('git', ['remote', '-v'], { cwd: dir })
			const firstLine = stdout.split('\n')[0]
			if (firstLine) {
				const remoteUrlCandidate = firstLine.trim().split(/\s+/)[1]
				if (remoteUrlCandidate) {
					return remoteUrlCandidate
				}
			}
		} catch {
			return null
		}
	}
	return null
}

export async function getGhAuthUser(): Promise<string | null> {
	try {
		const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], {
			env: { ...process.env, NO_COLOR: '1' },
		})
		const output = `${stdout}\n${stderr}`.trim()
		const accountMatch = output.match(/account\s+([a-zA-Z0-9_-]+)/i)
		if (accountMatch) {
			return accountMatch[1]
		}
	} catch {
		return null
	}
	return null
}

export interface ResolveOwnerOptions {
	explicitRepo?: string
	dir?: string
	getGhUser?: () => Promise<string | null>
	getRemoteUrl?: (dir: string) => Promise<string | null>
}

export async function resolveOwner(options: ResolveOwnerOptions = {}): Promise<string> {
	if (options.explicitRepo) {
		const trimmedRepo = options.explicitRepo.trim()
		const parsedInfo = parseGitHubUrl(trimmedRepo)
		if (parsedInfo) {
			return parsedInfo.owner
		}
		const repoParts = trimmedRepo.split('/')
		if (repoParts.length === 2 && repoParts[0] && repoParts[1]) {
			return repoParts[0]
		}
	}

	const retrieveRemote = options.getRemoteUrl || getGitRemoteUrl
	const remoteUrl = await retrieveRemote(options.dir || process.cwd())
	if (remoteUrl) {
		const parsedRemote = parseGitHubUrl(remoteUrl)
		if (parsedRemote) {
			return parsedRemote.owner
		}
	}

	const retrieveGhUser = options.getGhUser || getGhAuthUser
	const authenticatedUser = await retrieveGhUser()
	if (authenticatedUser) {
		return authenticatedUser
	}

	throw new DirployError(
		'Could not determine GitHub owner from Git remote.\nPlease specify --repo <owner/repository> or configure a remote origin.',
		'AUTHENTICATION_FAILED',
	)
}

export function buildSiteUrl(
	owner: string,
	destinationPath: string,
	customDomain?: string,
): string {
	const normalizedPath = destinationPath.replace(/^\/+|\/+$/g, '')
	if (customDomain) {
		const cleanDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
		return `https://${cleanDomain}/${normalizedPath}/`
	}
	return `https://${owner}.github.io/${normalizedPath}/`
}

export async function findLocalUserSiteRepository(
	owner: string,
	cwd: string = process.cwd(),
): Promise<string | null> {
	const parentDir = path.dirname(path.resolve(cwd))
	const directCandidate = path.join(parentDir, `${owner}.github.io`)
	try {
		const stat = await fs.stat(path.join(directCandidate, '.git'))
		if (stat.isDirectory() || stat.isFile()) {
			return directCandidate
		}
	} catch {}

	try {
		const entries = await fs.readdir(parentDir, { withFileTypes: true })
		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.endsWith('.github.io')) {
				const gitPath = path.join(parentDir, entry.name, '.git')
				try {
					const stat = await fs.stat(gitPath)
					if (stat.isDirectory() || stat.isFile()) {
						return path.join(parentDir, entry.name)
					}
				} catch {}
			}
		}
	} catch {}

	return null
}

export interface ResolveDestinationPathOptions {
	explicitPath?: string
	configPath?: string
	dir?: string
	getRemoteUrl?: (dir: string) => Promise<string | null>
}

export async function resolveDestinationPath(
	options: ResolveDestinationPathOptions = {},
): Promise<string> {
	if (options.explicitPath) {
		return normalizeDestinationPath(options.explicitPath)
	}

	if (options.configPath) {
		return normalizeDestinationPath(options.configPath)
	}

	const retrieveRemote = options.getRemoteUrl || getGitRemoteUrl
	const remoteUrl = await retrieveRemote(options.dir || process.cwd())
	if (remoteUrl) {
		const parsed = parseGitHubUrl(remoteUrl)
		if (parsed?.name) {
			return normalizeDestinationPath(parsed.name)
		}
	}

	throw new DirployError(
		'Could not determine destination path from Git repository.\nPlease specify --path <path> or configure "path" in dirploy.config.json.',
		'INVALID_DESTINATION',
	)
}

export interface ResolveTargetRepositoryOptions {
	explicitRepo?: string
	configRepo?: string
	owner: string
}

export function resolveTargetRepository(options: ResolveTargetRepositoryOptions): string {
	const repositoryIdentifier =
		options.explicitRepo || options.configRepo || `${options.owner}/${options.owner}.github.io`
	const trimmedIdentifier = repositoryIdentifier.trim()

	const parsedUrl = parseGitHubUrl(trimmedIdentifier)
	if (parsedUrl) {
		return `${parsedUrl.owner}/${parsedUrl.name}`
	}

	const parts = trimmedIdentifier.split('/')
	if (parts.length === 2 && parts[0] && parts[1]) {
		return trimmedIdentifier
	}

	throw new DirployError(
		`Invalid repository format: "${repositoryIdentifier}". Expected format is "owner/repository".`,
		'INVALID_DESTINATION',
	)
}
