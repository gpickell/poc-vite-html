import fs from "fs/promises";
import path from "path";

import { Plugin, PluginOption, normalizePath } from "vite";
type PluginContext = Extract<Plugin["load"], (...args: any) => any> extends (this: infer T, ...args: any) => any ? T : never;

const npmTest = /[\\/]node_modules[\\/]/;
const packageExportPrefix = "__pkg__";
const packageExportSuffix = "?pkg-export";
const templateSuffix = "?html-template";

const cwd = path.resolve();

const hmrTemplate = [
    "import { load, reload } from '@tsereact/bare-metal/Loader';",
    "let data;",
    "if (import.meta.hot) {",
    "    import.meta.hot.accept();",
    "    data = import.meta.hot.data;",
    "}",
    "const content = data ? reload(html, data) : load(html);",
    "export default content;"
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

// @ts-ignore
function minify(ctx: PluginContext | void) {
    async function transform<T extends string>(type: T, content: string, from?: string, transformOnly?: boolean): Promise<string> {
        const xform = minifiers[type];
        if (xform) {
            return await xform(content, from, transformOnly, transform);
        }

        return content;
    }

    return transform<"css" | "html">;
}

const commonPlugin: Plugin = {
    name: "bare-metal-common",
    enforce: "pre",

    async resolveId(id, importer, opts: any) {
        if (!importer || opts.scan || id[0] === "\0" || id.indexOf("?") >= 0 || !id.endsWith(".html")) {
            return undefined;
        }

        const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
        if (!result || result.external) {
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
            html = await minify(this)("html", html, id, true);
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
            html = await minify(this)("html", html, id);
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
        return await minify(this)("html", html);
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
        if (!result || result.external) {
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
            const info = this.getModuleInfo(id)!;
            for (const e of info.exports || []) {
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
        const { exports, id } = info;
        if (exports?.some(x => x.startsWith(packageExportPrefix))) {
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

function bareMetal(mode: "app" | "lib" = "app"): PluginOption {
    const resolverPlugin: Plugin = {
        enforce: "pre",
        name: "bare-metal-resolver",

        async resolveId(id, _, opts) {
            const prefix = "@tsereact/bare-metal/";
            if (id.startsWith(prefix)) {
                return this.resolve(id, undefined, { ...opts, skipSelf: true });
            }
        }
    };

    return [
        commonPlugin,
        mode === "lib" ? libPlugin : false,
        appPlugin,
        resolverPlugin,
        devPlugin,
    ];
}

export interface Minify {
    (type: string, content: string, from?: string): string | Promise<string>;
}

export interface Transform {
    (content: string, from?: string, transformOnly?: boolean, minify?: Minify): string | Promise<string>;
}

export interface Minifiers {
    [index: string]: Transform | undefined;
    css?: Transform | undefined
    html?: Transform | undefined;
}

export const minifiers: Minifiers = {};

export default bareMetal;
