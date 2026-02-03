import Api from './api';
import * as x509 from '@peculiar/x509';
import uri from 'urijs';
import {isDns} from "../new-certificate";

export default class CertmasterApi extends Api {
	constructor(baseUri: uri) {
		super(baseUri);
	}

	async version(): Promise<ApiVersion> {
		return this.fetchJson("/version")
	}

	async getItems(max: number = 50): Promise<Job[]> {
		if (this.getTracked().length <= 0)
			return [];

		return this.fetchJson(`/get-enqueued-items?max=${max}&cn=true`)
			.then(res => res.jobs)
	}

	async getJobById(id: string | string[]): Promise<{ csr: x509.Pkcs10CertificateRequest, job: Job }[]> {
		return this.fetchJson<{ jobs: Job[] }>(`/job?jobs=${[id].flat().map(i => encodeURIComponent(encodeURIComponent(i))).join('+')}`)
			.then(res => res.jobs.map(job => {
				const csr = new x509.Pkcs10CertificateRequest(job.pem);

				return {csr, job};
			}))
	}

	async newCertificateRequest(req: CertificateRequest) {
		// const keyUsages = new x509.KeyUsagesExtension(req.usages.reduce((a, i) => a | i, x509.KeyUsageFlags.keyCertSign), true);
		console.log(req, [req.hostname].flat().map(name => ({
			value: name,
			type: isDns(name) ? 'dns' : 'ip',
		})));
		const names = new x509.SubjectAlternativeNameExtension([req.hostname].flat().map(name => ({
			value: name,
			type: isDns(name) ? 'dns' : 'ip',
		})), true);


    	const keys: CryptoKeyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);

		const csr = await x509.Pkcs10CertificateRequestGenerator.create({
			keys,
			attributes: [],
			extensions: [
				// keyUsages,
				names,
				// await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
			],
			name: req.subject,
			signingAlgorithm: {
				name: "RSASSA-PKCS1-v1_5",
				hash: "SHA-256"
			}
		});

		const alt = await this.fetchJson<{
			jobs: { alt: string }[],
			success: true
		}>("/job", "POST", {}, [{
			client_id: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
			pem: csr.toString("pem")
		}]);

		this.watchAlt(alt.jobs.map(i => i.alt));
	}

	watchAlt(jobs: string[]) {
		window.localStorage.setItem("tracked-alt-names", JSON.stringify([
			...JSON.parse(window.localStorage.getItem("tracked-alt-names") || '[]'),
			...jobs
		]));
	}

	getTracked(): string[] {
		return JSON.parse(window.localStorage.getItem('tracked-alt-names') || '[]');
	}

	async override(req: Job[]): Promise<void> {
		await this.fetchJson("/challenge", "POST", {}, {
			jobs: req.map(i => i.alias)
		});
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
	status: JobStatus,
	cn?: string
}

export type JobStatus =
	"Pending" |
	"ChallengePending" |
	"ChallengePassed" |
	{ "ChallengeFailed": { "reason": string } } |
	"Finished" |
	{ "SigningError": { "reason": string } } |
	"Stale";

export interface CertificateRequest {
	subject: string,
	hostname: string[] | string,
	usages: x509.KeyUsageFlags[],
}