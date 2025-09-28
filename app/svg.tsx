import React from 'react';

export default function Svg(props: { img: SVGSVGElement }) {
	const ref = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		ref.current?.replaceWith(props.img)
	}, []);
	return <div ref={ref}/>;
}