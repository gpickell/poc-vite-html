import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path, { basename, dirname } from "path";

import { Plugin, PluginOption, normalizePath } from "vite";

const npmTest = /[\\/]node_modules[\\/]/;
const packageExportPrefix = "__pkg__";
const packageExportSuffix = "?pkg-export";
const templateSuffix = "?html-template";

const cwd = path.resolve();
const root = path.resolve("src");

const hmrTemplate = [
    "import { SemanticTemplate } from '#html-loader';",
    "let state;",
    "if (import.meta.hot) {",
    "    import.meta.hot.accept();",
    "    state = import.meta.hot.data;",
    "}",
    "const template = state?.template || new SemanticTemplate();",
    "template.update(html);",
    "if (state) {",
    "   state.template = template;",
    "   template.hot = () => true;",
    "}",
    "export default template;"
];

function changeExtension(fn: string, ext: string) {
    const { dir, name } = path.parse(fn);
    return normalizePath(`${dir}/${name}${ext}`);
}

function removeSuffix(id: string, suffix: string) {
    if (id[0] !== "\0" && id.endsWith(suffix)) {
        return id.substring(0, id.length - suffix.length);
    }

    return "";
}

function backtickEscape(text: string) {
    return text.replace(/[\\`]|\$\{/g, x => "\\" + x);
}

async function transformHtml(html: string, from?: string, optimize = true) {
    const { minify } = await import("html-minifier-terser");
    const { Processor } = await import("postcss");
    const { default: atImport } = await import("postcss-import");
    const postcss = new Processor();
    postcss.use(atImport());
    
    const defer: Promise<void>[] = [];
    const results = new Map<string, string>();
    html = await minify(html, {
        minifyCSS(css) {
            const id = `__css${results.size}`;
            results.set(id, "");

            const execute = async () => {
                const result = await postcss.process(css, { from });
                results.set(id, result.css);
            };

            defer.push(execute());
            return id;
        }
    });

    await Promise.all(defer);

    html = await minify(html, {
        minifyCSS(css) {
            return results.get(css) || "";
        }
    });

    if (!optimize) {
        return html;
    }

    return await minify(html, {
        collapseBooleanAttributes: true,
        collapseInlineTagWhitespace: true,
        collapseWhitespace: true,
        decodeEntities: true,
        html5: true,
        noNewlinesBeforeTagClose: true,
        removeComments: true,
        removeEmptyAttributes: true,
        quoteCharacter: "'",
        
        sortAttributes: true,
        sortClassName: true,
        minifyCSS: true,        
    });
}

const commonPlugin: Plugin = {
    name: "bare-metal-common",
    enforce: "pre",

    async resolveId(id, importer, opts: any) {
        if (!importer || opts.scan || id[0] === "\0" || id.indexOf("?") >= 0 || !id.endsWith(".html")) {
            return undefined;
        }

        const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
        if (result.external) {
            return result;
        }

        const target = result.id;
        if (target[0] === "\0" || target.indexOf("?") >= 0 || !target.endsWith(".html")) {
            return result;
        }

        result.id = target + templateSuffix;
        return result;
    },
};

const devPlugin: Plugin = {
    name: "bare-metal-dev",
    apply: "serve",
    enforce: "pre",

    async load(id) {
        if (id = removeSuffix(id, templateSuffix)) {
            let html = await fs.readFile(id, "utf-8");
            html = await transformHtml(html, undefined, false);
            html = backtickEscape(html);
            html = html.replace(/(^\s*|\s*$|\r)/g, "");
            
            const code = [
                ``,
                `const html = \`\n${html}\n\`;`,
                hmrTemplate,
            ];

            return code.flat().join("\n");
        }
    }
};

