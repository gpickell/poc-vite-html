import "../setup";

import layout from "./layout.html";
import { fromShadow } from "#html-loader";
customElements.define("app-main", fromShadow(layout));
