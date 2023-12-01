const defer = Promise.resolve();

//
// loader
//

export namespace loader {
    function nop() {}

    const controller = new EventTarget();
    const transient = new EventTarget();
    const pending = new Set<string>();
    const queue = new Set<string>();
    const visit = new WeakSet();

    let promise = Promise.resolve();
    let resolve = nop;

    class RequestEvent extends Event {
        constructor(public readonly tag: string) {
            super("request", { cancelable: true });
        }

        defer() {
            this.stopImmediatePropagation();
            this.preventDefault();
        }
    }

    function attempt(target: EventTarget, tag: string) {
        if (queue.has(tag)) {
            const event = new RequestEvent(tag);
            target.dispatchEvent(event);

            if (event.defaultPrevented) {
                pending.add(tag);
                queue.delete(tag);            
            }
        }
    }

    export function addEventListener(type: string, callback: () => any) {
        if (type === "request") {
            controller.addEventListener(type, callback);
            transient.addEventListener(type, callback);

            for (const tag of queue) {
                defer.then(() => attempt(transient, tag));
            }

            defer.then(() => transient.removeEventListener(type, callback));
        }
    }

    export function removeEventListener(type: string, callback: () => any) {
        controller.removeEventListener(type, callback);
        transient.removeEventListener(type, callback);
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

        let e: Element | undefined;
        const iter = document.createNodeIterator(hint, 1);
        while (e = iter.nextNode() as Element | undefined) {
            request(e.tagName);
        }

        return ready();
    }

    export function wait() {
        return promise;
    }

    export function start(hint: HTMLTemplateElement | string = "template#main") {
        const template = typeof hint === "string" ? document.querySelector(hint) : hint;
        if (template instanceof HTMLTemplateElement) {
            request(template);

            const content = template.content.cloneNode(true);
            wait().then(() => document.body.append(content));
        }
    }
}



//
// SemanticTemplate
//

const empty = document.createDocumentFragment();

export class SemanticTemplate extends EventTarget {
    content = empty;

    hot() {
        return false;
    }

    update(html = "") {
        const root = document.createElement("template");
        root.innerHTML = html;
        this.content = root.content;

        if (this.hot()) {
            this.dispatchEvent(new Event("change"));
        }
    }
}



// 
// SemanticElement
//

let pending = false;
const batch = new Set<SemanticElement>();
const observers = new WeakMap<any, EventTarget>();

function run() {
    for (const element of [...batch]) {
        element.render();
    }

    if (batch.size) {
        defer.then(run);
    } else {
        pending = false;
    }
}

function enqueue(target: SemanticElement) {
    batch.add(target);

    if (!pending) {
        pending = true;
        defer.then(run);
    }
}

class RenderEvent<T> extends Event {
    constructor(public readonly element: T) {
        super("render");
    }
}

type ContentRef = SemanticTemplate | Element | DocumentFragment;

export class SemanticElement extends HTMLElement {
    #cleanup?: EventTarget;
    #promises?: Set<Promise<any>>;
    #reload?: boolean;