const appPlugin: Plugin = {
    name: "bare-metal-app",
    apply: "build",
    enforce: "pre",

    config(options) {
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

        for (const part of output) {
            part.assetFileNames = "static/asset.[hash].[ext]";
            part.chunkFileNames = "static/chunk.[hash].mjs";
            part.entryFileNames = "static/entry.[hash].mjs";
        }
    },

    async load(id) {
        if (id = removeSuffix(id, templateSuffix)) {
            let html = await fs.readFile(id, "utf-8");
            html = await transformHtml(html);
            html = backtickEscape(html);

            const code = [
                ``,
                `const html = \`${html}\`;`,
                hmrTemplate,
            ];

            return code.flat().join("\n");
        }
    },

    async transformIndexHtml(html) {
        return await transformHtml(html);
    }
};

const libPlugin: Plugin = {
    name: "bare-metal-lib",
    apply: "build",
    enforce: "pre",

    async config(options) {
        let { build } = options;
        if (!build) {
            build = options.build = {};
        }

        let { rollupOptions } = build;
        if (!rollupOptions) {
            rollupOptions = build.rollupOptions = {};
        }

        build.minify = false;
        build.sourcemap = true;
        rollupOptions.input = "src/lib.ts";
        rollupOptions.preserveEntrySignatures = "strict";
    },

    async resolveId(id, importer, opts) {
        if (id === "#html-loader") {
            return { id, external: true };
        }

        const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
        if (result.external) {
            return result;
        }
        
        if (result.id[0] !== "\0" && npmTest.test(result.id)) {
            return { id: result.id, external: true };
        }

        return result;
    },

    load(id) {
        if (id = removeSuffix(id, packageExportSuffix)) {
            const code: string[] = [];
            const info = this.getModuleInfo(id);
            for (const e of info.exports) {
                if (e.startsWith(packageExportPrefix)) {
                    const as = e.substring(packageExportPrefix.length);
                    code.push(code.length ? ", " : "export { ");
                    code.push(`${e} as ${as}`);
                }
            }

            code.push(` } from ${JSON.stringify(id)};`);
            return code.join("");
        }
    },

    moduleParsed(info) {
        const { id } = info;
        if (info.exports.some(x => x.startsWith(packageExportPrefix))) {
            let name = normalizePath(path.relative(cwd, info.id));
            name = name.replace(/\.[jt]sx?$/, ".mjs");

            if (name.startsWith("src/")) {
                name = name.replace("src/", "lib/");
                this.emitFile({ type: "chunk", id: `${id}${packageExportSuffix}`, fileName: name });
            }
        }
    },

    generateBundle(_, bundle) {
        const remove: string[] = [];
        for (const name in bundle) {
            const chunk = bundle[name];
            if (chunk.type === "chunk") {
                if (name.startsWith("static/entry.")) {
                    remove.push(name);
                }

                if (name.startsWith("lib/")) {
                    const code: string[] = [];
                    for (const as of chunk.exports) {
                        const e = packageExportPrefix + as;
                        code.push(code.length ? ", " : "export { ");
                        code.push(`${e} as ${as}`);
                    }
        
                    const fn = chunk.fileName;
                    const name = changeExtension(fn, ".d.ts");
                    const dir = normalizePath(path.dirname(name));
                    const src = changeExtension(fn.replace("lib/", "src/"), "");
                    const rel = normalizePath(path.relative(dir, src));
                    code.push(` } from ${JSON.stringify(rel)};`);
                    this.emitFile({
                        type: "asset",
                        fileName: name,
                        source: code.join(""),
                    });
                }
            }
        }

        for (const name of remove) {
            delete bundle[name];
        }
    }
};

const editorApiPlugin: Plugin = {
    name: "bare-metal-editor-api",
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

export function bareMetal(mode: "app" | "lib" = "app", loader = "src/html-loader.ts"): PluginOption {
    const resolverPlugin: Plugin = {
        enforce: "pre",
        name: "bare-metal-resolver",

        resolveId(id, _, opts) {
            if (id === "#html-loader") {
                return this.resolve(loader, undefined, { ...opts, skipSelf: true });
            }
        }
    };

    return [
        commonPlugin,
        mode === "lib" ? libPlugin : false,
        appPlugin,
        resolverPlugin,
        devPlugin,
        editorApiPlugin, 
    ];
}