import { existsSync, promises as fs, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	assertSafeDestinationInsideRepository,
	detectSubpathAssetWarnings,
	normalizeDestinationPath,
	validateSourceDirectory,
} from '../filesystem/paths.js'
import { createTemporaryRepository, DefaultGitClient, type GitClient } from '../git/git-client.js'
import {
	buildSiteUrl,
	findLocalUserSiteRepository,
	getGitRemoteUrl,
	parseGitHubUrl,
} from '../github/resolver.js'
import { type DirectorySynchronizer, SafeDirectorySynchronizer } from './synchronizer.js'

export interface DeploymentOptions {
	sourceDirectory: string
	repository: string
	branch?: string
	destinationPath: string
	commitMessage?: string
	dryRun?: boolean
	localRepo?: string
	domain?: string
	cname?: string
	clean?: boolean
	exclude?: string[]
	nojekyll?: boolean
	ssh?: boolean
	maxRetries?: number
	gitClient?: GitClient
	synchronizer?: DirectorySynchronizer
	onProgress?: (step: 'synchronizing' | 'committing' | 'pushing' | 'retrying') => void
	onWarning?: (warning: string) => void
}

export interface DeploymentResult {
	changed: boolean
	addedFiles: number
	updatedFiles: number
	removedFiles: number
	repository: string
	branch: string
	destinationPath: string
	url: string
	isFirstDeployment?: boolean
	warnings?: string[]
}

export interface DeploymentPlan {
	sourceDirectory: string
	destinationPath: string
	repository: string
	branch: string
	commitMessage: string
	dryRun: boolean
	siteUrl: string
	cloneUrl: string
	owner: string
	referenceRepo?: string | null
	customDomain?: string
	clean: boolean
	exclude: string[]
	nojekyll: boolean
}

function hasLocalSshConfig(): boolean {
	if (process.env.SSH_AUTH_SOCK) {
		return true
	}
	try {
		const sshDir = path.join(os.homedir(), '.ssh')
		if (!existsSync(sshDir)) {
			return false
		}
		const entries = readdirSync(sshDir)
		return entries.some((file) => file.startsWith('id_') || file === 'config')
	} catch {
		return false
	}
}

export function resolveCloneUrl(
	repository: string,
	currentRemoteUrl?: string | null,
	options?: { ssh?: boolean },
): string {
	const trimmed = repository.trim()

	const isLocalOrFileProtocol =
		trimmed.startsWith('/') ||
		trimmed.startsWith('./') ||
		trimmed.startsWith('../') ||
		trimmed.startsWith('file://')

	if (isLocalOrFileProtocol) {
		return trimmed
	}

	const isExplicitSsh = trimmed.startsWith('git@') || trimmed.startsWith('ssh://')
	if (isExplicitSsh) {
		return trimmed
	}

	const authToken = process.env.DIRPLOY_TOKEN || process.env.GITHUB_TOKEN

	const isHttpProtocol = trimmed.startsWith('https://') || trimmed.startsWith('http://')
	if (isHttpProtocol) {
		if (authToken && !trimmed.includes('@')) {
			return trimmed.replace('https://', `https://x-access-token:${authToken}@`)
		}
		return trimmed
	}

	if (options?.ssh === true) {
		return `git@github.com:${trimmed}.git`
	}

	if (options?.ssh === false) {
		if (authToken) {
			return `https://x-access-token:${authToken}@github.com/${trimmed}.git`
		}
		return `https://github.com/${trimmed}.git`
	}

	if (authToken) {
		return `https://x-access-token:${authToken}@github.com/${trimmed}.git`
	}

	if (currentRemoteUrl?.startsWith('git@github.com:')) {
		return `git@github.com:${trimmed}.git`
	}

	if (!currentRemoteUrl && hasLocalSshConfig()) {
		return `git@github.com:${trimmed}.git`
	}

	return `https://github.com/${trimmed}.git`
}

