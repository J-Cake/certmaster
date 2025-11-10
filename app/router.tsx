import React from 'react';
import URI from "urijs";

// import {config} from "./main.js";

type RouterContextType = {
	url: URL;
	navigate: (to: string) => void;
	page: React.ReactNode;
};

const RouterContext = React.createContext<RouterContextType | null>(null);

export type RouterConfig = {
	[Path in string]: (props: { path: Path, match: URLPatternResult }) => React.ReactNode;
}

export default function Router(props: { config: RouterConfig, children?: React.ReactNode }) {
	const [url, setUrl] = React.useState(new URL(window.location.href));
	const base = new URI(window.location.toString()).path("/").toString();

	React.useEffect(() => {
		let handler: (e: PopStateEvent) => void;

		window.addEventListener('popstate', handler = e => {
			e.preventDefault();
			setUrl(new URL(window.location.href));
		});

		return () => window.removeEventListener('popstate', handler);
	});

	const navigate = React.useCallback((to: string) => {
		window.history.pushState(null, "", to);
		setUrl(new URL(window.location.href));
	}, [setUrl]);

	const page = React.useMemo(() => {
		for (const [path, component] of Object.entries(props.config)) {
			const match = new URLPattern(path, base).exec(url);

			if (match)
				return <>
					{component({path, match})}
				</>;
		}

		return null;
	}, [url, props.config]);

	return <RouterContext.Provider value={{url, navigate, page}}>
		{props.children}
	</RouterContext.Provider>;
}

export function Link(props: { to: string, children?: React.ReactNode } & Partial<React.JSX.IntrinsicElements['a']>) {
	const ctx = React.useContext(RouterContext);
	if (!ctx) throw new Error("Link must be used inside a Router");

	const handle = function(e: React.MouseEvent<HTMLAnchorElement>) {
		if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
			e.preventDefault();
			ctx.navigate(props.to);
		}
	};

	return <a href={props.to} onClick={handle} {...props}>
		{props.children}
	</a>
}

export function RouterView(): React.ReactNode {
	const ctx = React.useContext(RouterContext);

	if (!ctx) throw new Error("RouterView must be used inside a Router");

	if (ctx.page)
		return ctx.page;

	else
		return <div>{"Not found"}</div>;
}