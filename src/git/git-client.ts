import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { DirployError } from '../errors.js'

const execFileAsync = promisify(execFile)

export interface GitStatus {
	changed: boolean
	addedFiles: number
	updatedFiles: number
	removedFiles: number
}

export interface GitClient {
	clone(
		repository: string,
		destination: string,
		branch: string,
		referenceRepo?: string,
	): Promise<void>
	add(paths: string[]): Promise<void>
	commit(message: string, author?: { name: string; email: string }): Promise<void>
	push(remote: string, branch: string): Promise<void>
	status(): Promise<GitStatus>
}

export interface ManagedRepository {
	path: string
	git: GitClient
	cleanup: () => Promise<void>
}

export function sanitizeCredentials(input: string): string {
	if (!input) return ''
	return input
		.replace(/https:\/\/[^@\s]+@/g, 'https://***@')
		.replace(/ghp_[A-Za-z0-9]+/g, '***')
		.replace(/github_pat_[A-Za-z0-9_]+/g, '***')
}

export function handleGitError(error: any): never {
	const rawStderr = error.stderr ? String(error.stderr) : ''
	const rawStdout = error.stdout ? String(error.stdout) : ''
	const message = sanitizeCredentials(rawStderr || rawStdout || error.message || '')

	if (
		message.includes('Repository not found') ||
		(message.includes('repository') && message.includes('does not exist'))
	) {
		throw new DirployError(
			`Target repository does not exist or you do not have permission to access it.\n${message}`,
			'REPOSITORY_UNAVAILABLE',
		)
	}

	if (
		(message.includes('Remote branch') && message.includes('not found')) ||
		(message.includes('branch') && message.includes('not found'))
	) {
		throw new DirployError(
			`Target branch was not found in repository.\n${message}`,
			'BRANCH_UNAVAILABLE',
		)
	}

	if (
		message.includes('Authentication failed') ||
		message.includes('Permission denied') ||
		message.includes('could not read Username') ||
		message.includes('Invalid username or password')
	) {
		throw new DirployError(
			`GitHub authentication failed. Please check your Git credentials (SSH key or personal access token).\n${message}`,
			'AUTHENTICATION_FAILED',
		)
	}

	if (
		message.includes('fetch first') ||
		message.includes('non-fast-forward') ||
		message.includes('[rejected]')
	) {
		throw new DirployError(
			'Deployment failed because the remote branch changed. Please retry the deployment.',
			'PUSH_REJECTED',
		)
	}

	throw new DirployError(`Git command failed: ${message}`, 'DEPLOYMENT_FAILED')
}

export async function getGitAuthor(
	dir: string = process.cwd(),
): Promise<{ name: string; email: string }> {
	try {
		const { stdout: name } = await execFileAsync('git', ['config', '--get', 'user.name'], {
			cwd: dir,
		})
		const { stdout: email } = await execFileAsync('git', ['config', '--get', 'user.email'], {
			cwd: dir,
		})
		const trimmedName = name.trim()
		const trimmedEmail = email.trim()
		if (trimmedName && trimmedEmail) {
			return { name: trimmedName, email: trimmedEmail }
		}
	} catch {}
	return { name: 'dirploy', email: 'dirploy@users.noreply.github.com' }
}

export class DefaultGitClient implements GitClient {
	constructor(private readonly cwd?: string) {}

	private async execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
		const workingDir = cwd || this.cwd || process.cwd()
		try {
			return await execFileAsync('git', args, {
				cwd: workingDir,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
				},
			})
		} catch (error: any) {
			handleGitError(error)
		}
	}

	async clone(
		repository: string,
		destination: string,
		branch: string,
		referenceRepo?: string,
	): Promise<void> {
		const args = ['clone', '--depth', '1', '--branch', branch]
		if (referenceRepo) {
			args.push('--reference', referenceRepo)
		}
		args.push(repository, destination)
		await this.execGit(args)
	}

	async add(paths: string[]): Promise<void> {
		await this.execGit(['add', ...paths])
	}

	async commit(message: string, author?: { name: string; email: string }): Promise<void> {
		const resolvedAuthor = author || (await getGitAuthor(this.cwd))
		const commitArgs = [
			'-c',
			`user.name=${resolvedAuthor.name}`,
			'-c',
			`user.email=${resolvedAuthor.email}`,
			'commit',
			'-m',
			message,
		]
		await this.execGit(commitArgs)
	}

	async push(remote: string, branch: string): Promise<void> {
		await this.execGit(['push', remote, branch])
	}

	async status(): Promise<GitStatus> {
		const { stdout } = await this.execGit(['status', '--porcelain', '-uall'])
		const lines = stdout.split('\n')

		let addedFiles = 0
		let updatedFiles = 0
		let removedFiles = 0

		for (const rawLine of lines) {
			const line = rawLine.trimEnd()
			if (!line) continue

			const status = line.slice(0, 2)
			if (status.includes('?') || status.includes('A')) {
				addedFiles++
			} else if (status.includes('D')) {
				removedFiles++
			} else if (status.includes('M') || status.includes('R')) {
				updatedFiles++
			}
		}

		const changed = addedFiles + updatedFiles + removedFiles > 0

		return {
			changed,
			addedFiles,
			updatedFiles,
			removedFiles,
		}
	}
}

export async function createTemporaryRepository(): Promise<ManagedRepository> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirploy-repo-'))
	const git = new DefaultGitClient(tempDir)

	const cleanup = async () => {
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {}
	}

	return {
		path: tempDir,
		git,
		cleanup,
	}
}
