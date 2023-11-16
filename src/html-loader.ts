
//
// loader
//

export namespace loader {
    const controller = new EventTarget();
    const transient = new EventTarget();
    const pending = new Set<string>();
    const queue = new Set<string>();
    const visit = new WeakSet();

    function nop() {}

    let current = "";
    let event = new Event("import");
    let promise = Promise.resolve();
    let resolve = nop;

    async function attempt(target: EventTarget, hint: string) {
        await (0 as any);

        if (queue.has(hint)) {
            current = hint;
            event = new Event("import", { cancelable: true });
            target.dispatchEvent(event);
            current = "";

            if (event.defaultPrevented) {
                pending.add(hint);
                queue.delete(hint);            
            }
        }
    }

    async function cleanup(type: string, callback: () => any) {
        await (0 as any);
        transient.removeEventListener(type, callback);
    }

    export function addEventListener(type: "import", callback: () => any) {
        if (type === "import") {
            controller.addEventListener(type, callback);
            transient.addEventListener(type, callback);

            for (const hint of queue) {
                attempt(transient, hint);
            }

            cleanup(type, callback);
        }
    }

    export function removeEventListener(type: "import", callback: () => any) {
        controller.removeEventListener(type, callback);
        transient.removeEventListener(type, callback);
    }

    export function defer() {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    export function next() {
        return current;
    }

    export function ready() {
        return !(pending.size + queue.size);
    }

    export function request(hint: Element | DocumentFragment | string): boolean {
        if (typeof hint === "string") {
            if (hint.indexOf("-") < 0) {
                return true;
            }

            const tag = hint.toLowerCase();
            if (customElements.get(tag)) {
                return true;
            }

            if (pending.has(tag) || queue.has(tag)) {
                return false;
            }

            queue.add(tag);

            if (resolve === nop) {
                promise = new Promise(x => resolve = x);
            }

            customElements.whenDefined(tag).then(() => {
                pending.delete(tag);
                queue.delete(tag);

                if (ready()) {
                    resolve();
                    resolve = nop;
                    promise = Promise.resolve();
                }
            });

            attempt(controller, tag);
            return false;
        }

        if (visit.has(hint)) {
            return ready();
        }

        visit.add(hint);

        if (hint instanceof HTMLTemplateElement) {
            return request(hint.content);
        }

        if (hint instanceof Element) {
            request(hint.tagName);
        }

        for (const child of hint.children) {
            request(child);
        }

        return ready();
    }

    export function wait() {
        return promise;
    }
}

//
// SemanticTemplate
//

function isHot() {
    if (import.meta.hot) {
        return true;
    }

    return false;
}

export class SemanticTemplate extends EventTarget {
    readonly root = document.createElement("template");

    get content() {
        return this.root.content;
    }

    hot() {
        return false;
    }

    update(html = "") {
        const { root } = this;
        root.innerHTML = html;

        if (this.hot()) {
            this.dispatchEvent(new Event("change"));
        }

        this.hot = isHot;
    }    
}



// 
// SemanticElement
//

let pending = false;
const batch = new Set<SemanticElement>();

async function run() {
    await (0 as any);

    while (batch.size) {
        for (const element of [...batch]) {
            element.render();

            if (batch.delete(element)) {
                console.warn("%s: This element is requesting re-render from inside render().", element.tagName.toLowerCase());
            }
        }
    }

    pending = false;
}

function enqueue(target: SemanticElement) {
    batch.add(target);

    if (!pending) {
        pending = true;
        run();
    }
}

export type ContentRef = SemanticTemplate | Element | DocumentFragment;

export class SemanticElement extends HTMLElement {
    declare _cleanup?: (() => void)[];
    declare _promises?: Set<Promise<any>>;
    declare _reload?: boolean;

    get root(): HTMLElement | ShadowRoot {
        return this;
    }

    get pending() {
        const promises = this._promises;
        return promises ? !!promises.size : false;
    }

