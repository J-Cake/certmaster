import React from "react";
import DockerApi, {Container} from "./lib/api.js";
import {topLevelModal} from "./modal.js";
import ConnectContainerForm from "./connect-form.js";
import uri from "urijs";

export const currentContainer = React.createContext<Container | null>(null);

interface PersistentContainer {
	id: string;
	name: string;
	url: string
}

export async function loadContainers(loaded: PersistentContainer[]): Promise<Container[]> {
	const endpoints = new Map<string, {
		api: DockerApi,
		containers: PersistentContainer[]
	}>();

	for (const container of loaded) {
		const endpoint = uri(container.url);

		if (!endpoints.has(endpoint.toString()))
			endpoints.set(endpoint.toString(), {
				api: new DockerApi(endpoint),
				containers: [container]
			});
		else
			endpoints.get(endpoint.toString())!
				.containers
				.push(container);
	}

	return Promise.all(endpoints.values()
		.map(async ({api, containers}) => {
			const allContainersOnHost = await api.listContainers();

			return containers
				.map(i => allContainersOnHost.find(i => i.id == i.id)!)
		}))
		.then(containers => containers.flat());
}

export default function ContainerPicker(props: { children: React.ReactNode }) {
	const loaded: PersistentContainer[] = JSON.parse(window.localStorage
		.getItem('containers') ?? '[]');

	const [containers, setContainers] = React.useState(null as null | Container[]);
	const [container, setContainer] = React.useState(null as null | Container);

	const {modal, notice} = React.useContext(topLevelModal);

	React.useEffect(() => {
		if (loaded.length <= 0) return;

		loadContainers(loaded)
			.then(containers => {
				const switchToContainer = window.localStorage.getItem('container');
				const container = containers.find(i => i.id == switchToContainer) ?? containers[0];

				setContainer(container);
				setContainers(containers);
			});
	}, []);

	React.useEffect(() => {
		window.localStorage.setItem('containers', JSON.stringify(containers?.map(i => ({
			id: i.id,
			name: i.name,
			url: i.apiUri.toString()
		})) ?? []));

		if (container?.id)
			window.localStorage.setItem('container', container.id);
	}, [containers, container]);

	const connect = React.useCallback(() => {
		const setAvailable = (c: Container[]) => {
			setContainers([
				...containers ?? [],
				...c.filter(i => (containers ?? []).find(j => j.id == i.id) == undefined)]);

			setContainer(c[0]);
		};

		modal(<ConnectContainerForm
			notice={notice}
			setAvailableContainers={c => setAvailable(c)}/>)
	}, [modal, notice, containers, setContainer]);

	const [containerState, setContainerState] = React.useState('unknown');

	React.useEffect(() => {
		if (!container) return;

		container.inspect()
			.then(i => setContainerState(i.State.Status as string));

		const abort = new AbortController();

		(async () => {
			while (!abort.signal.aborted)
				try {
					for await (const event of container.monitor({
						type: 'container',
						signal: abort.signal
					})) container.inspect()
						.then(i => setContainerState(i.State.Status as string));
				} catch (e) {}
		})();

		return () => abort.abort();
	}, [container]);

	if (containers && container)
		return <currentContainer.Provider value={container}>
			<div id="container" className="flex-h align-min-centre padding-v-s gap-s">
				{({
					"created": <span data-icon={'\ue869'}/>,
					"running": <span data-icon={'\ue037'} className="success"/>,
					"paused": <span data-icon={'\ue034'} className="warning"/>,
					"restarting": <span data-icon={'\ue5d5'}/>,
					"exited": <span data-icon={'\ue047'} className="error"/>,
					"removing": <span data-icon={'\ue872'} className="warning"/>,
					"dead": <span data-icon={'\uf89a'} className="error"/>,
				})[containerState] ?? <span data-icon={'\ueb8b'}/>}

				<label htmlFor="container-picker">{"Container"}</label>

				<div className="button-group">
					<select id="container-picker"
							onChange={e => setContainer(containers.find(i => i.id == e.target.value)!)}>
						{containers.map(container => <option value={container.id}>{container.name}</option>)}
					</select>

					<button className="secondary" data-icon={"\ue30c"} onClick={() => connect()}>
						{"Add connection"}
					</button>

					{({
						'running': <button className="warning" data-icon={"\ue5d5"}
										   onClick={() => container?.restart()}>
							{"Restart container"}
						</button>,
						'paused': <button className="warning" data-icon={"\ue034"}
										  onClick={() => container?.fetchVoid("/unpause", "POST")}>
							{"Resume container"}
						</button>,
						'exited': <button className="success" data-icon={"\ue037"} onClick={() => container?.restart()}>
							{"Start container"}
						</button>
					})[containerState]}

				</div>
			</div>

			{props.children}
		</currentContainer.Provider>
	else
		return <div className="centre-layout padding-v-s gap-s flex-v"
					style={{gridColumn: '1 / -1', gridRow: '1 / -1'}}>
			<h1>{"No containers found"}</h1>
			<p>{"Please connect to a container to continue."}</p>

			<button className="primary" data-icon={"\ue30c"} onClick={() => connect()}>
				{"Connect to a container"}
			</button>
		</div>;
}

