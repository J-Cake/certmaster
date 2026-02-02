import * as React from "react";
import * as dom from 'react-dom';

export type MenuItem = MenuAction | null | string;

export interface MenuAction {
	label: string,
	left?: Icon | Checkbox | RadioBox,
	right?: Shortcut | Submenu,
	onActivate?: () => void
}

export type Icon = string;
export type Checkbox = boolean;
export type RadioBox = { name: string, checked: boolean };
export type Shortcut = string;
export type Submenu = MenuItem[];

export interface ModalProvider {
	modal(body: React.ReactNode): void;

	notice(body: React.ReactNode): void;

	context(items: (MenuItem | null)[]): void;
}

export const topLevelModal = React.createContext(null as unknown as ModalProvider);

type Portal = ReturnType<typeof dom.createPortal>;

export default function ModalProvider(props: { children: React.ReactNode }) {
	const [modals, setModals] = React.useState<Portal[]>([]);
	const [notices, setNotices] = React.useState<Portal[]>([]);
	const [context, setContext] = React.useState<Portal[]>([]);

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
		},
		context(items: MenuItem[]) {
			setContext(contexts => [
				...contexts,
				createContext(items, {
					onClose: portal => setContext(contexts => contexts.filter(m => m !== portal))
				})
			])
		}
	}}>
		<section id="app">
			{props.children}
		</section>

		<section id="modals">{modals}</section>
		<section id="notifications">{notices}</section>
		<section id="context">{context}</section>
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

export function createContext(content: MenuItem[], options: { onClose: (portal: Portal) => void }): Portal {
	const container = document
		.querySelector("#context")!
		.appendChild(document.createElement('ul'));

	container.setAttribute('role', 'menu');
	container.setAttribute('popover', 'popover');
	container.classList.add("context-menu");

	const MenuLeft = (props: { left?: MenuAction['left'] }) => ({
		string: <span className={"context-menu-item-left"} data-icon={props.left as string}/>,
		boolean: <input className={"context-menu-item-left"} type="checkbox" checked={props.left as boolean}/>,
		object: <input className={"context-menu-item-left"} type="radio" name={(props.left as RadioBox).name}
					   checked={(props.left as RadioBox).checked}/>
	})[typeof props.left as 'string' | 'boolean' | 'object'] ?? <></>;
	const MenuRight = (props: { right?: MenuAction['right'] }) => ({
		string: <span className={"context-menu-item-right"} data-icon={props.right as string}/>,
		object: <></> // submenu
	})[typeof props.right as 'string' | 'object'] ?? <></>;

	const Body = () => <>
		{content.map(i =>
			typeof i == 'string' ?
				<li className="context-menu-header"><h6>{i as string}</h6></li> :
				i ? <li className="context-menu-item button tertiary">
					<MenuLeft left={i.left}/>
					<span className={"context-menu-item-label"}>{i.label}</span>
					<MenuRight right={i.right}/>
				</li> : <li className="context-menu-separator">
					<hr/>
				</li>)}
	</>;

	const portal = dom.createPortal(<Body/>, container);
	container.showPopover();

	return portal;

}