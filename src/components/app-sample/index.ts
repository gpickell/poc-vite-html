import layout from "./layout.html";
import { WeakStore, fromShadow } from "#html-loader";
import Model from "../../Model";

const reg = new WeakStore<string, AppSampleModel>();

export class AppSampleModel extends Model {
    state = "state3";
}

class AppSample extends fromShadow(layout) {
    protected update() {
        if (!super.update()) {
            return false;
        }

        // From here, all we have to do is touch up the DOM.
        const key = this.getAttribute("key") || "default";
        const model = reg.create(key, () => new AppSampleModel());
        const { classList } = this;
        for (const cls of classList) {
            if (cls[0] === "_") {
                classList.remove(cls);
            }
        }

        classList.add("_" + model.state);
        this.observe(model)("change", () => this.invalidate());

        for (const input of this.root.querySelectorAll("input")) {
            input.value = model.state;

            this.observe(input)("input", () => {
                model.state = input.value;
                model.trigger();
            });
        }

        for (const button of this.root.querySelectorAll("button")) {
            this.observe(button)("click", () => {
                model.state = button.id || "state3";
                model.trigger();
            });
        }

        return true;
    }
}

export default AppSample;
