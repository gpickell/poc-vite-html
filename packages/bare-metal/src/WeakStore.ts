
const reg = new FinalizationRegistry<() => any>(x => x());

class WeakStore<K, T extends object> extends Map<K, Set<WeakRef<T>>> {
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

export default WeakStore;
