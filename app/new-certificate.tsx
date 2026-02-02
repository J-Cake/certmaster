import x509 from "@peculiar/x509";
import React from "react";
import Markdown from "./markdown";

import {topLevelModal} from "./modal";
import {Link} from "./router";
import Form from "./form";
import {API} from "./main";

// language=Markdown
const wildcardMsg = `
Please enter the list of names the certificate should be valid for.

Note that wildcard certificates are _technically_ valid, but no explicit support exists within Certmaster at the moment.
Your mileage may vary.			
`;

export default function NewCertificateModal() {
	const api = React.useContext(API);
	const [names, setNames] = React.useState([""]);
	const [subject, setSubject] = React.useState("CN=");

	return <Form<{ hostname: string | string[], subject: string, usages: x509.KeyUsageFlags[] }> onSubmit={res => api.newCertificateRequest(res)}>
		<h1>
			{"New Certificate"}
			<Link to="/help/new-certificate" data-icon={"\ue887"} className="help-icon" />
		</h1>

		<p>{"Create a new certificate request."}</p>

		<label>
			{"Subject"}
			<input name="subject" type="text" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} autoFocus={true} />
		</label>

		<fieldset className="margin-v-m flex-v gap-s">
			<legend>{"Valid names"}</legend>

			<Markdown>{wildcardMsg}</Markdown>

			{names.map((name, a) => <div className="flex-h align-min-centre gap-s">
				<span data-icon={name.trim() == '' ? '' : isDns(name) ? "\ue875" : "\ue016"} />
				<div className="button-group fill-maj">
					<input type="text" name="hostname" className="fill-maj" placeholder="example.com" value={name} onChange={e => setNames(prev => prev.with(a, e.target.value))} />
					<button className="symbolic danger" data-icon={"\ue5cd"} onClick={_ => setNames(names.slice(0, a).concat(names.slice(a + 1)))} />
				</div>
			</div>)}

			<div className="button-group align-maj-end">
				<button data-icon={"\ue145"} className="secondary" onClick={() => setNames(prev => ([...prev, ""]))}>{"Name"}</button>
			</div>
		</fieldset>

		<div className={"flex-h align-maj-end gap-xs"}>
			<button className="tertiary">{"Cancel"}</button>
			<button className="success" data-icon={"\ue86c"} type="submit">{"Create"}</button>
		</div>
	</Form>
}

export function isDns (name: string): boolean {
	if (!name) return false;

    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(name))
        return !name.split('.').every(part => parseInt(part, 10) <= 255);

	return !name.includes(':');

}