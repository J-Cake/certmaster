import React from "react";
import {Awaited} from "./util";
import {API} from "./main";
import {Link} from "./router";
import {Job} from "./lib/certmaster";
import ModalProvider, {topLevelModal} from "./modal";
import NewCertificateModal from "./new-certificate";

export interface QueueProps {

}

export default function JobQueue(props: QueueProps) {
	const api = React.useContext(API);
	const [entries, setEntries] = React.useState(50);

	const [numSelected, setNumSelected] = React.useState(0);

	const modal = React.useContext(topLevelModal);
	const newCertificate = React.useCallback(() => {
		modal.modal(<NewCertificateModal />)
	}, [modal]);

	const moreContext = React.useCallback((e: React.MouseEvent) => {
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
			left: false
		}, {
			label: "Alt Name",
			left: false
		}, {
			label: "Actions",
			left: true
		}]);
	}, [modal]);

	return <section id="job-queue">
		<div className="button-group align-min-centre">
			{numSelected > 0 ? <>
				<button className="success" data-icon={"\ue8e8"} title={"Override challenge"}>{"Override"}</button>
				<button className="danger" data-icon={"\ue5cd"} title={"Decline challenge"}>{"Decline"}</button>
				<button className="warning" data-icon={"\ue8f5"} title={"Ignore request"}>{"Ignore"}</button>
			</> : null}

			<button className="primary" data-icon={"\ue145"} onClick={newCertificate}>{"New Certificate"}</button>
			<button className="secondary" data-icon-after={"\ue5c5"} onClick={e => moreContext(e)}>{"More"}</button>
		</div>

		<Awaited promise={api.getJobs(entries)} key={"job-queue"}>
			{queue => <JobQueueInner jobs={queue} onSelectionChange={num => setNumSelected(num)} />}
		</Awaited>
	</section>;
}

function JobQueueInner(props: { jobs: Job[], onSelectionChange: (selected: number) => void }) {
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

	return <section id="queue">
		<table>
			<thead>
			<tr>
				<td>
					<input type={"checkbox"} key={"select-all"} ref={all} />
				</td>
				<td>{"CN"}</td>
				<td>{"ID"}</td>
				<td>{"Alias"}</td>
				<td>{"Status"}</td>
				<td>{"Action"}</td>
			</tr>
			</thead>
			<tbody>
				{props.jobs.map(job => <tr key={job.clientId}>
					<td>
						<input type={"checkbox"} checked={selected[job.clientId]} onChange={e => setSelected(prev => ({ ...prev, [job.clientId]: e.target.checked }))}/>
					</td>
					<td>
						<Awaited promise={api.getJobById(job.clientId)} alt={<span>{"No data"}</span>}>
							{ok => <span>{"No data"}</span>}
						</Awaited>
					</td>
					<td>{job.clientId}</td>
					<td>{job.alias}</td>
					<td>{typeof job.status == 'string' ? job.status : Object.keys(job.status)[0]}</td>
					<td>
						<div className="button-group">
							<button className="success symbolic" data-icon={"\ue8e8"} title={"Override challenge"}/>
							<button className="danger symbolic" data-icon={"\ue5cd"} title={"Decline challenge"}/>
							<button className="warning symbolic" data-icon={"\ue8f5"} title={"Ignore request"} />
							<Link to={`/inspect/${encodeURIComponent(job.alias)}`} className="button symbolic"
								  data-icon={"\ue5cc"} title={"View certificate request"}/>
						</div>
					</td>
				</tr>)}
			</tbody>
		</table>
	</section>
}