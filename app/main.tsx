import React from 'react';
import DOM from 'react-dom/client';

import '../css/main.css';
import ContainerPicker from "./container-picker.js";
import ModalProvider from "./modal.js";

export const root = DOM.createRoot(document.querySelector('#root')!);

root.render(<>
	<ModalProvider>
		<ContainerPicker>
			<div id="main">

			</div>
		</ContainerPicker>
	</ModalProvider>
</>);

