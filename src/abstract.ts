declare module "#html-loader" {
    export namespace loader {
        export function addEventListener(type: "import", callback: () => any): void;
        export function removeEventListener(type: "import", callback: () => any): void;
    
        export function defer(): void;
        export function next(): string;
        export function ready(): boolean;
        export function wait(): Promise<void>;
    
        export function request(hint: Element | DocumentFragment | string): boolean;    
        export function start(): void;
    }

    export class SemanticTemplate extends EventTarget {
        readonly content: DocumentFragment;

        addEventListener(type: "change", action: () => any): void;
        removeEventListener(type: "change", action: () => any): void;

        hot(): boolean;
    }

    export type ContentRef = SemanticElement | Element | DocumentFragment;

    export class RenderEvent<T> extends Event {
        readonly element: T;
        constructor(element: T);
    }

    export interface SemanticAddEventListener<T> {
        (type: "render", callback: (e: RenderEvent<T>) => any): void;
    }

    export class SemanticElement extends HTMLElement {
        protected readonly pending: boolean;
        protected readonly reload: boolean;
        protected readonly root: HTMLElement | ShadowRoot;

        protected cleanup(fn: () => any): void;
        protected defer(promise: Promise<any>): void;
        protected keep(...models: any[]): void;
        protected request(fn: ContentRef): void;
        protected observe<T extends typeof SemanticElement>(target: T): SemanticAddEventListener<InstanceType<T>>;
        protected observe<T extends EventTarget>(target: T): T["addEventListener"];
        
        invalidate(): boolean;
        refresh(): boolean;
        render(): boolean;

        protected update(): boolean;
    }

    export function from(...list: ContentRef[]): typeof SemanticElement;
    export function fromShadow(...list: ContentRef[]): typeof SemanticElement;

    class WeakStore<K, T extends object> {
        all(key: K): Set<T>;
        any(key: K): boolean;
        first(key: K): T | undefined;
        last(key: K): T | undefined;
        ref(key: K, value: T): WeakRef<T> | undefined;

        clear(): void;
        add(key: K, value: T): WeakRef<T>;
        define(key: K, factory: () => T): T;
        delete(key: K, value?: T | WeakRef<T> | false): boolean;

        keys(): Iterable<K>;
    }
}

declare module "*.html" {
    import { SemanticElement } from "#html-loader";

    const template: SemanticElement;
    export default template;
}
