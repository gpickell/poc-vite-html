import layout from "./layout.html";
import { WeakStore, fromShadow } from "#html-loader";

import Map from "@arcgis/core/Map";
import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";

//import esriConfig from "@arcgis/core/config";
//esriConfig.apiKey = "YOUR_API_KEY";

const store = new WeakStore<string, AppWebMap>();

class AppWebMap extends fromShadow(layout) {
    private _map?: Map | WebMap;
    private _mapView?: MapView;

    get viewpoint() {
        return this._mapView?.viewpoint;
    }

    protected update() {
        if (!super.update()) {
            return false;
        }
        
        const name = this.getAttribute("name") || "main";
        store.set(name, this);

        if (!this._map) {
            this._map = new WebMap({
                portalItem: {
                    id: this.getAttribute("web-map-id") || ""
                }
            });
        }

        if (!this._mapView) {
            const view = this._mapView = new MapView({
                container: this.root.querySelector("#map") as any,
                map: this._map,
            });

            view.watch("viewpoint", () => {
                this.dispatchEvent(new Event("viewpoint-change"));
            });
        }

        return true;
    }

    static find(name: string) {
        return store.get(name);
    }
}

export default AppWebMap;
