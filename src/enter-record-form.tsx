import React from "react";
import {DnsRecord, keyToRecordType} from "./lib/config.js";

export default function RecordForm(props: { record: DnsRecord, onSubmit: (record: DnsRecord) => void }) {
	const [record, setRecord] = React.useState(props.record);

	const submit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
		props.onSubmit(Object.fromEntries(new FormData(e.currentTarget) as any) as DnsRecord)
	}, [props]);

	return <form method="dialog" onSubmit={submit} className="form-grid">
		<div className="form-grid-item">
			<h3>{"Add a record"}</h3>
			<p>{"Please add the desired records below."}</p>
		</div>

		<div className="form-grid-row">
			<label htmlFor="type">{"Record Type"}</label>
			<select id="type" name="type" value={record.type} onChange={e => setRecord({
				...record,
				type: e.currentTarget.value as DnsRecord['type']
			})} required>
				{Object.entries(keyToRecordType).map(([type]) => <option value={type}>{type}</option>)}
			</select>
		</div>

		<div className="form-grid-row">
			<label htmlFor="name">{"Record hostname"}</label>
			<input type="text" id="name" name="name" placeholder="Name" value={record.name} onChange={e => setRecord({
				...record,
				name: e.currentTarget.value,
			})} autoFocus required/>
		</div>

		<div className="form-grid-row">
			<label htmlFor="value">{"Record value"}</label>
			<input type="text" id="value" name="value" placeholder="Record Content" value={record.value}
				   onChange={e => setRecord({
					   ...record,
					   value: e.currentTarget.value,
				   })} required/>
		</div>

		<div className="form-grid-row">
			<label htmlFor="ttl">{"Time to live"}</label>
			<input type="number" min="0" id="ttl" name="ttl" placeholder="TTL" value={record.ttl}
				   onChange={e => setRecord({
					   ...record,
					   ttl: Number(e.currentTarget.value),
				   })} required/>
		</div>

		<div className="flex-h align-maj-end form-grid-item">
			<button type='submit' className="success" data-icon={"\ue5ca"}>{"Add Record"}</button>
		</div>
	</form>;
}