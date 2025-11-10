import React from 'react';
import {API} from "./main";
import {Awaited} from "./util";

export default function StatusBar(props: {}) {
	const api = React.useContext(API);

	return <div id="status">
		<div id="status-left"></div>
		<div id="status-centre"></div>
		<div id="status-right">
			<a href="#">
				<Awaited promise={api.version()}>
					{version => `v${version.version}`}
				</Awaited>
			</a>
		</div>
	</div>
}