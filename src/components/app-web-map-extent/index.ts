import Loader from "@tsereact/bare-metal/Loader";
import layout from "./layout.html";
import { fromShadow } from "@tsereact/bare-metal/SemanticElement";

class AppWebMapExtent extends fromShadow(layout) {
    get name() {
        return this.getAttribute("name") || "main";
    }

    protected update() {        
        if (!super.update()) {
            return false;
        }

        const AppWebMap = this.request("app-web-map");
        if (!AppWebMap) {
            return true;
        }

        const text: string[] = [];
        for (const map of AppWebMap.find(this.name)) {
            const extent = map.extent;
            if (extent) {
                text.push(JSON.stringify(extent, undefined, 2));
            }

            this.observe(map)("viewpoint-change", () => {
                this.invalidate();
            });
        }

        const div = this.root.querySelector("#details")!;
        div.innerHTML = "";
        div.append(text.join("\n"));

        this.observe(Loader)("render:app-web-map", ({ element }) => {
            if (element.name === this.name) {
                this.invalidate();
            }
        });

        return true;
    }
}

export default AppWebMapExtent;
