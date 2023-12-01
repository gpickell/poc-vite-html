declare module "#html-loader" {
    export namespace loader {
        class RequestEvent {
            readonly tag: string;
            constructor(tag: string);
            defer(): void;
        }

        export type { RequestEvent };

        export function addEventListener(type: "request", callback: (event: RequestEvent) => any): void;
        export function addEventListener(type: string, callback: () => any): void;

        export function removeEventListener(type: "request", callback: (event: RequestEvent) => any): void;
        export function removeEventListener(type: string, callback: () => any): void;

        export function dispatchEvent(e: Event): boolean;

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

    export type ContentRef = SemanticTemplate | Element | DocumentFragment;

    class RenderEvent<T> extends Event {
        readonly element: T;
        constructor(element: T);
    }

    export type { RenderEvent };

    export interface SemanticAddEventListener<T> {
        (type: "render", callback: (e: RenderEvent<T>) => any): void;
    }

    interface SemanticElementClassAddEventListener<C extends new () => any, T = InstanceType<C>> extends EventTarget {
        (type: "render", action: (e: RenderEvent<T>) => any): void;
        (type: string, action: () => any): void;
    }

    export class SemanticElement extends HTMLElement {
        static addEventListener<T>(this: new () => T, type: "render", action: (e: RenderEvent<T>) => any): void;
        static addEventListener(type: string, action: () => any): void;

        static removeEventListener<T>(this: new () => T, type: "render", action: (e: RenderEvent<T>) => any): void;
        static removeEventListener(type: string, action: () => any): void;

        static dispatchEvent(event: Event): boolean;

        protected readonly pending: boolean;
        protected readonly reload: boolean;
        protected readonly root: HTMLElement | ShadowRoot;

        protected cleanup(fn: () => any): void;
        protected defer(promise: Promise<any>): void;
        protected keep(...models: any[]): void;
        protected request(fn: ContentRef): void;

        protected observe<T extends typeof SemanticElement>(target: T): SemanticElementClassAddEventListener<T>;
        protected observe<T extends EventTarget>(target: T): T["addEventListener"];
        
        invalidate(): boolean;
        refresh(): boolean;
        render(): boolean;

        protected update(): boolean;
    }

    export function from(...list: ContentRef[]): typeof SemanticElement;
    export function fromShadow(...list: ContentRef[]): typeof SemanticElement;

    export class WeakStore<K, T extends object> {
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
    import { SemanticTemplate } from "#html-loader";

    const template: SemanticTemplate;
    export default template;
}
