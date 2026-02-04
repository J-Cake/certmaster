import React from "react";
import {Awaited} from "./util";
import {API} from "./main";
import {Link, RouterView} from "./router";
import {Job} from "./lib/certmaster";
import {topLevelModal} from "./modal";
import NewCertificateModal from "./new-certificate";
import {Status} from "./certificate";

export interface QueueProps {

}

interface Cols {
	'client_id': boolean,
	'alt_name': boolean,
	'actions': boolean
}

export default function JobQueue(props: QueueProps) {
	const api = React.useContext(API);
	const [entries, setEntries] = React.useState(50);

	const [numSelected, setNumSelected] = React.useState(0);
	const [queue, setQueue] = React.useState(api.getItems(entries));

	const modal = React.useContext(topLevelModal);
	const newCertificate = React.useCallback(() => {
		const close = modal.modal(<NewCertificateModal close={() => {
			close();
			setQueue(api.getItems(entries))
		}}/>)
	}, [modal, setQueue, api, entries]);

	const [cols, setCols] = React.useState<Cols>({
		'client_id': false,
		'alt_name': false,
		'actions': true
	});

	React.useEffect(() => {
		const preference = window.localStorage.getItem('col-preference');

		if (preference)
			setCols(JSON.parse(preference));
	}, []);

	React.useEffect(() => window.localStorage.setItem("col-preference", JSON.stringify(cols)), [cols]);

	const moreContext = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
		modal.context([{
			label: "Override",
			left: "\ue8e8"
		}, {
			label: "Decline",
			left: "\ue5cd"
		}, {
			label: "Ignore",
			left: "\ue8f5"
		}, "Show Columns", {
			label: "Client ID",
			left: cols.client_id,
			onActivate: () => setCols(cols => ({...cols, client_id: !cols.client_id}))
		}, {
			label: "Alt Name",
			left: cols.alt_name,
			onActivate: () => setCols(cols => ({...cols, alt_name: !cols.alt_name}))
		}, {
			label: "Actions",
			left: cols.actions,
			onActivate: () => setCols(cols => ({...cols, actions: !cols.actions}))
		}], e.currentTarget.getBoundingClientRect());
	}, [modal, cols.client_id, cols.alt_name, cols.actions, setCols]);

	return <section id="job-queue">
		<div className="button-group align-min-centre">
			<button className="primary" data-icon={"\ue145"} onClick={newCertificate}>{"New Certificate"}</button>
			<button className="secondary" data-icon={"\ue8b8"} data-icon-after={"\ue5c5"}
					onClick={e => moreContext(e)}>{"More"}</button>
		</div>

		<Awaited promise={queue} key={"job-queue"}>
			{queue => <JobQueueInner jobs={queue} onSelectionChange={num => setNumSelected(num)} cols={cols}/>}
		</Awaited>
	</section>;
}

interface JobQueueInnerParams {
	jobs: Job[];
	onSelectionChange: (selected: number) => void;
	cols: Cols
}

function JobQueueInner(props: JobQueueInnerParams) {
	const [selected, setSelected] = React.useState<Record<string, boolean>>({});
	const api = React.useContext(API);

	const all = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		const every = props.jobs.every(i => selected[i.clientId]);
		const some = props.jobs.some(i => selected[i.clientId]);

		if (all.current) {
			all.current.indeterminate = some && !every;
			all.current.checked = every;
		}

		props.onSelectionChange(Object.values(selected).filter(i => i).length);
	}, [selected]);

	React.useEffect(() => {
		let listener: (this: HTMLInputElement, e: Event) => void;

		if (all.current)
			all.current.addEventListener('change', listener = function (this: HTMLInputElement, e: Event) {
				setSelected(Object.fromEntries(props.jobs.map(i => [i.clientId, this.checked])));
			});

		return () => all.current?.removeEventListener('change', listener);
	}, [all]);

	const setSelection = React.useCallback((id: string, state: boolean) => {
		setSelected(prev => ({...prev, [id]: state}));
	}, [setSelected]);

	const enterIsClick = React.useCallback((e: React.KeyboardEvent<HTMLElement>) => {
		if (e.key == "Enter" || e.key == "Space")
			return e.currentTarget.click();

		// else if (e.key == "ArrowUp" || e.key == "ArrowDown")

	}, []);

	return <section id="queue">
		<table className="grid-table">
			<thead className="grid-table-thead">
				<tr>
					<th className="grid-table-cell"><input type={"checkbox"} key={"select-all"} ref={all}/></th>
					<th className="grid-table-cell">{"CN"}</th>
					{props.cols.client_id && <th className="grid-table-cell">{"ID"}</th>}
					{props.cols.alt_name && <th className="grid-table-cell">{"Alias"}</th>}
					<th className="grid-table-cell">{"Status"}</th>
					{props.cols.actions && <th className="grid-table-cell">{"Action"}</th>}
				</tr>
			</thead>
			<tbody className="grid-table-tbody">
			{props.jobs.map(job =>
				<tr className="job-queue-item grid-table-row" key={job.clientId}  tabIndex={0} onClick={() => setSelection(job.clientId, !selected[job.clientId])} onKeyDown={e => enterIsClick(e)}>
					<td className="grid-table-cell"><input tabIndex={-1} type={"checkbox"} checked={selected[job.clientId]} onChange={e => setSelection(job.clientId, e.target.checked)}/></td>
					<td className="grid-table-cell">{job.cn}</td>
					{props.cols.client_id && <td className="grid-table-cell">{job.clientId}</td>}
					{props.cols.alt_name && <td className="grid-table-cell">{job.alias}</td>}
					<td className="grid-table-cell"><Status status={job.status as keyof Job['status']}/></td>
					{props.cols.actions && <td className="grid-table-cell">
						<div className="button-group" onClick={e => (e.preventDefault(), e.stopPropagation())}>
							<button className="success symbolic" data-icon={"\ue8e8"} title={"Override challenge"}/>
							<button className="danger symbolic" data-icon={"\ue5cd"} title={"Decline challenge"}/>
							<button className="warning symbolic" data-icon={"\ue8f5"} title={"Ignore request"}/>
							<Link to={`/inspect/${encodeURIComponent(job.alias)}`} className="button symbolic"
								  data-icon={"\ue5cc"} title={"View certificate request"}/>
						</div>
					</td>}
				</tr>)}
			</tbody>
		</table>
	</section>
}