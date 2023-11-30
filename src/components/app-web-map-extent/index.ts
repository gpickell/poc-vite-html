import layout from "./layout.html";
import { fromShadow } from "#html-loader";
import AppWebMap from "../app-web-map";

class AppWebMapExtent extends fromShadow(layout) {
    get name() {
        return this.getAttribute("name") || "main";
    }

    protected update() {        
        if (!super.update()) {
            return false;
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
        div.append(document.createTextNode(text.join("\n")));

        this.observe(AppWebMap)("render", ({ element }) => {
            if (element.name === this.name) {
                this.invalidate();
            }
        });

        return true;
    }
}

export default AppWebMapExtent;
