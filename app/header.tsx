import React from "react";

export interface Header {

}

export default function Header(props: Header) {
	return <section id="header">
		<div className="button-group">
			<button className="primary" data-icon={"\ue145"}>{"New Certificate"}</button>
		</div>
	</section>;
}