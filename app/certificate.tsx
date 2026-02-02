import React from "react";
import x509 from '@peculiar/x509';
import {API} from "./main";
import {Awaited} from "./util";
import {Job} from "./lib/certmaster";

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

	return <Awaited promise={api.getJobById(decodeURIComponent(props.certificateId))}>
		{jobs => <div id="certificate-details-view">
			{jobs.map(({csr, job}) => <CertificateDetails certificate={csr} job={job}/>)}
		</div>}
	</Awaited>;
}

export interface CertificateDetailsProps {
	certificate: x509.Pkcs10CertificateRequest,
	job: Job
}

export function CertificateDetails(props: CertificateDetailsProps) {
	const subjectAltNames = React.useMemo(() => (props.certificate.getExtension("2.5.29.17") as x509.SubjectAlternativeNameExtension).names.items, [props.certificate]);
	const api = React.useContext(API);

	const override = React.useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
		// await api.override();
	}, [api]);

	return <>
		<div className={"certificate-details"}>
			<h1 className={"flex-h align-min-centre"}>
				{props.certificate.subjectName.getField("CN")}

				<span className={"capsule"}>{{
					'Pending': 'pending',
					'ChallengePending': 'challenge',
					'ChallengePassed': 'passed',
					'ChallengeFailed': 'failed',
					'Finished': 'finished',
					'SigningError': 'error',
					'Stale': 'stale',
				}[typeof props.job.status == 'string' ? props.job.status : Object.keys(props.job.status)[0]]}</span>
			</h1>
			<div className="subheading"><b>{"Client ID: "}</b>{props.job.clientId}</div>

			<div><b>{"Subject: "}</b>{props.certificate.subject.toString()}</div>
			<div>
				<b>{"Alternative names: "}</b>
				<ul>{subjectAltNames.map(i => <li className={"flex-h align-min-centre"}>
					<span data-icon={i.type == 'dns' ? "\ue875" : "\ue016"} />
					<span>{i.value}</span>
				</li>)}</ul>
			</div>

			<div className="button-group">
				<button className="danger" data-icon={"\ue5cd"}
						onClick={e => override(e)}
						title={"Inform the issuer of a failed validation and remove the entry from the job queue"}>{"Decline challenge"}</button>
				<button className="success" data-icon={"\ue8e8"}
						title={"Manually pass certificate challenge and proceed to issuance."}>{"Override Challenge"}</button>
			</div>
		</div>
	</>
}