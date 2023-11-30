import layout from "./layout.html";
import { fromShadow } from "#html-loader";

class AppEditor extends fromShadow(layout) {
    private _load?: boolean;
    private _save?: boolean;

    protected update() {
        if (!super.update()) {
            return false;
        }

        const path = "src/components/app-main/layout.html";
        if (this._load !== false) {
            const load = async () => {
                let text = "";
                const res = await fetch(`/api/editor?${path}`).catch(() => {});
                if (res && res.ok) {
                    text = await res.text();
                }

                for (const textarea of this.root.querySelectorAll("textarea")) {
                    textarea.disabled = false;
                    textarea.value = text;
                }
            };

            this._load = false;
            load();
        }

        for (const textarea of this.root.querySelectorAll("textarea")) {
            textarea.disabled = this._load !== false;

            this.observe(textarea)("input", () => {
                const save = async () => {
                    this._save = true;

                    while (this._save) {
                        this._save = false;

                        const promise = fetch(`/api/editor?${path}`, {
                            method: "POST",
                            body: textarea.value,
                        });

                        await promise.catch(() => {});
                    }

                    this._save = undefined;
                };

                if (this._save === undefined) {
                    save();
                } else {
                    this._save = true;
                }
            });
        }

        return true;
    }
}

export default AppEditor;
