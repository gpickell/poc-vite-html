type EventHint<T> = {
    [P in keyof T]: keyof T[P];
}[keyof T];

type EventType<T, K> = {
    [P in keyof T]: K extends keyof T[P] ? T[P][K] extends Event ? T[P][K] : Event : never;
}[keyof T];

export interface EventHandler<T, K> {
    (event: EventType<T, K>): void;
}

export interface EventHandlerObject<T, K> {
    handleEvent(event: EventType<T, K>): void;
}

export interface EventTargetTyped<T> extends EventTarget {
    addEventListener<K extends EventHint<T>>(type: K, handler: EventHandler<T, K>, options?: boolean | AddEventListenerOptions): void;
    addEventListener<K extends EventHint<T>>(type: K, handler: EventHandlerObject<T, K>, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, handler: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;

    removeEventListener<K extends EventHint<T>>(type: K, handler: EventHandler<T, K>, options?: boolean | EventListenerOptions): void;
    removeEventListener<K extends EventHint<T>>(type: K, handler: EventHandlerObject<T, K>, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, handler: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
    
    // dispatchEvent(event: Extract< Event>): boolean;
    dispatchEvent(event: Event): boolean;
}

export default EventTargetTyped;
