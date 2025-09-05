import {Archive} from "./archive.js";
import {Container} from "./api.js";

export interface DnsRecord {
	type: 'A' | 'AAAA' | 'CNAME' | 'PTR' | 'MX' | 'TXT' | 'SRV' | 'NAPTR' // | 'NS',
	name: string,
	value: string,
	ttl: number,
}

export const keyToRecordType: {
	[Type in DnsRecord['type']]: [string, RegExp]
} = {
	A: ['address', /address=\/(?<name>[^/]+)\/(?<value>\d{1,3}(?:\.\d{1,3}){3})/i],
	AAAA: ['address', /address=\/(?<name>[^/]+)\/(?<value>(?:[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){0,7}|::)(?:\/\d{1,3})?)/i],
	CNAME: ['cname', /cname=(?<name>[^/]+),(?<value>[^/]+)/i],
	MX: ['mx-host', /mx-host=(?<name>[^/]+),(?<value>[^/]+),(?<prio>\d+)/i],
	TXT: ['txt-record', /txt-record=(?<name>[^/]+),"(?<value>[^$]+)"/i],
	SRV: ['srv-host', /srv-host=(?<name>[^/]+),(?<value>[^/]+),(?<port>\d+)(,(?<prio>\d+)(,(?<weight>\d+)?))?/i],
	PTR: ['ptr-record', /ptr-record=(?<value>[^,]+),(?<name>[^,]+)/i],
	NAPTR: ['naptr-record', /naptr-record=(?<name>[^,]+),(?<order>\d+),(?<preference>\d+),(?<flags>[^,]*),(?<service>[^,]*),(?<regexp>[^,]*),(?<replacement>[^,]*)/i],
};

const replace = (k: Record<string, any>, str: string) =>
	Object.entries(k)
		.reduce((a, [key, value]) => a.replaceAll(`{${key}}`, value), str)

const recordFormat: {
	[K in DnsRecord['type']]: (record: DnsRecord) => string
} = {
	A: record => replace(record, "address=/{name}/{value}"),
	AAAA: record => replace(record, "address=/{name}/{value}"),
	CNAME: record => replace(record, "cname={name},{value}"),
	PTR: record => replace(record, "ptr-record={name},{value}"),
	MX: record => replace(record, "mx-host={name},{value},{prio}"),
	TXT: record => replace(record, "txt-record={name},\"{value}\""),
	SRV: record => replace(record, "srv-host={name},{value},{port},{prio},{weight}"),
	NAPTR: record => replace(record, "naptr-record={name},{order},{preference},{flags},{service},{regexp},{replacement}"),
};

export default class Zone {
	#records: DnsRecord[] = [];
	#other_records: string[] = [];

	#onChange: (() => void)[] = [];

	constructor(public readonly zoneName: string, private archive: Archive) {

	}

	onChange(handler: () => void): Zone {
		this.#onChange.push(handler);
		return this;
	}

	get records() {
		return this.#records;
	}

	get other_records() {
		return this.#other_records;
	}

	addRecord(record: DnsRecord) {
		this.#records.push(record);
		this.notifyChange();
	}

	addOtherRecord(record: string) {
		this.#other_records.push(record);
		this.notifyChange();
	}

	updateRecord(old: DnsRecord, record: DnsRecord) {
		this.#records = this.#records.map(r => r === old ? record : r);
		this.notifyChange();
	}

	updateOtherRecord(old: string, record: string) {
		this.#other_records = this.#other_records.map(r => r === old ? record : r);
		this.notifyChange();
	}

	removeRecord(record: DnsRecord) {
		this.#records = this.#records.filter(r => r !== record);
		this.notifyChange();
	}

	removeOtherRecord(record: string) {
		this.#other_records = this.#other_records.filter(r => r !== record);
		this.notifyChange();
	}

	notifyChange() {
		this.#onChange.forEach(handler => handler());
	}

	async save(container: Container) {
		let status: 'not-saved' | 'written' | 'error' | 'saved' | 'restarted' = 'not-saved'

		await this.archive
			.writeText(this.zoneName, this.serialise())
			.then(_ => status = 'written')
			.catch(_ => status = 'error');

		await container.saveArchive("/etc/dnsmasq.d/", this.archive)
			.then(_ => status == 'saved')
			.catch(_ => status == 'error');

		if (container.last_known_state == 'running')
			await container.signal('SIGHUP')
				.then(_ => status = 'restarted')
				.catch(e => status = 'error');

		return status;
	}

	parseConfig(config: string): Zone {
		const lines = config.split('\n');

		const records: DnsRecord[] = [];
		const other_records: string[] = [];

		for (const line of lines) {
			if (line.trim().startsWith('#'))
				other_records.push(line);
			else {
				const record = this.parseRecord(line);

				if (record)
					records.push(record);
				else
					other_records.push(line);
			}
		}

		this.#records = records;
		this.#other_records = other_records;

		return this;
	}

	parseRecord(line: string): DnsRecord | null {
		return Object
			.entries(keyToRecordType)
			.filter(([_, value]) => line.trim().toLowerCase().startsWith(value[0]))
			.map(([record, [_, regex]]) => {
				const match = regex.exec(line.trim());

				if (match && match.groups)
					return {
						type: record as DnsRecord['type'],
						ttl: 0,
						...match.groups,
					} as DnsRecord;
				else
					return null;
			})
			.filter(i => !!i)[0] ?? null
	}

	serialise(): string {
		const lines = this.other_records
			.map(line => line.trim())
			.filter(line => line.length > 0);

		for (const record of this.records)
			lines.push(recordFormat[record.type](record).trim());

		return lines
			.concat('')
			.join('\n');
	}
}