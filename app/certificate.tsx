import React from "react";
import x509 from '@peculiar/x509';
import {API} from "./main";
import {Awaited} from "./util";
import {Job} from "./lib/certmaster";
import {topLevelModal} from "./modal";

export interface CertificateViewProps {
	alias?: string
}

export default function Certificate(props: CertificateViewProps) {
	const api = React.useContext(API);
	const modal = React.useContext(topLevelModal);

	if (!props.alias)
		return <div>
			<h1>{"No certificate selected"}</h1>
			<p></p>
		</div>;

	return <Awaited promise={api.getJobById(decodeURIComponent(props.alias))}>
		{jobs => <div id="certificate-details-view">
			{jobs.map(({csr, job}) => <CertificateDetails key={`certificate-${job.alias}`} certificate={csr} job={job}/>)}
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
		await api.override([props.job]);
	}, [api, props.job]);

	const status = React.useMemo(() => typeof props.job.status == 'string' ? props.job.status as keyof Job['status']: Object.keys(props.job.status)[0] as keyof Job['status'], [props.job.status]);

	return <>
		<div className={"certificate-details"}>
			<h1 className={"flex-h align-min-centre"}>
				{props.certificate.subjectName.getField("CN")}

				<Status status={status} />
			</h1>
			<div className="subheading"><b>{"Client ID: "}</b>{props.job.clientId}</div>

			<div><b>{"Subject: "}</b>{props.certificate.subject.toString()}</div>
			<div>
				<b>{"Alternative names: "}</b>
				<ul>{subjectAltNames.map(i => <li key={`${props.job.alias}/${i}`} className={"flex-h align-min-centre"}>
					<span data-icon={i.type == 'dns' ? "\ue875" : "\ue016"} />
					<span>{i.value}</span>
				</li>)}</ul>
			</div>

			<div className="button-group">
				<button className="danger" data-icon={"\ue5cd"}
						title={"Inform the issuer of a failed validation and remove the entry from the job queue"}>{"Decline challenge"}</button>
				<button className="success" data-icon={"\ue8e8"}
						onClick={e => override(e)}
						title={"Manually pass certificate challenge and proceed to issuance."}>{"Override Challenge"}</button>
			</div>
		</div>
	</>
}

export function Status(props: { status: keyof Job['status'] }) {
	return <span className={["capsule", {
		'Pending': 'blue',
		'ChallengePending': 'blue',
		'ChallengePassed': 'green',
		'Finished': 'green',
		'ChallengeFailed': 'red',
		'SigningError': 'red',
		'Stale': 'grey',
	}[props.status]].join(' ')}>{{
		'Pending': 'pending',
		'ChallengePending': 'challenge',
		'ChallengePassed': 'passed',
		'ChallengeFailed': 'failed',
		'Finished': 'finished',
		'SigningError': 'error',
		'Stale': 'stale',
	}[props.status]}</span>;
}