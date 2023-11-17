import fs from "fs/promises";
import path from "path";

import { Plugin, normalizePath } from "vite";

export function html(): Plugin[] {
    let minify = async (html: string) => html;
    const suffix = "?template";
    const build: Plugin = {
        apply: "build",
        enforce: "pre",
        name: "html-minify",

        buildStart() {
            minify = async html => {
                const { minify } = await import("html-minifier-terser");
                return await minify(html, {
                    collapseBooleanAttributes: true,
                    collapseInlineTagWhitespace: true,
                    collapseWhitespace: true,
                    decodeEntities: true,
                    html5: true,
                    noNewlinesBeforeTagClose: true,
                    minifyCSS: true,
                    removeComments: true,
                    removeEmptyAttributes: true,
                    quoteCharacter: "'",
                    sortAttributes: true,
                    sortClassName: true,
                });
            };
        }
    };

    const main: Plugin = {
        name: "html-loader",
        enforce: "pre",

        async resolveId(id, importer, opts: any) {
            if (id === "#html-loader") {
                return normalizePath(path.resolve("src/html-loader.ts"));
            }

            if (id[0] === "\0" && id.endsWith(suffix)) {
                return id;
            }

            if (!importer || opts.scan) {
                return undefined;
            }

            const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
            if (result.external) {
                return result;
            }

            id = result.id;
            if (id[0] === "\0" || id.indexOf("?") >= 0 || !id.endsWith(".html")) {
                return result;
            }

            return `${id}${suffix}`
        },

        async load(id) {
            if (!id.endsWith(suffix)) {
                return undefined;
            }

            id = id.substring(0, id.length - suffix.length);

            const text = await fs.readFile(id, "utf-8");
            const html = await minify(text);
            const escaped = html.replace(/[$\\`]\{?/g, x => {
                if (x[0] === "$" && !x[1]) {
                    return x;
                }

                return "\\" + x;
            });

            const code = [
                "",
                `const html = \`${escaped}\`;`,
                'import { SemanticTemplate } from "#html-loader";',
                "let state;",
                "if (import.meta.hot) {",
                "    import.meta.hot.accept();",
                "    state = import.meta.hot.data;",
                "}",
                "const template = state?.template || new SemanticTemplate();",
                `template.update(html);`,
                "if (state) {",
                "   state.template = template;",
                "}",
                "export default template;"
            ];

            return code.join("\n");
        }
    };

    return [build, main];
}