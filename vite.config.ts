import { defineConfig } from "vite";
import { bareMetal } from "./vite.plugins";

export default defineConfig({
    base: "",
    publicDir: false,

    plugins: [bareMetal("lib")],
});
