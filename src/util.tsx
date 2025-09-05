import React from 'react';

// language=CSS
const css = `
.dot {
	background: currentColor;
    
	animation: fade 1.5s infinite;
	animation-delay: 0s;
}

.dot2 {
    animation-delay: 0.5s;
}

.dot3 {
    animation-delay: 1s;
}

@keyframes fade {
	from {
		opacity: 0.3;
	}
	
	to {
		opacity: 0.9;
	}
}
`;

export function Awaited<T>(props: { promise: Promise<T>, children: (t: T) => React.ReactNode, alt?: React.ReactNode }): React.ReactNode {
	const [res, setRes] = React.useState(null as null | { done: T });

	React.useEffect(() => {
		(async () => await props.promise)()
			.then(res => setRes({done: res}));
	}, [props.promise, setRes]);

	if (!res)
		return props.alt ?? <div>
			<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ maxHeight: '1em' }}>
				<style>{css}</style>
				<circle className="dot dot1" cx="4" cy="12" r="3"/>
				<circle className="dot dot2" cx="12" cy="12" r="3"/>
				<circle className="dot dot3" cx="20" cy="12" r="3"/>
			</svg>
		</div>;
	else
		return props.children(res.done);
}

export function Interval<T>(props: { duration: number, callback: () => T, children: (t: T) => React.ReactNode }) {
	const [res, setRes] = React.useState(null as null | { done: any });

	React.useEffect(() => {
		setRes({done: props.callback()});

		const interval = setInterval(() => {
			setRes({done: props.callback()});
		}, props.duration);
		return () => clearInterval(interval);
	}, []);

	return props.children(res?.done);
}