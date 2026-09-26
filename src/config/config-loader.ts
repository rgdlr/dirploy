import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DirployError } from '../errors.js'

export interface DirployConfig {
	$schema?: string
	source?: string
	path?: string
	repository?: string
	branch?: string
	message?: string
	localRepo?: string
	domain?: string
	cname?: string
	exclude?: string[]
	clean?: boolean
	nojekyll?: boolean
}

export type PublisherConfig = DirployConfig

export const CONFIG_FILE_NAME = 'dirploy.config.json'

export async function loadConfig(
	cwd: string = process.cwd(),
	customPath?: string,
): Promise<DirployConfig | null> {
	const filePath = customPath ? path.resolve(cwd, customPath) : path.resolve(cwd, CONFIG_FILE_NAME)

	try {
		const content = await fs.readFile(filePath, 'utf-8')
		let parsed: unknown
		try {
			parsed = JSON.parse(content)
		} catch (parseError) {
			throw new DirployError(
				`Failed to parse configuration file "${filePath}": ${(parseError as Error).message}`,
				'INVALID_CONFIG',
			)
		}

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new DirployError(
				`Configuration file "${filePath}" must contain a valid JSON object.`,
				'INVALID_CONFIG',
			)
		}

		return parsed as DirployConfig
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			if (customPath) {
				throw new DirployError(`Configuration file "${filePath}" does not exist.`, 'INVALID_CONFIG')
			}
			return null
		}
		throw error
	}
}
