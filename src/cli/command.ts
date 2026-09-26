#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { loadConfig } from '../config/config-loader.js'
import { deploy } from '../deployment/deploy.js'
import {
	resolveDestinationPath,
	resolveOwner,
	resolveTargetRepository,
} from '../github/resolver.js'
import { initConfig } from './init.js'
import {
	printDeploymentDetails,
	printDryRunResult,
	printError,
	printFirstDeploymentWarning,
	printHeader,
	printNoChanges,
	printSuccess,
	printWarning,
} from './output.js'

function getPackageVersion(): string {
	try {
		const packageJsonPath = new URL('../../package.json', import.meta.url)
		const content = readFileSync(packageJsonPath, 'utf-8')
		const parsed = JSON.parse(content) as { version?: string }
		return parsed.version ?? '0.0.0'
	} catch {
		return '0.0.0'
	}
}

export const VERSION = getPackageVersion()

export const HELP_TEXT = `Usage: dirploy [options] [source]
       dirploy init [options]

Publish static build artifacts to isolated directories in your GitHub User Site.

Commands:
  init                       Create a dirploy.config.json configuration file

Arguments:
  source                     Static directory to publish (default: ./dist)

Options:
  -v, -V, --version          output the version number
  --path <path>              Destination directory inside the User Site repository
  --repo <owner/repository>  Destination repository
  --branch <branch>          Destination branch
  --message <message>        Git commit message
  --local-repo <path>        Path to local clone of User Site repository
  --domain, --cname <domain> Custom domain for public site URL
  --exclude <patterns>       Comma-separated patterns to exclude from deployment
  --no-clean                 Do not remove existing files in destination directory
  --nojekyll                 Create .nojekyll at repository root if missing
  --dry-run                  Calculate and display deployment without modifying destination
  --force                    Allow potentially destructive operations explicitly
  -h, --help                 display help for command`

export async function runCli(argv: string[] = process.argv): Promise<number> {
	const isProcessArgv =
		argv.length >= 2 &&
		(argv[0].endsWith('node') || argv[0].endsWith('node.exe') || argv[0].endsWith('dirploy'))

	const rawArgs = isProcessArgv ? argv.slice(2) : argv
	const normalizedArgs = rawArgs.map((arg) => (arg === '-V' ? '-v' : arg))

	let values: {
		path?: string
		repo?: string
		branch?: string
		message?: string
		'local-repo'?: string
		domain?: string
		cname?: string
		clean?: boolean
		'no-clean'?: boolean
		exclude?: string
		nojekyll?: boolean
		'dry-run'?: boolean
		force?: boolean
		help?: boolean
		version?: boolean
	} = {}
	let positionals: string[] = []

	try {
		const parsed = parseArgs({
			args: normalizedArgs,
			options: {
				path: { type: 'string' },
				repo: { type: 'string' },
				branch: { type: 'string' },
				message: { type: 'string' },
				'local-repo': { type: 'string' },
				domain: { type: 'string' },
				cname: { type: 'string' },
				clean: { type: 'boolean' },
				'no-clean': { type: 'boolean' },
				exclude: { type: 'string' },
				nojekyll: { type: 'boolean' },
				'dry-run': { type: 'boolean' },
				force: { type: 'boolean' },
				help: { type: 'boolean', short: 'h' },
				version: { type: 'boolean', short: 'v' },
			},
			allowPositionals: true,
			strict: true,
		})
		values = parsed.values
		positionals = parsed.positionals
	} catch (error: any) {
		if (error.code?.startsWith('ERR_PARSE_ARGS_')) {
			console.error(`error: ${error.message}`)
			return 2
		}
		printError(error)
		return 2
	}

	if (values.help) {
		console.log(HELP_TEXT)
		return 0
	}

	if (values.version) {
		console.log(VERSION)
		return 0
	}

	const cwd = process.cwd()

	if (positionals[0] === 'init') {
		try {
			const configPath = await initConfig({ force: values.force, cwd })
			console.log(`Created ${configPath} successfully.`)
			return 0
		} catch (error) {
			printError(error)
			return 1
		}
	}

	const cliSource = positionals[0]

	try {
		const config = await loadConfig(cwd)

		const source = cliSource || config?.source || './dist'
		const branch = values.branch || config?.branch || 'main'

		const explicitRepo = values.repo || config?.repository
		const owner = await resolveOwner({
			explicitRepo,
			dir: cwd,
		})

		const repository = resolveTargetRepository({
			explicitRepo: values.repo,
			configRepo: config?.repository,
			owner,
		})

		const destinationPath = await resolveDestinationPath({
			explicitPath: values.path,
			configPath: config?.path,
			dir: cwd,
		})

		const commitMessage = values.message || config?.message
		const localRepo = values['local-repo'] || config?.localRepo
		const domain = values.domain || values.cname || config?.domain || config?.cname

		let clean = true
		if (values['no-clean']) {
			clean = false
		} else if (values.clean !== undefined) {
			clean = Boolean(values.clean)
		} else if (config?.clean !== undefined) {
			clean = config.clean
		}

		let exclude: string[] = config?.exclude || []
		if (values.exclude) {
			const parsedExcludes = values.exclude
				.split(',')
				.map((p) => p.trim())
				.filter(Boolean)
			if (parsedExcludes.length > 0) {
				exclude = parsedExcludes
			}
		}

		const nojekyll = values.nojekyll ?? config?.nojekyll ?? false

		if (!values['dry-run']) {
			printHeader()
			printDeploymentDetails(source, repository, branch, destinationPath)
		}

		const result = await deploy({
			sourceDirectory: source,
			repository,
			branch,
			destinationPath,
			commitMessage,
			localRepo,
			domain,
			clean,
			exclude,
			nojekyll,
			dryRun: Boolean(values['dry-run']),
			onWarning: (warning) => {
				printWarning(warning)
			},
			onProgress: (step) => {
				if (step === 'synchronizing') {
					console.log('Synchronizing files...')
				} else if (step === 'committing') {
					console.log('Creating commit...')
				} else if (step === 'pushing') {
					console.log('Pushing changes...')
				} else if (step === 'retrying') {
					console.log('Remote updated during push. Retrying deployment...')
				}
			},
		})

		if (values['dry-run']) {
			printDryRunResult(result, source)
			return 0
		}

		if (!result.changed) {
			printNoChanges()
			return 0
		}

		if (result.isFirstDeployment) {
			printFirstDeploymentWarning(source, result.url)
		}

		printSuccess(result.url)
		return 0
	} catch (error) {
		printError(error)
		return 1
	}
}

const isDirectExecution =
	process.argv[1] &&
	(process.argv[1].endsWith('/command.js') ||
		process.argv[1].endsWith('/command.ts') ||
		process.argv[1].endsWith('dirploy'))

if (isDirectExecution) {
	runCli().then((code) => {
		if (code !== 0) {
			process.exit(code)
		}
	})
}
