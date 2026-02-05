import React from 'react';
import DOM from 'react-dom/client';
import URI from "urijs";
import "reflect-metadata";

import CertmasterApi from "./lib/certmaster";
import HelpApi from "./lib/help";
import StatusBar from "./status";
import ModalProvider from "./modal.js";
import JobQueue from "./job-queue";
import Header from "./header";
import Router, {RouterView} from "./router";
import Certificate from "./certificate";
import Help from "./help";

import '../css/main.css';

function getApiUrl(): URI {
	const userPreference = window.localStorage.getItem("API_URL");
	if (userPreference) return new URI(userPreference);

	return new URI(window.location.toString())
		.path("/api");
}

export const API = React.createContext(new CertmasterApi(getApiUrl()));
export const HELP_API = React.createContext(new HelpApi());

export const root = DOM.createRoot(document.querySelector('#root')!);

root.render(<>
	<Router config={{
		"/": path => <JobQueue />,
		"/help/:article": ({ match }) => <Help article={match.pathname.groups['article']!}/>,
		"/inspect/:alias": ({ match }) => <>
			<JobQueue />
			<Certificate alias={match.pathname.groups['alias']} />
		</>
	}}>
		<API.Provider value={new CertmasterApi(getApiUrl())}>
			<HELP_API.Provider value={new HelpApi()}>
				<ModalProvider>
					<Header />

					<div id="main">
						<RouterView />
					</div>

					<StatusBar />
				</ModalProvider>
			</HELP_API.Provider>
		</API.Provider>
	</Router>
</>);

