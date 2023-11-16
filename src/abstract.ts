declare module "#html-loader" {
    export namespace loader {
        export function addEventListener(type: "import", callback: () => any): void;
        export function removeEventListener(type: "import", callback: () => any): void;
    
        export function defer(): void;
        export function next(): string;
        export function ready(): boolean;
        export function wait(): Promise<void>;
    
        export function request(hint: Element | DocumentFragment | string): boolean;    
    }

    export class SemanticTemplate extends EventTarget {
        readonly content: DocumentFragment;

        addEventListener(type: "change", action: () => any): void;
        removeEventListener(type: "change", action: () => any): void;

        hot(): boolean;
    }

    export type ContentRef = SemanticElement | Element | DocumentFragment;

    export class SemanticElement extends HTMLElement {
        protected readonly pending: boolean;
        protected readonly reload: boolean;
        protected readonly root: HTMLElement | ShadowRoot;

        protected cleanup(fn: () => any): void;
        protected defer(promise: Promise<any>): void;
        protected keep(...models: any[]): void;
        protected request(fn: ContentRef): void;
        protected observe<T extends EventTarget>(target: T): T["addEventListener"];
        
        invalidate(): boolean;
        refresh(): boolean;
        render(): boolean;

        protected update(): boolean;
    }

    export function from(...list: ContentRef[]): typeof SemanticElement;
    export function fromShadow(...list: ContentRef[]): typeof SemanticElement;

    class WeakStore<K, T extends object> extends Map<K, WeakRef<T>> {
        create(key: K, factory: () => T): T;
        deref(key: K): T | undefined;
    }

    export function newlyCreated(model: object): boolean;
}

declare module "*.html" {
    import { SemanticElement } from "#html-loader";

    const template: SemanticElement;
    export default template;
}
