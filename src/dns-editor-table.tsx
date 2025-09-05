import React from "react";
import {topLevelModal} from "./modal.js";
import RecordForm from "./enter-record-form.js";
import Zone, {DnsRecord} from "./lib/config.js";
import Svg from "./svg.js";

import roo from "../roo.svg";

export default function DnsEditor(props: { children: React.ReactNode[], zone: Zone, onChange?: (zone: Zone) => void }) {
	const {modal} = React.useContext(topLevelModal);

	React.useEffect(() => void props.zone?.onChange(() => props.onChange?.(props.zone)), [props.zone]);

	const addRecord = React.useCallback(async () => {
		const record = await new Promise<DnsRecord>(ok =>
			modal(<RecordForm record={{ttl: 3600, value: '', name: '', type: 'A'}} onSubmit={record => ok(record)}/>));

		props.zone?.addRecord(record);
	}, [modal, props.zone]);

	const editRecord = React.useCallback(async (record: DnsRecord) => {
		const newRecord = await new Promise<DnsRecord>(ok =>
			modal(<RecordForm record={record} onSubmit={record => ok(record)}/>));

		props.zone?.updateRecord(record, newRecord);
	}, [modal, props.zone]);

	const deleteRecord = React.useCallback(async (record: DnsRecord) => {
		props.zone?.removeRecord(record);
	}, [props.zone]);

	return <div className="flex-v align-min-stretch padding-v-s padding-h-m" id="dns-editor">
		<div className="flex-h align-maj-end align-min-centre">
			<h1 className="fill-maj">{"DNS Record Editor"}</h1>

			<div className="button-group">
				{props.children}
				<button className="primary" onClick={() => addRecord()} data-icon={"\uf0c7"}>{"Add Record"}</button>
			</div>
		</div>

		{props.zone.records.length > 0 ? <table>
			<thead>
			<tr>
				<th>{"Record Type"}</th>
				<th style={{width: '50%', resize: 'horizontal'}}>{"Name"}</th>
				<th style={{width: '50%'}}>{"Value"}</th>
				<th>{"TTL"}</th>
				<th>{"Actions"}</th>
			</tr>
			</thead>
			<tbody>
			{props.zone.records.map((record, a) => <tr
				key={`record-${a}-${record.name}-${record.type}-${record.value}-${record.ttl}`}>
				<td>{record.type}</td>
				<td>{record.name}</td>
				<td>{record.value}</td>
				<td>{record.ttl}</td>
				<td className="flex-h align-maj-end button-group">
					<button className="warning symbolic" onClick={() => editRecord(record)} data-icon={"\ue254"}/>
					<button className="danger symbolic" onClick={() => deleteRecord(record)} data-icon={"\ue872"}/>
				</td>
			</tr>)}
			</tbody>
		</table> : <div className="centre-layout fill-maj flex-v">
			<h1>{"No records yet"}</h1>
			<p>{"Use the 'Add Record' button to begin configuring DNSMasq."}</p>
			<div style={{color: 'var(--foreground-secondary)'}} className="max-width-xs">
				<Svg img={roo}/>
			</div>
		</div>}
	</div>;
}