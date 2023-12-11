import * as monaco from "monaco-editor";

async function loadWorkerClass(label: string) {
    switch (label) {
        case "json":
            return import("monaco-editor/esm/vs/language/json/json.worker?worker");

        case "css":
        case "scss":
        case "less":
            return import("monaco-editor/esm/vs/language/css/css.worker?worker");

        case "html":
        case "handlebars":
        case "razor":
            return import("monaco-editor/esm/vs/language/html/html.worker?worker");

        case 'typescript':
        case 'javascript':
            return import("monaco-editor/esm/vs/language/typescript/ts.worker?worker");
    }

    return import("monaco-editor/esm/vs/editor/editor.worker?worker");
}

self.MonacoEnvironment = {
	async getWorker(_workerId: string, label: string) {
        const { default: Worker } = await loadWorkerClass(label);
        return new Worker();
	}
};

const div = document.createElement("div");
document.body.append(div);

document.body.setAttribute("style", "background-color: black");
div.setAttribute("style", "position: absolute; left: 1rem; top: 1rem; right: 1rem; bottom: 1rem; background-color: black");

const editor = monaco.editor.create(div, {
	value: "function hello() {\n    alert('Hello world!');\n}",
	language: 'javascript',
    theme: "Dark"
});

const style = document.createElement("style");
style.append(`
    .evil {
        background-color: #fcc;
    }

    .good {
        background-color: #cfc;
    }
`);

document.body.append(style);

const zone1 = document.createElement("div");
zone1.append("test");

/*editor.changeViewZones(x => {
    x.addZone({
        afterLineNumber: 1,
        domNode: zone1
    });
});*/

const decs = editor.createDecorationsCollection();

let last = 3;
function updateDecs() {
    decs.set([
        {
            range: new monaco.Range(1, 1, 1, 1),
            options: {
                isWholeLine: true,
                className: "evil",
            },        
        },
        {
            range: new monaco.Range(2, 1, last - 1, 1),
            options: {
                isWholeLine: true,
                className: "good",
            },
        },
        {
            range: new monaco.Range(last, 1, last, 1),
            options: {
                isWholeLine: true,
                className: "evil"
            },        
        }
    ]);
}

updateDecs();

function updateReadOnly() {
    let readOnly = true;
    const range = editor.getModel()?.getFullModelRange();
    const selection = editor.getSelection();
    if (range && selection) {
        readOnly = false;

        if (selection.startLineNumber < 2) {
            readOnly = true;
        }
    
        if (selection.endLineNumber > range.endLineNumber - 1) {
            readOnly = true;
        }
    }

    editor.updateOptions({ readOnly });
}

function updateLast() {
    const range = editor.getModel()!.getFullModelRange();
    last = range.endLineNumber;
}

let id = 0;
editor.onDidChangeModelContent(e => {
    if (e.isUndoing) {
        return;
    }

    let bad = false;
    for (const { range: selection } of e.changes) {
        if (selection.startLineNumber < 2) {
            bad = true;
        }
    
        if (selection.endLineNumber >= last) {
            bad = true;
        }
    }

    if (bad) {
        editor.trigger("myapp", "undo", null);
    }

    updateLast();
    updateDecs();
});


//editor.onDidChangeCursorSelection(updateReadOnly);