    static addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
        const target = observers.get(this) || new EventTarget();
        observers.set(this, target);
        target.addEventListener(...args);
    }

    static removeEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
        const target = observers.get(this);
        target && target.removeEventListener(...args);
    }

    static dispatchEvent(event: Event) {
        const target = observers.get(this);
        target && target.dispatchEvent(event);
    }

    get root(): HTMLElement | ShadowRoot {
        return this;
    }

    get pending() {
        const promises = this.#promises;
        return promises ? !!promises.size : false;
    }

    get reload() {
        return this.#reload !== false;
    }

    cleanup(fn: () => any) {
        this.#cleanup?.addEventListener("cleanup", fn);
    }

    defer(promise: Promise<any>) {
        const promises = this.#promises;
        promises && promises.add(promise);
    }

    keep(...models: any[]) {
        this.cleanup(() => models.length = 0);
    }

    request(template: ContentRef) {
        if (template instanceof Node) {
            loader.request(template);
        } else {
            loader.request(template.content);

            if (template.hot()) {
                const refresh = () => this.invalidate(true);
                template.addEventListener("change", refresh);
                this.cleanup(() => template.removeEventListener("change", refresh));
            }
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
            this.#reload = true;
        }

        enqueue(this);
    }

    render() {
        if (!batch.delete(this)) {
            return false;
        }

        this.#cleanup?.dispatchEvent(new Event("cleanup"));
        this.#cleanup = this.#promises = undefined;

        if (this.isConnected) {
            const promises = this.#promises = new Set();
            const helper = this.#cleanup = new EventTarget();
            helper.addEventListener("render", () => {          
                if (this.update()) {
                    this.#reload = false;
                }
            });

            helper.addEventListener("end", () => {
                if (promises.size) {
                    const ticket = new Promise<void>(x => this.cleanup(x));
                    const list = [...promises].map(x => Promise.race([x, ticket]));
                    const done = () => {
                        if (this.#promises === promises) {
                            this.#promises = undefined;
                            this.invalidate();
                        }
                    };
        
                    Promise.all(list).then(done, done);
                }
            });

            helper.dispatchEvent(new Event("render"));
            helper.dispatchEvent(new Event("end"));
        }

        const target = observers.get(this.constructor);
        target?.dispatchEvent(new RenderEvent(this));

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
        #root?: ShadowRoot;

        get root() {
            let root = this.#root;
            if (!root) {
                this.#root = root = this.attachShadow({ mode: "closed" });
            }

            return root;
        }
    };
}



//
// WeakStore
//

const reg = new FinalizationRegistry<() => any>(x => x());

export class WeakStore<K, T extends object> extends Map<K, Set<WeakRef<T>>> {
    clear() {
        for (const set of this.values()) {
            for (const ref of set) {
                reg.unregister(ref);
            }            
        }

        super.clear();
    }

    any(key: K) {
        return !!this.first(key);
    }

    all(key: K) {
        const results = new Set<T>();
        const set = this.get(key);
        if (!set) {
            return results;
        }

        let result: T | undefined;
        for (const ref of set) {
            if (result = ref.deref()) {
                results.add(result);
            }
        }

        return results;
    }

    first(key: K) {
        const set = this.get(key);
        if (!set) {
            return undefined;
        }

        let result: T | undefined;
        for (const ref of set) {
            if (result = ref.deref()) {
                return result;
            }
        }

        return undefined;
    }

    last(key: K) {
        const set = this.get(key);
        if (!set) {
            return undefined;
        }

        let result: T | undefined;
        for (const ref of set) {
            result = ref.deref() || result;
        }

        return result;
    }

    add(key: K, value: T) {
        const ref = new WeakRef(value);
        const set = this.get(key) || new Set();
        this.set(key, set);
        set.add(ref);
        reg.register(value, () => {
            console.log("--- fin");
            if (this.get(key) === set && set.delete(ref) && set.size < 1) {
                super.delete(key);
            }
        }, ref);

        return ref;
    }

    ref(key: K, value: T) {
        const set = this.get(key);
        if (!set) {
            return undefined;
        }

        for (const ref of set) {
            if (ref.deref() === value) {
                return ref;
            }
        }

        return undefined;
    }

    define(key: K, factory: () => T) {
        let result = this.first(key);
        if (!result) {
            result = factory();
            this.add(key, result);
        }

        return result;
    }

    delete(key: K, value?: T | WeakRef<T>) {
        const set = this.get(key);
        if (!set) {
            return false;
        }

        if (!value) {
            for (const ref of set) {
                reg.unregister(ref);
            }

            return super.delete(key);
        }

        if (value instanceof WeakRef) {
            if (!set.delete(value)) {
                return false;
            }

            if (set.size < 1) {
                super.delete(key);
            }

            reg.unregister(value);
            return true;
        }
     
        for (const ref of set) {
            if (ref.deref() === value && set.delete(ref)) {
                if (set.size < 1) {
                    super.delete(key);
                }

                reg.unregister(value);
                return true;    
            }
        }

        return false;
    }
}
