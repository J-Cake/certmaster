import * as React from "react";
import * as dom from 'react-dom';

export interface ModalProvider {
	modal(body: React.ReactNode): void;

	notice(body: React.ReactNode): void;
}

export const topLevelModal = React.createContext(null as unknown as ModalProvider);

type Portal = ReturnType<typeof dom.createPortal>;

export default function ModalProvider(props: { children: React.ReactNode }) {
	const [modals, setModals] = React.useState<Portal[]>([]);
	const [notices, setNotices] = React.useState<Portal[]>([]);

	return <topLevelModal.Provider value={{
		modal(content: React.ReactNode) {
			setModals(modals => [
				...modals,
				createModal(content, {
					onClose: portal => setModals(modals => modals.filter(m => m !== portal))
				})
			]);
		},
		notice(content: React.ReactNode) {
			setNotices(notices => [
				...notices,
				createNotice(content, {
					onClose: portal => setNotices(notices => notices.filter(m => m !== portal))
				})
			]);
		}
	}}>
		<section id="app">
			{props.children}
		</section>

		<section id="modals">{modals}</section>
		<section id="notifications">{notices}</section>
	</topLevelModal.Provider>
}

export function createModal(content: React.ReactNode, options?: { onClose?: (portal: Portal) => void }): Portal {
	const container = document
		.querySelector('#modals')!
		.appendChild(document.createElement('dialog'));

	const portal = dom.createPortal(<>
		<button className="symbolic tertiary close-btn" onClick={() => container.close()} data-icon={"\ue5cd"}/>
		{content}
	</>, container);

	container.showModal();

	container.addEventListener('close', () => {
		container.remove();
		options?.onClose?.(portal);
	});

	return portal;
}

export function createNotice(content: React.ReactNode, options: { onClose: (portal: Portal) => void }): Portal {
	const container = document
		.querySelector("#notifications")!
		.appendChild(document.createElement('div'));

	container.setAttribute('role', 'alert');
	container.setAttribute('popover', 'popover');

	const Body = () => {
		const autoclose = React.createRef<HTMLDivElement>();

		const autoclose_after = 5000; //ms

		React.useEffect(() => {
			if (!autoclose.current)
				setTimeout(() => container.remove(), autoclose_after);
			else
				autoclose.current
					.animate([{width: '100%'}, {width: '0%'}], {
						duration: autoclose_after,
						easing: 'linear',
						fill: 'forwards',
					})
					.addEventListener('finish', () => container.remove());
		}, []);

		return <>
			<div>{content}</div>
			<button className="symbolic tertiary close-btn" onClick={() => container.remove()}
					data-icon={"\ue5cd"}/>
			<div className="autoclose-progress" ref={autoclose}/>
		</>
	}

	const portal = dom.createPortal(<Body/>, container);
	container.showPopover();

	return portal;
}