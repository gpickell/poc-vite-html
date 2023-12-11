import { defineConfig } from "vite";

export default defineConfig({
    base: "",
    publicDir: false,

    build: {
        minify: false,

        rollupOptions: {
            input: {
                "EventTargetTyped": "src/EventTargetTyped.ts",
                "Loader": "src/Loader.ts",
                "SemanticElement": "src/SemanticElement.ts",
                "WeakStore": "src/WeakStore.ts",
            },

            preserveEntrySignatures: "strict",
            treeshake: false,

            external(id, importer) {
                return id[0] !== "." && !!importer;
            },

            output: {
                entryFileNames: "lib/[name].mjs"
            }
        }
    }
});
