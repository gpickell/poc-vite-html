interface Model {
    addEventListener(type: "change", action: () => any): void;
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions | undefined): void;

    removeEventListener(type: "change", action: () => any): void;
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions | undefined): void;
}

class Model extends EventTarget {
    trigger() {
        this.dispatchEvent(new Event("change"));
    }
}

export default Model;
