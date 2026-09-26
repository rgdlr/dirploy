import { promises as fs } from 'node:fs'
import path from 'node:path'
import { CONFIG_FILE_NAME, type DirployConfig } from '../config/config-loader.js'
import { DirployError } from '../errors.js'
import { getGitRemoteUrl, parseGitHubUrl, resolveOwner } from '../github/resolver.js'

export interface InitOptions {
	force?: boolean
	cwd?: string
}

export async function initConfig(options: InitOptions = {}): Promise<string> {
	const workingDirectory = options.cwd || process.cwd()
	const configFilePath = path.join(workingDirectory, CONFIG_FILE_NAME)

	const fileExists = await fs
		.stat(configFilePath)
		.then(() => true)
		.catch(() => false)

	if (fileExists && !options.force) {
		throw new DirployError(
			`Configuration file "${CONFIG_FILE_NAME}" already exists.\nUse --force to overwrite it.`,
			'INVALID_CONFIG',
		)
	}

	let inferredPath = path.basename(path.resolve(workingDirectory))
	try {
		const remoteUrl = await getGitRemoteUrl(workingDirectory)
		if (remoteUrl) {
			const parsed = parseGitHubUrl(remoteUrl)
			if (parsed?.name) {
				inferredPath = parsed.name
			}
		}
	} catch {}

	let inferredOwner: string | undefined
	try {
		inferredOwner = await resolveOwner({ dir: workingDirectory })
	} catch {}

	const generatedConfig: DirployConfig = {
		$schema: 'https://raw.githubusercontent.com/rgdlr/dirploy/main/schema.json',
		source: 'dist',
		path: inferredPath,
		clean: true,
	}

	if (inferredOwner) {
		generatedConfig.repository = `${inferredOwner}/${inferredOwner}.github.io`
	}

	const content = `${JSON.stringify(generatedConfig, null, '\t')}\n`
	await fs.writeFile(configFilePath, content, 'utf-8')

	return configFilePath
}
