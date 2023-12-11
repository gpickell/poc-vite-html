
import { parseSync } from "@swc/core";

console.log(parseSync("$test || ($next = 2);").body[0].expression);
