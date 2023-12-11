import { defineConfig } from "vite";
import builder, { minifiers } from "@tsereact/bare-metal-vite-plugin";
import useHtmlTerser from "@tsereact/bare-metal-terser-postcss/useHtmlTerser";
import usePostCss from "@tsereact/bare-metal-terser-postcss/usePostCss";

minifiers.css = usePostCss();
minifiers.html = useHtmlTerser();

export default defineConfig({
    base: "",
    publicDir: false,

    resolve: {
        conditions: [
            "source"
        ]
    },

    plugins: [
        builder("lib")
    ],
});
