import { Processor } from "postcss";
import { default as atImport } from "postcss-import";

function usePostCss() {
    // @ts-ignore
    return async function (css: string, from?: string, transformOnly = true, minify?: Minify) {
        const postcss = new Processor();
        postcss.use(atImport());
    
        const result = await postcss.process(css, { from });
        return result.css;
    };
}

export default usePostCss;