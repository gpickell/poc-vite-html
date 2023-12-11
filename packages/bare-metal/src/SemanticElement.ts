/// <reference path="builder/env.ts" />
import Loader, { CustomElements, RenderEvent } from "./Loader";

let pending = false;
const batch = new Map<SemanticElement, () => void>();
const defer = Promise.resolve();

function run() {
    for (const render of [...batch.values()]) {
        render();
    }

    if (batch.size) {
        defer.then(run);
    } else {
        pending = false;
    }
}

function enqueue(target: SemanticElement, fn: () => void) {
    batch.set(target, fn);

    if (!pending) {
        pending = true;
        defer.then(run);
    }
}

class SemanticElement extends HTMLElement {
    #cleanup?: EventTarget;
    #promises?: Set<Promise<any>>;
    #reload?: boolean;

    #render() {
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

        Loader.dispatchEvent(new RenderEvent(this));

        return true;        
    }

    protected get root(): HTMLElement | ShadowRoot {
        return this;
    }

    protected get pending() {
        const promises = this.#promises;
        return promises ? !!promises.size : false;
    }

    protected get reload() {
        return this.#reload !== false;
    }

    protected cleanup(fn: () => any) {
        this.#cleanup?.addEventListener("cleanup", fn);
    }

    protected defer(promise: Promise<any>) {
        const promises = this.#promises;
        promises && promises.add(promise);
    }

    protected keep(...models: any[]) {
        this.cleanup(() => models.length = 0);
    }

    protected request<K extends keyof CustomElements>(hint: K): CustomElements[K] | undefined;
    protected request(hint: string): typeof HTMLElement | undefined;
    protected request(template: ContentRef): boolean;

    protected request(hint: ContentRef | string) {
        const result = Loader.request(hint);
        if (typeof hint === "object" && hint.hot) {
            this.observe(hint)("hot-update", () => {
                this.invalidate(true);
            });
        }

        if (!Loader.ready()) {
            this.defer(Loader.wait());
        }

        return result;
    }

    protected observe<T extends EventTarget>(target: T): T["addEventListener"] {
        return (...args: any) => {
            (target as any).addEventListener(...args);
            this.cleanup(() => (target as any).removeEventListener(...args));
        };
    }

    protected update() {
        return false;
    }

    protected connectedCallback() {
        this.invalidate();
    }

    protected disconnectedCallback() {
        this.invalidate();
    }

    protected adoptedCallback() {
        this.invalidate();
    }

    protected attributeChangedCallback() {
        this.invalidate();
    }

    invalidate(reload = false) {
        if (reload) {
            this.#reload = true;
        }
        
        enqueue(this, () => this.#render());
    }

    render() {
        return this.#render();
    }
}

type ContentRef = Element | DocumentFragment;

function from(...list: ContentRef[]): typeof SemanticElement {
    for (const element of list) {
        Loader.request(element);
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
                    root.appendChild(element.cloneNode(true));
                }
            }

            return true;
        }
    };
}

function fromShadow(...list: ContentRef[]): typeof SemanticElement {
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

export { from, fromShadow };
export default SemanticElement;
export type { ContentRef };
