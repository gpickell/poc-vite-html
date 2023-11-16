import layout from "./layout.html";

const modules = import.meta.glob("../*/index.ts");

import { loader, fromShadow } from "#html-loader";

loader.addEventListener("import", () => {
    const hint = loader.next();
    const id = `../${hint}/index.ts`;
    if (id in modules) {
        loader.defer();

        const promise = modules[id]() as Promise<Record<"default", CustomElementConstructor>>;
        promise.then(x => customElements.define(hint, x.default));
    }
});

customElements.define("app-main", fromShadow(layout));
