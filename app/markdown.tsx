import React from 'react';
import markdownIt from 'markdown-it';

export const mdit = markdownIt({
	linkify: true,
});

export default function Markdown(props: { children: string }) {
	const markdown = React.useMemo(() => mdit.render(props.children), [props.children]);

	return <article dangerouslySetInnerHTML={{__html: markdown }} />
}