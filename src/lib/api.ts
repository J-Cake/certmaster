import uri from 'urijs';
import * as tarjs from '@gera2ld/tarjs';

import archive, {Archive} from "./archive.js";

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

export default class DockerApi extends Api {
	constructor(baseUri: uri) {
		super(baseUri);
	}

	async listContainers(): Promise<Container[]> {
		return await this.fetchJson("/containers/json?all=true")
			.then((containers: ApiContainer[]) => containers.map(container => new Container(this.baseUri, container)));
	}
}

export interface ApiContainer {
	readonly Names: string[];
	readonly Id: string;
	readonly State: string;
}

export class Container extends Api {
	public constructor(baseUri: uri, readonly container: ApiContainer) {
		super(baseUri);
	}

	get baseUri(): uri {
		return super.baseUri
			.pathname(`${super.baseUri.path()}/./containers/${this.id}/`);
	}

	get apiUri(): uri {
		return super.baseUri;
	}

	get id(): string {
		return this.container.Id;
	}

	get name(): string {
		return this.container.Names[0];
	}

	get last_known_state(): string {
		return this.container.State;
	}

	private getSuper(): Api {
		const base = super.baseUri;
		return new class extends Api {
			constructor() {
				super(base);
			}
		}
	}

	async archive(path: string): Promise<Archive> {
		return await this
			.fetchBlob(`/archive?path=${path}`, 'GET', {'accept': 'application/x-tar'})
			.then(tape => archive(tape));
	}

	async saveArchive(path: string, archive: Archive): Promise<void> {
		const writer = new tarjs.TarWriter;

		await Promise.all(archive.listFiles()
			.filter(file => file.meta().name.endsWith('.conf'))
			.map(async file => {
				const blob = await file.read();
				writer.addFile(file.meta().name, blob);
			}));

		if (this.last_known_state == 'running') {
			await this.exec(['rm', '-rf', path])
				.catch(() => {
				});
			await this.exec(['mkdir', '-p', path])
				.catch(() => {
				});
		}
		await this.fetchVoid(`/archive?path=${path}`, 'PUT', {'content-type': 'application/x-tar'}, await writer.write());
	}

	async exec(cmd: string[]): Promise<void> {
		const id = await this.fetchJson('/exec', 'POST', {}, {
			AttachStdin: false,
			AttachStdout: true,
			AttachStderr: true,
			Detach: false,
			Tty: false,
			Cmd: cmd,
		}).then(res => res['Id'] as string);

		const superClass = this.getSuper();

		await superClass.fetchVoid(`/exec/${id}/start`, 'POST', {'content-type': 'application/json'}, JSON.stringify({
			Detach: false,
			Tty: false,
		}));

		const isOk = await superClass.fetchJson(`/exec/${id}/json`, 'GET')
			.then(json => json['Running'] == false && json['ExitCode'] == 0);

		if (isOk)
			return;

		else throw new Error(`Failed to execute command: ${cmd.join(' ')}`);
	}

	async *monitor(options?: {
		type?: 'container',
		signal ? : AbortSignal
	}): AsyncGenerator<DockerEvent> {
		const base = super.baseUri
			.path(`${super.baseUri.path()}/./events`)
			.addQuery('filter', JSON.stringify({container: [this.id], type: options?.type}))
			.normalizePathname();

		const res = await fetch(base.toString(), {
			headers: {
				'connection': 'keep-alive',
			},
			keepalive: true,
			signal: options?.signal
		})
			.catch(() => {
				throw new Error('Failed to connect to Docker');
			});

		if (res.body)
			for await (const line of linesFromStream(res.body!, options?.signal))
				yield JSON.parse(line);
	}

	async inspect(): Promise<any> {
		return await this.fetchJson("/json");
	}

	async logs(): Promise<string> {
		return await this.fetchJson("/logs");
	}

	async start(): Promise<void> {
		return await this.fetchVoid("/start", "POST");
	}

	async restart(): Promise<void> {
		return await this.fetchVoid("/restart?t=5", "POST");
	}

	async stop(): Promise<void> {
		return await this.fetchVoid("/stop", "POST");
	}

	async signal(signal: string): Promise<void> {
		return await this.fetchVoid(`/kill?signal=${signal}`, "POST", {});
	}
}

export async function* linesFromStream(stream: ReadableStream, abort?: AbortSignal) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (!abort?.aborted) {
		const {value, done} = await reader.read();

		if (done) break;

		buffer += decoder.decode(value, {stream: true });
		let parts = buffer.split('\n');
		buffer = parts.pop()!; // last line may be incomplete

		for (const line of parts) if (line.trim()) yield line;
	}

	if (buffer.trim()) yield buffer; // leftover
}

export interface DockerEvent {
	Type: string,
	status: string,
}