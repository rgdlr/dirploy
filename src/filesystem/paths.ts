import { promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { DirployError } from '../errors.js'

export function normalizeDestinationPath(destinationPath: string): string {
	if (!destinationPath || typeof destinationPath !== 'string') {
		throw new DirployError('Destination path cannot be empty.', 'INVALID_DESTINATION')
	}

	const trimmed = destinationPath.trim()
	if (!trimmed || trimmed === '.' || trimmed === './') {
		throw new DirployError(
			'Deployment to the repository root is not supported. Please specify a subpath.',
			'INVALID_DESTINATION',
		)
	}

	if (path.isAbsolute(trimmed)) {
		throw new DirployError(
			`Destination path cannot be absolute: "${destinationPath}".`,
			'INVALID_DESTINATION',
		)
	}

	const pathSegments = trimmed.split(/[/\\]/)
	if (pathSegments.some((segment) => segment === '..')) {
		throw new DirployError(
			`Path traversal detected in destination path: "${destinationPath}".`,
			'INVALID_DESTINATION',
		)
	}

	const normalizedPosixPath = path.posix
		.normalize(trimmed.replace(/\\/g, '/'))
		.replace(/^\/+|\/+$/g, '')

	if (!normalizedPosixPath || normalizedPosixPath === '.' || normalizedPosixPath === './') {
		throw new DirployError(
			'Deployment to the repository root is not supported. Please specify a subpath.',
			'INVALID_DESTINATION',
		)
	}

	return normalizedPosixPath
}

export function assertSafeDestinationInsideRepository(
	repositoryRoot: string,
	destinationPath: string,
): string {
	const normalized = normalizeDestinationPath(destinationPath)
	const resolvedRoot = path.resolve(repositoryRoot)
	const resolvedTarget = path.resolve(resolvedRoot, normalized)

	const relativePathFromRoot = path.relative(resolvedRoot, resolvedTarget)

	if (
		!relativePathFromRoot ||
		relativePathFromRoot === '.' ||
		relativePathFromRoot.startsWith('..') ||
		path.isAbsolute(relativePathFromRoot)
	) {
		throw new DirployError(
			`Destination path must be a non-root directory inside the target repository: "${destinationPath}".`,
			'INVALID_DESTINATION',
		)
	}

	return resolvedTarget
}

export async function hasFiles(dir: string): Promise<boolean> {
	const entries = await fs.readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.isFile()) {
			return true
		}
		if (entry.isDirectory()) {
			const subDirectoryHasFiles = await hasFiles(path.join(dir, entry.name))
			if (subDirectoryHasFiles) {
				return true
			}
		}
	}
	return false
}

export async function validateSourceDirectory(sourceDirectory: string): Promise<string> {
	const resolvedSource = path.resolve(sourceDirectory)

	let stat: Stats
	try {
		stat = await fs.stat(resolvedSource)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DirployError(
				`Source directory "${sourceDirectory}" does not exist.\n\nBuild the project first or specify another source directory.`,
				'SOURCE_NOT_FOUND',
			)
		}
		throw error
	}

	if (!stat.isDirectory()) {
		throw new DirployError(`Source path "${sourceDirectory}" is not a directory.`, 'INVALID_SOURCE')
	}

	const containsFiles = await hasFiles(resolvedSource)
	if (!containsFiles) {
		throw new DirployError(
			`Source directory "${sourceDirectory}" is empty. It must contain at least one file.`,
			'INVALID_SOURCE',
		)
	}

	return resolvedSource
}

export async function detectSubpathAssetWarnings(
	sourceDirectory: string,
	destinationPath: string,
): Promise<string[]> {
	const warnings: string[] = []
	const indexHtmlPath = path.join(sourceDirectory, 'index.html')

	let content = ''
	try {
		content = await fs.readFile(indexHtmlPath, 'utf-8')
	} catch {
		return warnings
	}

	const absoluteAssetRegex = /<(?:script|link)[^>]*(?:src|href)=["'](\/[^/][^"']*)["'][^>]*>/gi
	let match: RegExpExecArray | null = absoluteAssetRegex.exec(content)
	const problematicPaths: string[] = []

	while (match) {
		const matchedPath = match[1]
		if (
			matchedPath &&
			!matchedPath.startsWith('//') &&
			!matchedPath.startsWith(`/${destinationPath}/`)
		) {
			problematicPaths.push(matchedPath)
		}
		match = absoluteAssetRegex.exec(content)
	}

	if (problematicPaths.length > 0) {
		const samplePaths = problematicPaths.slice(0, 3).join(', ')
		warnings.push(
			`Detected root-relative asset URLs (${samplePaths}) in "${indexHtmlPath}". When deploying to subpath "/${destinationPath}", assets may fail to load (404). Configure your bundler base URL to "./" or "/${destinationPath}/".`,
		)
	}

	return warnings
}
