import { defineConfig } from "vite";

export default defineConfig({
    base: "",
    publicDir: false,

    build: {
        minify: false,

        rollupOptions: {
            input: "src/index.ts",
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
