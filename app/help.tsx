import React from 'react';

import Markdown from "./markdown";
import {Awaited} from "./util";
import {HELP_API} from "./main";
import {Link} from "./router";

const notFound = `
# Article was not found

The article you requested could not be located. Please try another query.
`

export default function Help(props: { article: string }) {
	const api = React.useContext(HELP_API);

	return <section id="help"><Link to={"/"}>{"Home"}</Link>
		<ul>
			<Awaited promise={api.articles()}>
				{ok => Object.keys(ok).map(a => <li key={`help-article-${a}`}>
					<Link to={ok[a].id}>{ok[a].name}</Link>
				</li>)}
			</Awaited>
		</ul>
		<Awaited promise={api.getArticle(props.article).catch(() => notFound)}>
			{ok => <Markdown>
				{ok}
			</Markdown>}
		</Awaited>
	</section>;

}