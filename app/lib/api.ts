import uri from 'urijs';

export abstract class Api {
	readonly #baseUri: uri;

	protected constructor(baseUri: uri) {
		this.#baseUri = baseUri;
	}

	get baseUri(): uri {
		return uri(this.#baseUri.toString());
	}

	private async fetch(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<Response> {
		const endpoint_parsed = uri(endpoint)
		const url = endpoint instanceof URL ? endpoint : (typeof endpoint == 'string' ? new URL(this
			.baseUri
			.path(`${this.baseUri.pathname()}/./${endpoint_parsed.path()}`)
			.query(endpoint_parsed.query(true))
			.normalizePathname()
			.toString()) : new URL(endpoint.toString()));

		return await fetch(url, {
			method,
			headers: {...headers},
			body
		});
	}

	async fetchVoid(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<void> {
		return await this.fetch(endpoint, method, headers, body)
			.then(async res => {
				if (!res.ok)
					throw new Error(`Failed to fetch: ${res.statusText}`);

				const reader = res.body!.getReader();
				while (true) if (await reader.read().then(res => res.done)) break;
			});
	}

	async fetchBlob(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<Blob> {
		return await this.fetch(endpoint, method, headers, body)
			.then(res => res.blob());
	}

	async fetchText(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<string> {
		return await this.fetch(endpoint, method, headers, body)
			.then(res => res.text());
	}

	async fetchJson(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<any> {
		return await this.fetch(endpoint, method, Object.assign({}, headers, {
			'content-type': 'application/json',
			'accept': 'application/json'
		}), JSON.stringify(body))
			.then(res => res.json());
	}
}

export default class CertmasterApi extends Api {
	constructor(baseUri: uri) {
		super(baseUri);
	}

	async version(): Promise<ApiVersion> {
		return this.fetchJson("/version")
	}

	async getJobs(max: number = DEFAULT_MAX_JOBS): Promise<Job[]> {
		return this.fetchJson(`/jobs?${new URLSearchParams({ jobs: max.toString() })}`)
			.then(res => res.jobs)
	}

	async getJobById(id: string): Promise<Job> {
		return this.fetchJson(`/job?${new URLSearchParams({ jobs: id })}`)
	}
}

export const DEFAULT_MAX_JOBS = 50;

export interface ApiVersion {
	"service": string,
	"success": boolean,
	"version": string
}

export interface Job {
	clientId: string,
	alias: string,
	pem: string,
	status: JobStatus
}

export type JobStatus =
	"Pending" |
	"ChallengePending" |
	"ChallengePassed" |
	{ "ChallengeFailed": { "reason": string } } |
	"Finished" |
	{ "SigningError": { "reason": string } } |
	"Stale"