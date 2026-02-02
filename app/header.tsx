import React from "react";
import x509 from "@peculiar/x509";

import {topLevelModal} from "./modal";
import Form from "./form";
import {Link} from "./router";
import Markdown from "./markdown";
import {API} from "./main";

export interface Header {

}

export default function Header(props: Header) {
	return <section id="header">
		<div className="button-group">
		</div>
	</section>;
}