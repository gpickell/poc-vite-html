import { minify as terser, Options } from "html-minifier-terser";
import Minify from "./Minify";

const defaults: Options = {
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
};

function useHtmlTerser(options = defaults) {
    // @ts-ignore
    return async function (html: string, from?: string, transformOnly = true, minify?: Minify) {
        const defer: Promise<void>[] = [];
        const results = new Map<string, string>();
        if (minify) {
            html = await terser(html, {
                minifyCSS(css) {
                    const id = `__css${results.size}`;
                    results.set(id, "");
        
                    const execute = async () => {
                        results.set(id, await minify("css", css, from));
                    };
        
                    defer.push(execute());
                    return id;
                }
            });
        }
    
        await Promise.all(defer);
    
        html = await terser(html, {
            minifyCSS(css) {
                return results.get(css) || "";
            }
        });
    
        if (transformOnly) {
            return html;
        }
    
        return await terser(html, options);
    };
}

Object.freeze(defaults);

export { defaults };
export default useHtmlTerser;