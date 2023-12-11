import parse from "./parse";
import YAML from "yaml";

import swcInit, { parseSync } from "@swc/wasm-web";
import swcUrl from "@swc/wasm-web/wasm-web_bg.wasm?url";

await swcInit(swcUrl);

import code from "/codeflow.ts?raw";
const [result] = parse(code, parseSync);

const pre = document.createElement("pre");
pre.append(YAML.stringify(result, undefined, 4));
document.body.append(pre);
