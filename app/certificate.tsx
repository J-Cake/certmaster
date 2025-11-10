import React from "react";
import x509 from '@peculiar/x509';
import {API} from "./main";
import {Awaited} from "./util";
import {Job} from "./lib/api";

export interface CertificateViewProps {
	certificateId?: string
}

export default function Certificate(props: CertificateViewProps) {
	const api = React.useContext(API);

	if (!props.certificateId)
		return <div>
			<h1>{"No certificate selected"}</h1>
			<p></p>
		</div>;

	return <div>
		<h1>{decodeURIComponent(props.certificateId)}</h1>
		<Awaited promise={api.getJobById(decodeURIComponent(props.certificateId))}>
			{job => <CertificateDetails job={job} />}
		</Awaited>
	</div>;
}

export interface CertificateDetailsProps {
	job: Job
}

export function CertificateDetails(props: CertificateDetailsProps) {
	return <>
	</>
}