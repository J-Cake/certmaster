import DockerApi, {Container} from "./lib/api.js";
import React from "react";
import useDebouncedEffect from "./lib/debounce.js";
import uri from "urijs";
import {currentContainer} from "./container-picker.js";
import {Awaited} from "./util.js";

export default function ConnectContainerForm(props: {
	setAvailableContainers: (containers: Container[]) => void,
	notice: (e: React.ReactNode) => void
}) {
	const [url, setUrl] = React.useState('');
	const [requiresAuth, setRequiresAuth] = React.useState(false);

	const [msg, setMsg] = React.useState({err: null as null | string, msg: null as null | string});

	const [containers, setContainers] = React.useState([] as Container[]);

	const [selected, setSelected] = React.useState([] as string[]);

	const activeContainer = React.useContext(currentContainer);

	useDebouncedEffect(() => {
		if (!url) return setMsg({err: null, msg: null});

		const api = new DockerApi(uri(url));

		api.listContainers()
			.then(containers => {
				setContainers(containers);
				setMsg({err: null, msg: 'Connection Successful'});
			})
			.catch(err => {
				console.error(err);
				setMsg({err: 'The URL does not seem to point to a Docker Engine API.', msg: null});
			});
	}, [url], 250);

	const submit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
		const data: Container[] = [];

		for (const [key, value] of new FormData(e.currentTarget) as unknown as Iterable<[string, any]>)
			if (key == 'container' && typeof value == 'string')
				data.push(containers.find(i => i.id == value)!);

		props.setAvailableContainers(data);
		props.notice(<>
			<h3 data-icon={"\ue88e"} className='flex-h align-min-centre gap-s'>{"Container list was updated"}</h3>
			<p>{"Please see the updated list of containers in the status bar below."}</p>
		</>);
	}, [props, containers]);

	return <form method="dialog" className="form-grid max-width-l" onSubmit={e => submit(e)}>
		<div className="form-grid-item">
			<h3>{"Connect to a container"}</h3>
			<p>
				{"Please enter the URL of the "}
				<a href="https://docs.docker.com/reference/api/engine/version/v1.51/">{"Docker Engine API"}</a>
				{" TCP/HTTP endpoint. You usually need to explicitly enable this. Alternatively, you may prefer to proxy the UNIX socket via a HTTP reverse proxy."}
			</p>
		</div>

		<div className="form-grid-row" style={{gridRow: '2 / 4', gridColumn: '1 / -1'}}>
			<label htmlFor="url" style={{gridRow: 1, gridColumn: 1}}>{'URL'}</label>

			<div className="button-group" style={{gridRow: 1, gridColumn: 2}}>
				<input type="url" id="url" name="url" placeholder="https://127.0.0.1:2375" required
					   onChange={e => setUrl(e.target.value)} value={url}
					   className={["fill-maj", msg.err ? 'error' : msg.msg ? 'success' : ''].join(' ')}/>
				<button type="button" className="tertiary" onClick={_ => {
				}} data-icon={"\ue5d5"}>{"List Containers"}</button>
			</div>

			<div style={{gridRow: 2, gridColumn: 2}}>
				{msg.err && <div className="error gap-s flex-h align-min-centre" style={{gridColumn: '2'}}
				                 data-icon={"\ue000"}>{msg.err}</div>}
				{msg.msg && <div className="success gap-s flex-h align-min-centre" style={{gridColumn: '2'}}
				                 data-icon={"\ue8dc"}>{msg.msg}</div>}
			</div>
		</div>

		<div className="form-grid-row">
			<label htmlFor="url">{'Requires Authentication'}</label>
			<input className="switch" type="checkbox" id="requires-auth" name="requires-auth"
				   value={requiresAuth ? 'checked' : ''} onChange={e => setRequiresAuth(e.target.checked)}/>
		</div>

		{requiresAuth ? <div className="form-grid-row border-dull border-radius-m padding-v-s padding-h-s gap-s">
			<div className="form-grid-item">
				<blockquote className="warning"
							data-icon={"\ue88e"}>{"This feature is currently under construction."}</blockquote>
				<h4>{"Authentication"}</h4>
				<p>{"You can optionally choose to authenticate against an endpoint via OpenID-Connect to better protect your Docker Engine API."}</p>
			</div>

			<div className="form-grid-row">
				<label htmlFor="token">{'Token URL'}</label>
				<input type="url" id="token" name="token" placeholder="https://127.0.0.1:2375" required/>
			</div>

			<div className="form-grid-row">
				<label htmlFor="client">{'Client ID'}</label>
				<input type="url" id="client" name="client-id" placeholder="Client ID" required/>
			</div>

			<div className="form-grid-item button-group align-maj-end">
				<button type="button" onClick={() => props.notice(<>
					<h3>{"This feature is currently under construction."}</h3>
					<p>
						{"Sorry for the inconvenience. Please check out "}
						<a href="https://github.com/j-cake/dnsmasq-frontend">{"the GitHub Repo"}</a>
						{" for updates."}
					</p>
				</>)}>{"Authenticate"}</button>
			</div>
		</div> : null}

		<div className="form-grid-item border-dull border-radius-m">
			{containers.length > 0 ? <>
				<div className='padding-h-s gap-s'>
					<h4>{"Containers"}</h4>
					<p>{"Select the containers you wish to connect to."}</p>
				</div>
				<table>
					<thead>
					<tr>
						<th style={{width: 'fit-content'}}>
							<button type="button" className="tertiary symbolic"
									data-icon={selected.length < containers.length ? "\ue162" : "\uf74d"}
									onClick={_ => {
										if (selected.length < containers.length)
											setSelected(containers.map(i => i.id));
										else
											setSelected([]);
									}}/>
						</th>
						<th style={{width: 'fit-content'}}>{"Status"}</th>
						<th style={{width: '100%'}}>{"Name"}</th>
						<th>{"DNSmasq"}</th>
					</tr>
					</thead>
					<tbody>
					{containers.map(container => <tr key={container.id}>
						<td>
							<input type="checkbox" id={`container-${container.id}`} name={`container`}
								   value={container.id} checked={selected.includes(container.id)} onChange={e => {
								if (e.currentTarget.checked)
									setSelected([...selected.filter(i => i != container.id), container.id]);

								else
									setSelected(selected.filter(i => i != container.id));
							}}/>
						</td>
						<td>{({
							"created": <span data-icon={'\ue869'}/>,
							"running": <span data-icon={'\ue037'} className="success"/>,
							"paused": <span data-icon={'\ue034'} className="warning"/>,
							"restarting": <span data-icon={'\ue5d5'}/>,
							"exited": <span data-icon={'\ue047'} className="error"/>,
							"removing": <span data-icon={'\ue872'} className="warning"/>,
							"dead": <span data-icon={'\uf89a'} className="error"/>,
						})[container.last_known_state]}
						</td>
						<td>
							{container.name}
							{container.id == activeContainer?.id && <span className='capsule'>{"Current"}</span>}
						</td>
						<td>
							{container.last_known_state == 'running' ? <Awaited promise={container.exec(['pgrep', '-x', 'dnsmasq'])}>
								{_ => <span data-icon={'\ue5ca'} className="success"/>}
							</Awaited> : <span data-icon={'\ue5cd'} className="error"/>}
						</td>
					</tr>)}
					</tbody>
				</table>
			</> : <div className="centre-layout flex-v align-maj-centre align-min-centre">
				<h4>{"No Containers Found"}</h4>
				<p>{"Could not connect to Docker instance."}</p>
			</div>}
		</div>

		<div className="form-grid-item button-group align-maj-end">
			<button type="submit" className="success" data-icon={"\ue5ca"}>{"Connect"}</button>
		</div>
	</form>
}