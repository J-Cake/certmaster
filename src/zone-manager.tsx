import React from "react";

import {currentContainer} from "./container-picker.js";
import Zone from "./lib/config.js";
import {Archive, ArchiveFileList} from "./lib/archive.js";
import DnsEditor from "./dns-editor-table.js";
import {Awaited} from "./util.js";
import {topLevelModal} from "./modal.js";
import ManageZonesForm from "./manage-zones-form.js";
import roo from "../roo.svg";
import Svg from "./svg.js";

export const currentZone = React.createContext(null as null | Zone);

export default function ZoneManager() {
	const container = React.useContext(currentContainer)!;

	const {modal, notice} = React.useContext(topLevelModal);

	const [zoneName, setZoneName] = React.useState(window.localStorage.getItem('zone') ?? null as null | string);
	const [archive, setArchive] = React.useState(null as null | Archive);
	const [fileList, setFileList] = React.useState(null as null | ArchiveFileList);

	React.useEffect(() => {
		if (zoneName)
			window.localStorage.setItem('zone', zoneName);
	}, [zoneName]);

	const zone = React.useMemo(() =>
			fileList
				?.find(i => i.meta().name == zoneName)
				?.readText()
				?.then(file => new Zone(zoneName!, archive!).parseConfig(file)),
		[zoneName, fileList, archive]);

	const zones = React.useMemo(() => fileList
		?.filter(i => i.meta().name.endsWith('.conf'))
		?.map(i => i.meta().name) ?? [], [fileList]);

	React.useEffect(() => {
		container.archive("/etc/dnsmasq.d/")
			.then(async archive => {
				const zones: ArchiveFileList = archive.listFiles()
					.filter(file => file.meta().name.endsWith('.conf'));

				setArchive(archive);
				setFileList(zones);
				setZoneName(zones.length > 0 ? zones[0].meta().name : null);
			})
	}, [container]);

	const manageZones = React.useCallback(() => modal(<ManageZonesForm
			archive={archive!}
			modal={modal}
			notice={notice}
			container={container}
			openZone={zoneName => setZoneName(zoneName)}
			onChanges={zones => setFileList(zones)}/>),
		[modal, archive, notice, setZoneName, setFileList]);

	const save = React.useCallback(async (zone: Zone) => {
		zone.save(container)
			.then(status => notice(({
				'not-saved': <>
					<h3>{"No changes were saved"}</h3>
					<p>{"Please save your changes manually."}</p>
				</>,
				error: <>
					<h3>{"An error occurred"}</h3>
					<p>{"The changes were not saved."}</p>
				</>,
				saved: <>
					<h3>{"Restart was not possible"}</h3>
					<p>{"The changes have been saved, but the container was not able to be restarted."}</p>
				</>,
				restarted: <>
					<h3>{"Changes saved"}</h3>
					<p>{"All changes were successfully saved."}</p>
				</>,
			})[status]));
	}, [notice]);

	if (!zone)
		return <div id="dns-editor" className="centre-layout padding-v-s gap-s flex-v"
					style={{gridColumn: '1 / -1', gridRow: '1 / -1'}}>
			<h1>{"No zones"}</h1>
			<p>{"You need to create a zone before you can begin adding records."}</p>
			<div style={{color: 'var(--foreground-secondary)'}} className="max-width-xs">
				<Svg img={roo}/>
			</div>

			<button onClick={() => manageZones()} data-icon={"\uf191"}>{"Manage Zones"}</button>
		</div>;
	else
		return <Awaited promise={zone!}>
			{zone => <currentZone.Provider value={zone!}>
				<DnsEditor zone={zone} onChange={zone => save(zone)}>
					<select className="tertiary"
							value={zone!.zoneName}
							onChange={e => setZoneName(e.target.value)}>
						{zones.map(zone => <option value={zone}>
							{zone.slice(0, -5)}
						</option>)}
					</select>

					<button onClick={() => manageZones()}
							data-icon={"\uf191"}
							className="tertiary">{"Manage Zones"}</button>
				</DnsEditor>
			</currentZone.Provider>}
		</Awaited>;
}