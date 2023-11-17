import { defineConfig } from "vite";
import { html } from "./vite.plugins";

import react from "@vitejs/plugin-react-swc";

export default defineConfig({
    base: "",
    publicDir: false,

    plugins: [html(), react()],

    build: {
        rollupOptions: {
            output: {
                assetFileNames: "static/asset.[hash].[ext]",
                chunkFileNames: "static/chunk.[hash].mjs",
                entryFileNames: "static/chunk.[hash].mjs",
            }
        }
    }
})
