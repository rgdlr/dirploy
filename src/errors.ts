export type DirployErrorCode =
	| 'SOURCE_NOT_FOUND'
	| 'INVALID_SOURCE'
	| 'INVALID_DESTINATION'
	| 'REPOSITORY_UNAVAILABLE'
	| 'BRANCH_UNAVAILABLE'
	| 'AUTHENTICATION_FAILED'
	| 'PUSH_REJECTED'
	| 'DEPLOYMENT_FAILED'
	| 'INVALID_CONFIG'

export class DirployError extends Error {
	constructor(
		message: string,
		public readonly code: DirployErrorCode | string,
	) {
		super(message)
		this.name = 'DirployError'
	}
}

export const PublisherError = DirployError
export type PublisherErrorCode = DirployErrorCode
