import React from "react";
import {Awaited} from "./util";
import {API} from "./main";
import {Link} from "./router";

export interface QueueProps {

}

export default function JobQueue(props: QueueProps) {
	const api = React.useContext(API);
	const [entries, setEntries] = React.useState(50);

	return <Awaited promise={api.getJobs(entries)}>
		{queue => <section id="queue">
			<table>
				<thead>
					<tr>
						<td>{"ID"}</td>
						<td>{"Alias"}</td>
						<td>{"Status"}</td>
						<td>{"Action"}</td>
					</tr>
				</thead>
				<tbody>
					{queue.map(job => <tr key={job.clientId}>
						<td>{job.clientId}</td>
						<td>{job.alias}</td>
						<td>{typeof job.status == 'string' ? job.status : Object.keys(job.status)[0]}</td>
						<td>
							<div className="button-group">
								<button className="success symbolic" data-icon={"\ue5ca"} />
								<button className="danger symbolic" data-icon={"\ue5cd"} />
								<button className="warning symbolic" data-icon={"\ue153"} />
								<Link to={`/inspect/${encodeURIComponent(job.alias)}`} className="button symbolic" data-icon={"\ue5cc"} />
							</div>
						</td>
					</tr>)}
				</tbody>
			</table>
		</section>}
	</Awaited>;
}