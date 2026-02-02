import React from "react";
import {Awaited} from "./util";
import {API} from "./main";
import {Link} from "./router";
import {Job} from "./lib/certmaster";

export interface QueueProps {

}

export default function JobQueue(props: QueueProps) {
	const api = React.useContext(API);
	const [entries, setEntries] = React.useState(50);

	return <Awaited promise={api.getJobs(entries)} key={"job-queue"}>
		{queue => <JobQueueInner jobs={queue} />}
	</Awaited>;
}

function JobQueueInner(props: { jobs: Job[] }) {
	const [selected, setSelected] = React.useState<Record<string, boolean>>({});

	const all = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		const every = props.jobs.every(i => selected[i.clientId]);
		const some = props.jobs.some(i => selected[i.clientId]);

		if (all.current) {
			all.current.indeterminate = some && !every;
			all.current.checked = every;
		}
	}, [selected]);

	React.useEffect(() => {
		let listener: (this: HTMLInputElement, e: Event) => void;

		console.log('Attaching change listener to', all.current);

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
					<td>{job.clientId}</td>
					<td>{job.alias}</td>
					<td>{typeof job.status == 'string' ? job.status : Object.keys(job.status)[0]}</td>
					<td>
						<div className="button-group">
							<button className="success symbolic" data-icon={"\ue8e8"} title={"Override challenge"}/>
							<button className="danger symbolic" data-icon={"\ue5cd"} title={"Decline challenge"}/>
							<button className="warning symbolic" data-icon={"\ue8f5"} title={"Ignore request"}/>
							<Link to={`/inspect/${encodeURIComponent(job.alias)}`} className="button symbolic"
								  data-icon={"\ue5cc"} title={"View certificate request"}/>
						</div>
					</td>
				</tr>)}
			</tbody>
		</table>
	</section>
}