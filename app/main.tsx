import React from 'react';
import DOM from 'react-dom/client';

import DnsEditor from "./dns-editor-table.js";

import '../css/main.css';
import ContainerPicker from "./container-picker.js";
import ModalProvider from "./modal.js";
import ZoneManager from "./zone-manager.js";

export const root = DOM.createRoot(document.querySelector('#root')!);

root.render(<>
	<ModalProvider>
		<ContainerPicker>
			<div id="main">
				<ZoneManager />
			</div>
		</ContainerPicker>
	</ModalProvider>
</>);