export async function createDeploymentPlan(
	options: DeploymentOptions,
	currentRemoteUrl?: string | null,
): Promise<DeploymentPlan> {
	const validatedSource = await validateSourceDirectory(options.sourceDirectory)
	const normalizedPath = normalizeDestinationPath(options.destinationPath)

	let owner = 'user'
	const parsed = parseGitHubUrl(options.repository)
	if (parsed) {
		owner = parsed.owner
	} else {
		const parts = options.repository.split('/')
		if (parts.length === 2 && parts[0]) {
			owner = parts[0]
		}
	}

	const branch = options.branch || 'main'
	const commitMessage = options.commitMessage || `chore: deploy ${normalizedPath}`
	const dryRun = Boolean(options.dryRun)
	const customDomain = options.domain || options.cname
	const siteUrl = buildSiteUrl(owner, normalizedPath, customDomain)
	const cloneUrl = resolveCloneUrl(options.repository, currentRemoteUrl, { ssh: options.ssh })

	let referenceRepo = options.localRepo ? path.resolve(options.localRepo) : null
	if (!referenceRepo) {
		referenceRepo = await findLocalUserSiteRepository(owner).catch(() => null)
	}

	return {
		sourceDirectory: validatedSource,
		destinationPath: normalizedPath,
		repository: options.repository,
		branch,
		commitMessage,
		dryRun,
		siteUrl,
		cloneUrl,
		owner,
		referenceRepo,
		customDomain,
		clean: options.clean !== false,
		exclude: options.exclude || [],
		nojekyll: Boolean(options.nojekyll),
	}
}

export async function deploy(options: DeploymentOptions): Promise<DeploymentResult> {
	const currentRemoteUrl = await getGitRemoteUrl().catch(() => null)
	const plan = await createDeploymentPlan(options, currentRemoteUrl)

	const maxRetries = options.maxRetries ?? 2
	let attempt = 0

	while (attempt <= maxRetries) {
		const managedRepo = await createTemporaryRepository()
		const git = options.gitClient || new DefaultGitClient(managedRepo.path)
		const synchronizer = options.synchronizer || new SafeDirectorySynchronizer()

		try {
			await git.clone(plan.cloneUrl, managedRepo.path, plan.branch, plan.referenceRepo || undefined)

			const cnamePath = path.join(managedRepo.path, 'CNAME')
			let finalSiteUrl = plan.siteUrl
			if (!plan.customDomain) {
				const cnameContent = await fs.readFile(cnamePath, 'utf-8').catch(() => null)
				if (cnameContent?.trim()) {
					finalSiteUrl = buildSiteUrl(plan.owner, plan.destinationPath, cnameContent.trim())
				}
			}

			const nojekyllPath = path.join(managedRepo.path, '.nojekyll')
			const nojekyllExists = await fs
				.stat(nojekyllPath)
				.then(() => true)
				.catch(() => false)
			if (!nojekyllExists && plan.nojekyll) {
				await fs.writeFile(nojekyllPath, '')
			}

			const resolvedDestination = assertSafeDestinationInsideRepository(
				managedRepo.path,
				plan.destinationPath,
			)

			const destinationExisted = await fs
				.stat(resolvedDestination)
				.then(() => true)
				.catch(() => false)

			options.onProgress?.('synchronizing')
			await synchronizer.synchronize(plan.sourceDirectory, resolvedDestination, {
				clean: plan.clean,
				exclude: plan.exclude,
			})

			const status = await git.status()

			const warnings = await detectSubpathAssetWarnings(plan.sourceDirectory, plan.destinationPath)
			for (const warning of warnings) {
				options.onWarning?.(warning)
			}

			if (plan.dryRun) {
				return {
					changed: status.changed,
					addedFiles: status.addedFiles,
					updatedFiles: status.updatedFiles,
					removedFiles: status.removedFiles,
					repository: plan.repository,
					branch: plan.branch,
					destinationPath: plan.destinationPath,
					url: finalSiteUrl,
					isFirstDeployment: !destinationExisted,
					warnings,
				}
			}

			if (!status.changed) {
				return {
					changed: false,
					addedFiles: 0,
					updatedFiles: 0,
					removedFiles: 0,
					repository: plan.repository,
					branch: plan.branch,
					destinationPath: plan.destinationPath,
					url: finalSiteUrl,
					isFirstDeployment: !destinationExisted,
					warnings,
				}
			}

			options.onProgress?.('committing')
			await git.add(['.'])
			await git.commit(plan.commitMessage)

			options.onProgress?.('pushing')
			await git.push('origin', plan.branch)

			return {
				changed: true,
				addedFiles: status.addedFiles,
				updatedFiles: status.updatedFiles,
				removedFiles: status.removedFiles,
				repository: plan.repository,
				branch: plan.branch,
				destinationPath: plan.destinationPath,
				url: finalSiteUrl,
				isFirstDeployment: !destinationExisted,
				warnings,
			}
		} catch (error: any) {
			if (error?.code === 'PUSH_REJECTED' && attempt < maxRetries) {
				attempt++
				options.onProgress?.('retrying')
				continue
			}
			throw error
		} finally {
			await managedRepo.cleanup()
		}
	}

	throw new Error('Deployment failed: maximum retry attempts exceeded')
}
