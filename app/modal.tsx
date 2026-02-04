import * as React from "react";
import * as dom from 'react-dom';
import {context} from "esbuild";

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

export type CloseFn = () => void;

export interface ModalProvider {
	modal(body: React.ReactNode): CloseFn;

	notice(body: React.ReactNode): void;

	context(items: (MenuItem | null)[], pos: DOMRect): void;
	context(items: (MenuItem | null)[], e: MouseEvent): void;
	context(items: (MenuItem | null)[], opt: DOMRect | MouseEvent): void;
}

export const topLevelModal = React.createContext(null as unknown as ModalProvider);

type Portal = ReturnType<typeof dom.createPortal>;

export default function ModalProvider(props: { children: React.ReactNode }) {
	const [modals, setModals] = React.useState<Portal[]>([]);
	const [notices, setNotices] = React.useState<Portal[]>([]);
	const [context, setContext] = React.useState<Portal[]>([]);

	return <topLevelModal.Provider value={{
		modal(content: React.ReactNode) {
			const {portal, close} = createModal(content, {
				onClose: portal => setModals(modals => modals.filter(m => m !== portal))
			});

			setModals(modals => [
				...modals,
				portal
			]);

			return close;
		},
		notice(content: React.ReactNode) {
			setNotices(notices => [
				...notices,
				createNotice(content, {
					onClose: portal => setNotices(notices => notices.filter(m => m !== portal))
				})
			]);
		},
		context(items: MenuItem[], pos: MouseEvent | DOMRect) {
			setContext(contexts => [
				...contexts,
				createContext(items, {
					pos,
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

export function createModal(content: React.ReactNode, options?: { onClose?: (portal: Portal) => void }): { portal: Portal, close: CloseFn } {
	const container = document
		.querySelector('#modals')!
		.appendChild(document.createElement('dialog'));

	const portal = dom.createPortal(<>
		<button className="symbolic tertiary close-btn" onClick={() => container.close()} data-icon={"\ue5cd"}/>
		{content}
	</>, container);

	container.showModal();

	const close: CloseFn = () => {
		container.remove();
		options?.onClose?.(portal);
	}

	container.addEventListener('close', () => close());

	return {portal, close};
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

export function createContext(content: MenuItem[], options: { onClose: (portal: Portal) => void, pos: DOMRect | MouseEvent }): Portal {
	const container = document
		.querySelector("#context")!
		.appendChild(document.createElement('dialog'));

	container.setAttribute('role', 'menu');
	container.classList.add("context-menu");

	if (options.pos instanceof MouseEvent)
		container.style.transform = `translate(${options.pos.pageX}px, ${options.pos.pageY}px)`;

	else if (options.pos instanceof DOMRect) {
		container.style.transform = `translate(${options.pos.left}px, ${options.pos.top + options.pos.height}px)`;
		container.style.borderTopLeftRadius = '0';
	}

	container.addEventListener('mouseup', e => {
		if (e.target == container) container.close();
	});

	container.addEventListener('close', () => {
		container.remove();
		options.onClose(portal);
	});

	container.addEventListener("keydown", e => {
		if (e.key == 'ArrowDown' || e.key == 'ArrowUp' || e.key == 'ArrowLeft' || e.key == 'ArrowRight' || e.key == 'Enter' || e.key == 'Escape') {
			e.preventDefault();

			if (e.key == 'Escape') {
				container.close();
				return;
			}

			const items = Array.from(container.querySelectorAll("[tabindex]"));

			if (e.key == 'ArrowUp' || e.key == 'ArrowDown') {

				const index = document.activeElement ? items.indexOf(document.activeElement) : 0;
				const next = items[(index + (e.key == 'ArrowUp' ? -1 : 1) + items.length) % items.length];

				if (next instanceof HTMLDivElement) next.focus();
			} else if (e.key == 'Enter') {
				if (document.activeElement && document.activeElement instanceof HTMLDivElement)
					document.activeElement.click();
			}
		}
	});

	const MenuLeft = (props: { left?: MenuAction['left'] }) => ({
		string: <span className={"context-menu-item-left"} data-icon={props.left as string} />,
		boolean: <span className={"context-menu-item-left"} data-icon={props.left as boolean ? "\ue834" : "\ue835"} />,
		object: <span className={"context-menu-item-left"} data-icon={(props.left as RadioBox).checked ? "\ue837" : "\ue836"} />
	})[typeof props.left as 'string' | 'boolean' | 'object'] ?? <></>;
	const MenuRight = (props: { right?: MenuAction['right'] }) => ({
		string: <span className={"context-menu-item-right"} data-icon={props.right as string}/>,
		object: <></> // submenu
	})[typeof props.right as 'string' | 'object'] ?? <></>;

	const Body = () => <>
		{content.map(i =>
			typeof i == 'string' ?
				<div className="context-menu-header"><h6>{i as string}</h6></div> :
				i ? <div className="context-menu-item button tertiary" tabIndex={0} onClick={() => {
					i.onActivate?.();
					container.close();
				}}>
					<MenuLeft left={i.left}/>
					<span className={"context-menu-item-label"}>{i.label}</span>
					<MenuRight right={i.right}/>
				</div> : <div className="context-menu-separator">
					<hr/>
				</div>)}
	</>;

	const portal = dom.createPortal(<Body/>, container);
	container.showModal();

	return portal;
}