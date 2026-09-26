import type { DeploymentResult } from '../deployment/deploy.js'
import { DirployError } from '../errors.js'

function red(text: string): string {
	if (
		process.env.NO_COLOR ||
		(process.stderr && !process.stderr.isTTY && !process.env.FORCE_COLOR)
	) {
		return text
	}
	return `\x1b[31m${text}\x1b[39m`
}

function yellow(text: string): string {
	if (
		process.env.NO_COLOR ||
		(process.stderr && !process.stderr.isTTY && !process.env.FORCE_COLOR)
	) {
		return text
	}
	return `\x1b[33m${text}\x1b[39m`
}

export function printWarning(message: string): void {
	console.warn(`\n${yellow(`warning: ${message}`)}\n`)
}

export function printHeader(): void {
	console.log('Dirploy\n')
}

export function formatDetails(
	source: string,
	repository: string,
	branch: string,
	destination: string,
): string {
	return [
		`Source:      ${source}`,
		`Repository:  ${repository}`,
		`Branch:      ${branch}`,
		`Destination: ${destination}`,
	].join('\n')
}

export function printDeploymentDetails(
	source: string,
	repository: string,
	branch: string,
	destination: string,
): void {
	console.log(formatDetails(source, repository, branch, destination))
	console.log('')
}

export function printDryRunResult(result: DeploymentResult, sourceDisplay: string): void {
	console.log(
		formatDetails(sourceDisplay, result.repository, result.branch, result.destinationPath),
	)
	console.log('')
	console.log(`Files to add:    ${result.addedFiles}`)
	console.log(`Files to update: ${result.updatedFiles}`)
	console.log(`Files to remove: ${result.removedFiles}`)
	console.log('')
	console.log('No changes were made.')
}

export function printFirstDeploymentWarning(source: string, url: string): void {
	console.log(
		`The contents of "${source}" will be published publicly at:\n\n${url}\n\nMake sure the directory does not contain secrets or private files.\n`,
	)
}

export function printNoChanges(): void {
	console.log('\nNo changes to deploy.')
}

export function printSuccess(url: string): void {
	console.log('\nPublished successfully.\n')
	console.log('URL:')
	console.log(url)
}

export function printError(error: unknown): void {
	if (error instanceof DirployError) {
		console.error(red(error.message))
	} else if (error instanceof Error) {
		console.error(red(error.message))
	} else {
		console.error(red(String(error)))
	}
}
