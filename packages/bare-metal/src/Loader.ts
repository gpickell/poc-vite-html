import EventTargetTyped from "./EventTargetTyped";

declare global {
    interface CustomElementRegistry {
        get<K extends keyof CustomElements>(name: K): CustomElements[K] | undefined;
    }

    interface Node {
        hot?: boolean;
    }
}

export interface CustomElements {
    
}

export type ElementType<K> = K extends keyof CustomElements ? CustomElements[K] extends new () => (infer R extends HTMLElement) ? R : HTMLElement : HTMLElement;

export interface LoaderEvents {
    request: Record<"request", RequestEvent>;

    render: {
        [K in `render:${keyof CustomElements}`]: RenderEvent<K extends `render:${infer P}` ? ElementType<P> : HTMLElement>;
    };
}

export class RenderEvent<T extends HTMLElement = HTMLElement> extends Event {
    readonly element: T;

    constructor(element: T) {
        const tag = element.tagName.toLowerCase();
        super(`render:${tag}`);
        this.element = element;
    }
}

export class RequestEvent extends Event {
    declare readonly tag: string;
    declare readonly type: "request";
    declare readonly bubbles: false;
    declare readonly cancelable: true;
    declare readonly composed: false;

    constructor(tag: string) {
        super("request", { cancelable: true });
        this.tag = tag;
    }

    defer() {
        this.stopImmediatePropagation();
        this.preventDefault();
    }
}

const defer = Promise.resolve();
const nop = () => {};
const controller = new EventTarget();
const pending = new Set<string>();
const queue = new Set<string>();
const visit = new WeakSet();

function attempt<K extends string>(tag: K) {
    if (queue.has(tag)) {
        const e = new RequestEvent(tag);
        if (!controller.dispatchEvent(e)) {
            queue.delete(tag);
        }
    }
}

let promise = defer;
let resolve = nop;
function ready() {
    return pending.size < 1;
}

function request(hint: Element | DocumentFragment | string) {
    if (typeof hint === "string") {
        if (hint.indexOf("-") < 0) {
            return undefined;
        }

        const tag = hint.toLowerCase();
        const cls = customElements.get(tag);
        if (cls) {
            return ready() ? cls : undefined;
        }

        if (pending.has(tag)) {
            return undefined;
        }

        pending.add(tag);
        queue.add(tag);

        customElements.whenDefined(tag).then(() => {
            pending.delete(tag);
            queue.delete(tag);

            if (pending.size < 1) {
                resolve();
            }
        });

        defer.then(() => attempt(tag));
        return undefined;
    }

    if (visit.has(hint)) {
        return ready();
    }

    let e: Element | undefined;
    const iter = document.createNodeIterator(hint, 1);
    while (e = iter.nextNode() as Element | undefined) {        
        visit.add(e);
        request(e.tagName);

        if (e instanceof HTMLTemplateElement) {
            request(e.content);
        }
    }

    return ready();
}

function wait() {
    if (ready()) {
        return promise;
    }

    if (resolve === nop) {
        promise = new Promise(x => {
            resolve = () => {
                x();
                promise = defer;
                resolve = nop;
            };
        });
    }
    
    return promise;
}

interface LoaderBaseClass extends EventTargetTyped<LoaderEvents> {
    new (): HTMLElement;
    prototype: HTMLElement;
}

class Loader extends (HTMLElement as LoaderBaseClass) {
    #root?: ShadowRoot;

    protected connectedCallback() {
        for (const template of this.querySelectorAll("template")) {
            request(template);
        }

        wait().then(() => {
            let root = this.#root;
            if (!root) {
                this.#root = root = this.attachShadow({ "mode": "closed" });
            }

            root.innerHTML = "";

            for (const { content } of this.querySelectorAll("template")) {
                const children = content.cloneNode(true);                    
                root.append(children);
            }
        });
    }

    static ready() {
        return ready();
    }

    static request<K extends keyof CustomElements>(hint: K): CustomElements[K] | undefined;
    static request(hint: string): typeof HTMLElement | undefined;
    static request(hint: Element | DocumentFragment): boolean;
    static request(hint: Element | DocumentFragment | string): typeof HTMLElement | boolean | undefined;

    static request(hint: Element | DocumentFragment | string) {
        return request(hint);
    }

    static wait() {
        return wait();
    }
}

function addEventListener(type: string, handler: any, options: any) {
    if (type === "request" || type.startsWith("request:")) {
        for (const tag of queue) {
            promise.then(() => attempt(tag));
        }
    }

    controller.addEventListener(type, handler, options);
}

Object.defineProperty(Loader, "addEventListener", {
    configurable: true,
    value: addEventListener,
});

Object.defineProperty(Loader, "removeEventListener", {
    configurable: true,
    value: controller.removeEventListener.bind(controller),
});

Object.defineProperty(Loader, "dispatchEvent", {
    configurable: true,
    value: controller.dispatchEvent.bind(controller),
});

function config() {
    let name = "";
    const { env } = import.meta as any;
    if (env && (name = env.BARE_METAL_LOADER)) {
        return name;
    }

    return name || "bare-metal-loader";
}

function create(): typeof Loader {
    const name = config();
    const cls = customElements.get(name);
    if (cls) {
        return cls as any;
    }

    customElements.define(name, Loader);
    return Loader;
}

export function load(html: string) {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
}

export function reload(html: string, data: any) {
    const template = data.template || document.createElement("template");
    data.template = template;
    template.innerHTML = html;

    const { content } = template;
    visit.delete(content);
    content.hot = true;
    content.dispatchEvent(new Event("hot-update"));
    
    return content;
}

export default create();
