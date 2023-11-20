import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";

import { Plugin, normalizePath } from "vite";

async function findSources() {
    function compOf(id: string) {
        const tail = id.replace(/^(components|layouts)\//, "");
        if (tail === id) {
            return "";
        }

        return tail.replace(/\/.*/, "");
    }

    const root = path.resolve("src");
    const queue = new Set<string>();
    queue.add(root);

    const mains = new Set<string>();
    const isApi = /^apis\/.*\.tsx?$/;
    const isComponent = /^components\/.*\/index\.tsx?$/;
    const isLayout = /^components\/.*\.html$/;
    const isMain = /^components\/.*\/main\.tsx?$/;
    const result = new Map<string, string>();
    for (const dir of queue) {
        const list = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as never);
        for (const entry of list) {
            const fn = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                queue.add(fn);
            }

            if (entry.isFile()) {
                const rel = path.relative(root, fn).replace(/[\\/]+/g, "/");
                const id = rel.replace(/\..*?$/, "");
                if (isApi.test(rel) || isComponent.test(rel)) {
                    result.set(id, fn);
                }

                if (isLayout.test(rel)) {
                    result.set(id.replace("components", "layouts"), `${fn}?template`);
                }

                if (isMain.test(rel)) {
                    mains.add(compOf(id));
                }
            }
        }
    }

    for (const key of result.keys()) {
        if (mains.has(compOf(key))) {
            result.delete(key);
        }
    }

    return Object.fromEntries(result);
}

export function html(): Plugin[] {
    let minify = async (html: string) => html;
    const suffix = "?template";
    const build: Plugin = {
        enforce: "post",
        name: "html-minify",
        apply: "build",

        async config(options) {
            let { build } = options;
            if (!build) {
                build = options.build = {};
            }

            let { rollupOptions } = build;
            if (!rollupOptions) {
                rollupOptions = build.rollupOptions = {};
            }

            let { output } = rollupOptions;
            if (!output) {
                output = rollupOptions.output = [{}];
            }

            if (!Array.isArray(output)) {
                output = rollupOptions.output = [output];
            }

            if (build.minify === undefined) {
                build.minify = true;
            }

            if (!build.minify) {
                rollupOptions.preserveEntrySignatures = "strict";
                rollupOptions.input = await findSources();

                const isRelative = /^\.?\.\//;
                rollupOptions.external = (id, importer) => {
                    if (id === "#html-loader") {
                        return true;
                    }

                    if (!importer || path.isAbsolute(id)) {
                        return false;
                    }

                    if (id.endsWith("?url")) {
                        return false;
                    }

                    return !isRelative.test(id);
                };

                const extras: typeof output[0] = {
                    // preserveModules: true,

                    assetFileNames: "static/asset.[hash].[ext]",
                    chunkFileNames: "static/chunk.[hash].mjs",
                    entryFileNames: "[name].mjs",
                };
                
                for (const item of output) {
                    Object.assign(item, extras);
                }
            } else {
                const extras: typeof output[0] = {
                    assetFileNames: "static/asset.[hash].[ext]",
                    chunkFileNames: "static/chunk.[hash].mjs",
                    entryFileNames: "static/chunk.[hash].mjs",
                };
                
                for (const item of output) {
                    Object.assign(item, extras);
                }
            }
        },

        buildStart(options) {
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
        },

        async transformIndexHtml(html) {
            return await minify(html);
        },

        async generateBundle(options, bundle) {
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk" && chunk.moduleIds.length === 1) {
                    const id = chunk.moduleIds[0];                  
                    const fn = chunk.fileName.replace(/\.m?js$/, ".d.ts");
                    if (id[0] !== "\0" && id.endsWith(suffix) && fn.startsWith("layouts/")) {
                        if (fn !== chunk.fileName) {
                            const code = [
                                `import { SemanticElement } from "#html-loader";`,
                                `declare const template: SemanticElement;`,
                                `export default template;`,
                                ``
                            ];

                            this.emitFile({
                                type: "asset",
                                fileName: fn,
                                source: code.join("\n"),
                            });
                        }
                    }
                }
            }
        }
    };

    const main: Plugin = {
        name: "html-loader",
        enforce: "pre",

        async resolveId(id, importer, opts: any) {
            if (id === "#html-loader") {
                return normalizePath(path.resolve("src/html-loader.ts"));
            }

            if (id[0] !== "\0" && id.endsWith(suffix)) {
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
            if (id === "\0" || !id.endsWith(suffix)) {
                return undefined;
            }

            const fn = id.substring(0, id.length - suffix.length);
            const text = await fs.readFile(fn, "utf-8");
            const html = await minify(text);
            const escaped = html.replace(/[$\\`]\{?/g, x => {
                if (x[0] === "$" && !x[1]) {
                    return x;
                }

                return "\\" + x;
            });
            
            const imports: string[] = [];
            const assembled = escaped.replace(/@import url\((.*?)\)/g, (match, url: string) => {
                url = url.trim();

                if (url[0] === "/" || url.startsWith("http://") || url.startsWith("https://")) {
                    return match;
                }

                const ref = "url" + imports.length;
                imports.push(`import ${ref} from "${url}?url";`);
                return `@import url(\${${ref}})`;
            });

            const code = [
                "",
                imports,
                `const html = \`${assembled}\`;`,
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
                `   template.hot = () => true;`,
                "}",
                "export default template;"
            ];

            return code.flat().join("\n");
        }
    };

    const api: Plugin = {
        name: "html-editor-api",
        enforce: "pre",
        apply: "serve",

        configureServer({ middlewares }) {
            middlewares.use("/api/editor", async (req, res, next) => {
                const tail = (req.url || "").replace(/^.*?\?/, "");
                const file = path.resolve(tail);
                if (req.method === "GET") {
                    req.resume();
                    
                    const stream = createReadStream(file);
                    stream.on("error", () => {
                        res.statusCode = 404;
                        res.end();
                    });
                    
                    return void stream.on("open", () => {
                        res.setHeader("Content-Type", "text/html; charset=utf-8");
                        res.statusCode = 200;
                        stream.pipe(res);
                    });
                }

                if (req.method === "POST") {
                    const stats = await fs.stat(file).catch(() => {});
                    if (stats && stats.isFile()) {
                        const stream = createWriteStream(file + ".tmp");
                        req.on("error", () => {});
                        req.on("close", () => {
                            if (!req.readableEnded) {
                                stream.destroy();
                            }
                        });

                        stream.on("error", () => {});
                        stream.on("close", async () => {
                            let success = false;
                            if (stream.writableFinished) {
                                success = await fs.rename(file + ".tmp", file).then(() => true, () => false);
                            }

                            req.resume();
                            req.statusCode = success ? 200 : 500;
                            res.end();

                            await fs.unlink(file + ".tmp").catch(() => {});
                        });

                        return void req.pipe(stream);
                    }
                    
                    req.resume();
                    res.statusCode = 404;
                    return res.end();
                }

                res.statusCode = 405;
                res.end();
            });
        }
    };

    return [build, main, api];
}