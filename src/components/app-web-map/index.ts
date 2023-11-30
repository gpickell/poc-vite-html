import layout from "./layout.html";
import { WeakStore, fromShadow } from "#html-loader";

import Map from "@arcgis/core/Map";
import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";

//import esriConfig from "@arcgis/core/config";
//esriConfig.apiKey = "YOUR_API_KEY";

const reg = new FinalizationRegistry<() => void>(x => x());
const store = new WeakStore<string, AppWebMap>();

class MapRef {
    readonly container: HTMLDivElement;
    readonly map: Map | WebMap;
    readonly view: MapView;

    readonly itemId: string;
    readonly portalUrl?: string;

    constructor(owner: AppWebMap, host: HTMLElement | ShadowRoot) {
        const itemId = this.itemId = owner.itemId;
        const portalUrl = this.portalUrl = owner.portalUrl;
        const container = this.container = document.createElement("div");
        container.id = "map";
        host.append(container);

        const map = this.map = new WebMap({
            portalItem: {
                id: itemId,
                portal: portalUrl && { url: portalUrl } || undefined,
            }
        });

        const view = this.view = new MapView({ container, map });
        reg.register(this, () => {
            map.destroy();
            view.destroy();
        });
    }

    hoist(owner: AppWebMap, host: HTMLElement | ShadowRoot) {
        if (this.itemId !== owner.itemId) {
            return false;
        }

        if (this.portalUrl !== owner.portalUrl) {
            return false;
        }

        const { container } = this;
        if (container.parentNode === host) {
            return true;
        }

        if (container.parentNode) {
            return false;
        }

        host.append(this.container);
        return true;
    }

    destroy() {
        reg.unregister(this);
        this.map.destroy();
        this.view.destroy();
    }
}

class AppWebMap extends fromShadow(layout) {
    #map?: MapRef
    #ref?: WeakRef<AppWebMap>;

    #createMap() {
        let map = this.#map;
        if (map && map.hoist(this, this.root)) {
            return map;
        }

        if (map) {
            map.destroy();
            this.#map = undefined;
        }

        for (const other of store.all(this.name)) {
            map = other.#map;

            if (map && map.hoist(this, this.root)) {
                other.#map = undefined;
                return this.#map = map;
            }
        }

        return this.#map = new MapRef(this, this.root);
    }

    get extent() {
        return this.#map?.view.extent;
    }

    get name() {
        return this.getAttribute("name") || "main";
    }

    get itemId() {
        return this.getAttribute("item-id") || "";
    }

    get portalUrl() {
        return this.getAttribute("portal-url") || undefined;
    }

    protected update() {        
        if (!super.update()) {
            return false;
        }

        const { name } = this;
        const map = this.#createMap();
        const ref = this.#ref || (this.#ref = store.add(name, this));
        const { view } = map;
        const watcher = view.watch("viewpoint", () => {
            this.dispatchEvent(new Event("viewpoint-change"));
        });

        this.cleanup(() => {
            watcher.remove();

            if (!this.isConnected || name !== this.name) {
                map.container.remove();
            }

            if (name !== this.name) {
                store.delete(name, ref);
                this.#ref = undefined;
            }
        });

        return true;
    }

    static find(name: string) {
        const result = store.all(name);
        result.forEach(x => x.isConnected || result.delete(x));
        return result;
    }
}

export default AppWebMap;
