import uri from 'urijs';

export default abstract class Api {
	readonly #baseUri: uri;

	constructor(baseUri: uri) {
		this.#baseUri = baseUri;
	}

	get baseUri(): uri {
		return uri(this.#baseUri.toString());
	}

	concatUris(endpoint: string | uri | URL): URL {
		const endpoint_parsed = uri(endpoint);
		return endpoint instanceof URL ? endpoint : (typeof endpoint == 'string' ? new URL(this
			.baseUri
			.path(`${this.baseUri.pathname()}/./${endpoint_parsed.path()}`)
			.query(endpoint_parsed.query(true))
			.normalizePathname()
			.toString()) : new URL(endpoint.toString()));
	}

	private async fetch(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<Response> {
		const url = this.concatUris(endpoint);

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

	async fetchJson<Response = any>(endpoint: string | uri | URL, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', headers: Record<string, string> = {}, body?: any): Promise<Response> {
		return await this.fetch(endpoint, method, Object.assign({}, headers, {
			'content-type': 'application/json',
			'accept': 'application/json'
		}), JSON.stringify(body))
			.then(res => res.json());
	}
}

export class CacheCell<T> {
	#cached: T;
	#lastRefresh: Date;

	constructor(private refresh: () => Promise<T>, private refreshIntervalSeconds = 30) {
		this.#cached = null as any;
		this.#lastRefresh = new Date("1970-01-01 00:00:00");
	}

	async get(): Promise<T> {
		if ((new Date().getTime() - this.#lastRefresh.getTime()) > this.refreshIntervalSeconds * 1000)
			this.#cached = await this.refresh();

		return this.#cached;
	}
}