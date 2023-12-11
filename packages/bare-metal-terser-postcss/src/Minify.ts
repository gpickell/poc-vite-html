interface Minify {
    (type: string, content: string, from?: string): string | Promise<string>;
}

export default Minify;