    get reload() {
        return this._reload !== false;
    }

    cleanup(fn: () => any) {
        const cleanup = this._cleanup;
        cleanup && cleanup.push(fn);
    }

    defer(promise: Promise<any>) {
        const promises = this._promises;
        promises && promises.add(promise);
    }

    keep(...models: any[]) {
        this.cleanup(() => models.length = 0);
    }

    request(template: ContentRef) {
        if (template instanceof Node) {
            loader.request(template);
        } else if (template.hot()) {
            const refresh = () => this.invalidate(true);
            template.addEventListener("change", refresh);
            this.cleanup(() => template.removeEventListener("change", refresh));
            loader.request(template.content);
        }

        if (!loader.ready()) {
            this.defer(loader.wait());
        }
    }

    observe<T extends EventTarget>(target: T): T["addEventListener"] {
        return (...args: any) => {
            (target as any).addEventListener(...args);
            this.cleanup(() => (target as any).removeEventListener(...args));
        };
    }

    invalidate(reload = false) {
        if (reload) {
            this._reload = true;
        }

        enqueue(this);
    }

    render() {
        if (!batch.delete(this)) {
            return false;
        }

        const cleanup = this._cleanup;
        cleanup && cleanup.forEach(x => x());
        this._cleanup = this._promises = undefined;

        if (!this.isConnected) {
            return false;
        }

        this._cleanup = [];
        const promises = this._promises = new Set();
        const helper = new EventTarget();
        helper.addEventListener("render", () => {
            if (this.update()) {
                this._reload = false;
            }
        });

        helper.dispatchEvent(new Event("render"));

        if (promises.size) {
            const ticket = new Promise<void>(x => this.cleanup(x));
            const list = [...promises].map(x => Promise.race([x, ticket]));
            const done = () => {
                if (this._promises === promises) {
                    this._promises = undefined;
                    this.invalidate();
                }
            };

            Promise.all(list).then(done, done);
            return false;
        }

        return true;
    }

    update() {
        return false;
    }

    connectedCallback() {
        enqueue(this);
    }

    disconnectedCallback() {
        enqueue(this);
    }

    adoptedCallback() {
        enqueue(this);
    }

    attributeChangedCallback() {
        enqueue(this);
    }
}

export function from(...list: ContentRef[]): typeof SemanticElement {
    for (const element of list) {
        const content = element instanceof Node ? element : element.content;
        loader.request(content);
    }    

    return class extends SemanticElement {
        update() {
            for (const element of list) {
                this.request(element);
            }
            
            if (this.pending) {
                return false;
            }

            if (this.reload) {
                const { root } = this;                
                root.innerHTML = "";    
                
                for (const element of list) {
                    const content = element instanceof Node ? element : element.content;
                    root.appendChild(content.cloneNode(true));
                }
            }

            return true;
        }
    };
}

export function fromShadow(...list: ContentRef[]): typeof SemanticElement {
    return class extends from(...list) {
        get root(): HTMLElement | ShadowRoot {
            if (!this.shadowRoot) {
                this.attachShadow({ mode: "open" });
            }

            return this.shadowRoot || this;
        }
    };
}



//
// WeakStore
//

const created = new WeakSet();
const reg = new FinalizationRegistry<() => any>(x => x());

export class WeakStore<K, T extends object> extends Map<K, WeakRef<T>> {
    create(key: K, factory: () => T) {
        let wr = this.get(key);
        if (wr) {
            const result = wr.deref();
            if (result) {
                created.delete(result);
                return result;
            }
        }

        const result = factory();
        created.add(result);

        this.set(key, wr = new WeakRef(result));
        reg.register(result, () => {
            if (this.get(key) === wr) {
                this.delete(key);
            }
        });

        return result;
    }

    deref(key: K) {
        return this.get(key)?.deref();
    }
}

export function newlyCreated(model: any) {
    return model && typeof model === "object" ? created.delete(model) : false;
}
