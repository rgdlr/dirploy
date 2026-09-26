import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DirployError } from '../errors.js'

export interface SynchronizeOptions {
	clean?: boolean
	exclude?: string[]
}

export interface DirectorySynchronizer {
	synchronize(
		sourceDirectory: string,
		destinationDirectory: string,
		options?: SynchronizeOptions,
	): Promise<void>
}

export function matchesPattern(relativeFilePath: string, pattern: string): boolean {
	const normalizedPath = relativeFilePath.replace(/\\/g, '/')
	const normalizedPattern = pattern.trim().replace(/\\/g, '/')

	if (!normalizedPattern) return false

	if (normalizedPattern.startsWith('*.')) {
		const extension = normalizedPattern.slice(1)
		return normalizedPath.endsWith(extension)
	}

	if (normalizedPattern.endsWith('/*')) {
		const prefix = normalizedPattern.slice(0, -2)
		return normalizedPath.startsWith(`${prefix}/`) || normalizedPath === prefix
	}

	if (normalizedPath === normalizedPattern || normalizedPath.endsWith(`/${normalizedPattern}`)) {
		return true
	}

	const regexPattern = normalizedPattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '.*')
		.replace(/(?<!\.)\*/g, '[^/]*')

	const regex = new RegExp(`(^|/)${regexPattern}($|/)`)
	return regex.test(normalizedPath)
}

export class SafeDirectorySynchronizer implements DirectorySynchronizer {
	async synchronize(
		sourceDirectory: string,
		destinationDirectory: string,
		options?: SynchronizeOptions,
	): Promise<void> {
		const resolvedSource = path.resolve(sourceDirectory)
		const resolvedDest = path.resolve(destinationDirectory)

		if (resolvedSource === resolvedDest) {
			throw new DirployError(
				'Source and destination directories cannot be the same path.',
				'INVALID_DESTINATION',
			)
		}

		const sourceStat = await fs.stat(resolvedSource).catch(() => null)
		if (!sourceStat?.isDirectory()) {
			throw new DirployError(
				`Source directory does not exist or is not a directory: "${sourceDirectory}".`,
				'SOURCE_NOT_FOUND',
			)
		}

		const destStat = await fs.stat(resolvedDest).catch(() => null)
		if (destStat) {
			if (!destStat.isDirectory()) {
				throw new DirployError(
					`Destination path exists and is not a directory: "${destinationDirectory}".`,
					'INVALID_DESTINATION',
				)
			}
			if (options?.clean !== false) {
				await fs.rm(resolvedDest, { recursive: true, force: true })
			}
		}

		await fs.mkdir(path.dirname(resolvedDest), { recursive: true })

		const excludePatterns = options?.exclude?.filter(Boolean) || []
		if (excludePatterns.length === 0) {
			await fs.cp(resolvedSource, resolvedDest, { recursive: true })
			return
		}

		await fs.cp(resolvedSource, resolvedDest, {
			recursive: true,
			filter: (src) => {
				const relative = path.relative(resolvedSource, src)
				if (!relative) return true
				const isExcluded = excludePatterns.some((pattern) => matchesPattern(relative, pattern))
				return !isExcluded
			},
		})
	}
}
