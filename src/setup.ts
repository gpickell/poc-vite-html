import { loader } from "#html-loader";

const modules = import.meta.glob("./components/*/index.ts");

loader.addEventListener("request", e => {
    const id = `./components/${e.tag}/index.ts`;
    if (id in modules) {
        e.defer();

        const promise = modules[id]() as Promise<Record<"default", CustomElementConstructor>>;
        promise.then(x => customElements.define(e.tag, x.default));
    }
});

loader.start();
