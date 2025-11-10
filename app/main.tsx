import React from 'react';
import DOM from 'react-dom/client';

import URI from "urijs";
import ModalProvider from "./modal.js";
import StatusBar from "./status";
import CertmasterApi from "./lib/api";
import JobQueue from "./job-queue";
import '../css/main.css';
import Header from "./header";
import Router, {RouterView} from "./router";
import Certificate from "./certificate";

function getApiUrl(): URI {
	const userPreference = window.localStorage.getItem("API_URL");
	if (userPreference) return new URI(userPreference);

	return new URI(window.location.toString())
		.path("/api");
}

export const API = React.createContext(new CertmasterApi(getApiUrl()));

export const root = DOM.createRoot(document.querySelector('#root')!);

root.render(<>
	<Router config={{
		"/": path => <JobQueue />,
		"/inspect/:alias": ({ match }) => <>
			<JobQueue />
			<Certificate certificateId={match.pathname.groups['alias']} />
		</>
	}}>
		<API.Provider value={new CertmasterApi(getApiUrl())}>
			<ModalProvider>
				<Header />

				<div id="main">
					<RouterView />
				</div>

				<StatusBar />
			</ModalProvider>
		</API.Provider>
	</Router>
</>);

