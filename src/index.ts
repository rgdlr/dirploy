export { runCli } from './cli/command.js'
export { type InitOptions, initConfig } from './cli/init.js'
export {
	CONFIG_FILE_NAME,
	type DirployConfig,
	loadConfig,
	type PublisherConfig,
} from './config/config-loader.js'
export {
	type DeploymentOptions,
	type DeploymentResult,
	deploy,
} from './deployment/deploy.js'
export {
	type DirectorySynchronizer,
	SafeDirectorySynchronizer,
} from './deployment/synchronizer.js'
export {
	DirployError,
	type DirployErrorCode,
	PublisherError,
	type PublisherErrorCode,
} from './errors.js'
export {
	assertSafeDestinationInsideRepository,
	detectSubpathAssetWarnings,
	normalizeDestinationPath,
	validateSourceDirectory,
} from './filesystem/paths.js'

export {
	createTemporaryRepository,
	DefaultGitClient,
	type GitClient,
	type GitStatus,
	type ManagedRepository,
} from './git/git-client.js'
export {
	buildSiteUrl,
	getGhAuthUser,
	getGitRemoteUrl,
	parseGitHubUrl,
	resolveDestinationPath,
	resolveOwner,
	resolveTargetRepository,
} from './github/resolver.js'
