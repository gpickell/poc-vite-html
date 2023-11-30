import { loader } from "#html-loader";

const modules = import.meta.glob("./components/*/index.ts");

loader.addEventListener("import", () => {
    const hint = loader.next();
    const id = `./components/${hint}/index.ts`;
    if (id in modules) {
        loader.defer();

        const promise = modules[id]() as Promise<Record<"default", CustomElementConstructor>>;
        promise.then(x => customElements.define(hint, x.default));
    }
});

loader.start();
