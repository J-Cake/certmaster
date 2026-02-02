import Api, {CacheCell} from "./api";
import uri from "urijs";

export default class Help extends Api {

	#articles: CacheCell<Record<string, HelpArticle>>;

	constructor() {
		super(uri(window.location.origin).pathname("/help"));

		this.#articles = new CacheCell(() => this.fetchArticles()
			.then(articles => Object.fromEntries(articles
				.map(article => [article.id, article]))));
	}

	async fetchArticles(): Promise<HelpArticle[]> {
		return await this.fetchJson<CaddyFile[]>("/")
			.then(res => res.map(article => ({
				lastModified: new Date(article.mod_time),
				name: [...article.name.replace(/-+/, ' ')]
					.with(0, article.name[0].toUpperCase())
					.join('')
					.split('.')
					.slice(0, -1)
					.join('.'),
				url: this.concatUris(article.url),
				id: article.name.split('.')
					.slice(0, -1)
					.join('.')
			})));
	}

	async articles(): Promise<Record<string, HelpArticle>> {
		return this.#articles.get();
	}

	async getArticle(article: string): Promise<string> {
		console.log(article, await this.#articles.get());

		return await this.#articles.get()
			.then(articles => articles[article].url)
			.then(url => this.fetchText(url, 'GET', { Accept: 'text/markdown' }));
	}
}

interface CaddyFile {
	name: string,
	size: number,
	url: string,
	mod_time: Date,
	is_dir: boolean,
	is_symlink: boolean
}

export interface HelpArticle {
	name: string,
	lastModified: Date,
	url: URL,
	id: string
}