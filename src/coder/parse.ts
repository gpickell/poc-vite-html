import type * as swc from "@swc/wasm";
import { Method, Sequence, Step, VarSpec } from "./types";

interface ClassMethod extends Node {
    type: "ClassMethod";
}

interface FunctionDeclaration extends Node {
    type: "FunctionDeclaration";
}

interface Identifier extends Node {
    type: "Identifier";
    value: string;
}

interface NumericLiteral extends Node {
    type: "NumericLiteral";
    value: number;
}

interface SwitchCase extends Node {
    type: "SwitchCase";

    test: {
        value: number;
    };

    consequent: Node[];
}

interface VariableDeclarator extends Node {
    type: "VariableDeclarator";

    id: {
        value: string;
        typeAnnotation?: Node;
    };

    init?: {
        value?: boolean | number | string;
    };
}

interface BinaryExpression {
    operator: string;
}

interface Visitor {
    ClassMethod?(node: ClassMethod): any | void;
    FunctionDeclaration?(node: FunctionDeclaration): any | void;
    SwitchCase?(node: SwitchCase): any | void;
    VariableDeclarator?(node: VariableDeclarator): any | void;
    ConditionalExpression?(node: Node): any | void;
    IfStatement?(node: Node): any | void;
    Identifier?(node: Identifier): any | void;
    BinaryExpression?(node: BinaryExpression): any | void;
    AssignmentExpression?(node: Node): any | void;
    ParenthesisExpression?(node: Node): any | void;
    NumericLiteral?(node: NumericLiteral): any | void;

    default?(node: Node): any | void;
}

export interface Node extends swc.Node, swc.HasSpan {
    [name: string]: unknown;
    comment?: string;
    prefix?: string;
    nodes: Node[];
}

function reparse(root: Partial<Node>, text: string) {
    const list: Node[] = [];
    const lists = [list];
    const stack: [Node[], Partial<Node>][] = [[list, root]];
    while (stack.length) {
        const [list, node] = stack.pop()!;
        const { type, span, ...rest } = node;
        let nodes = list;
        if (typeof type === "string" && span) {
            lists.push(node.nodes = nodes = []);
            list.push(node as Node);
        }

        for (const key in rest) {
            const value = rest[key];
            if (value && typeof value === "object") {
                if (Array.isArray(value)) {
                    value.forEach(x => stack.push([nodes, x]));
                } else {
                    stack.push([nodes, value]);
                }
            }
        }
    }

    const sorter = (a: Node, b: Node) => {
        const x = a.span;
        const y = b.span;
        if (x.start < y.start) {
            return -1;
        }

        if (x.start > y.start) {
            return 0;
        }

        if (x.end > y.end) {
            return -1;
        }

        if (x.end > y.end) {
            return 1;
        }

        return 0;
    };

    for (const list of lists) {
        list.sort(sorter);
    }

    const result = lists.flat();
    result.sort(sorter);

    for (const { span } of result) {
        --span.start;
        --span.end;
    }

    let last = { start: 0, end: 0 };
    const cx = /^.*?(?=\/\*|\/\/|$)/s;
    const lx = /.*\n/s;
    const sx = /\S+/g;
    for (const node of result) {
        const { span: next } = node;
        const end = last.end > next.start ? last.start : last.end;
        let prefix = text.substring(end, next.start);
        const comment = prefix.replace(cx, "");
        if (comment) {
            node.comment = comment;
        }

        prefix = prefix.replace(lx, "");
        prefix = prefix.replace(sx, "");
        if (prefix) {
            node.prefix = prefix;
        }

        last = next;
    }

    return result;
}

function walk(root: Node, visitor: Visitor) {
    function def() {
        return true;
    }

    const stack = [root];
    const { push } = stack;
    while (stack.length > 0) {
        const node = stack.pop()!;
        const fn = (visitor as any)[node.type] || visitor.default || def;
        if (fn(node)) {
            const nodes = node.nodes.slice().reverse();
            push.apply(stack, nodes);
        }
    }
}

const cfx = /^codeflow (\S+) (.+)/;
const mdx = /^(\S+) (.*)/;
const slashx = /(\/+\*+|\*+\/+)/g;
const cleanx = /(^[/*\s]*|[/*\s]*$)/g;
const spacex = /\s+/g;
const indentx = /\n( +)\S/;
const headx = /.*\n/;
const linex = /\s*\n/g;

function format(code: string, hint: string) {
    hint = hint.replace(headx, "");
    
    let lines = code.trim().split("\n");
    lines = lines.map(x => x.startsWith(hint) ? x.substring(hint.length) : x);

    return lines.join("\n");
}

function extractIndent(code: string, prefix?: string) {
    const m = code.match(indentx);
    const f = m ? m[1].length : 0;    
    const s = prefix ? prefix.length : 0;
    return `${f} ${s}`;
}

function extractComments(text: string) {
    return text.split("@").map(x => {
        x = x.replace(slashx, " ");
        x = x.replace(cleanx, " ");
        x = x.replace(spacex, " ");
        return x.trim();
    });
}

function extractHeaders(text: string) {
    const comments = extractComments(text);
    comments.shift();

    const result: Record<string, string | undefined> = Object.create(null);
    for (const part of comments) {
        const match = part.match(cfx);
        if (match) {
            const [, which, tail] = match;
            const value = result[which];
            result[which] = value ? `${value} ${tail}` : tail;
        }
    }

    return result;
}

function extractAnnotations(text: string) {
    const comments = extractComments(text);
    const result: Record<string, string | undefined> = Object.create(null);
    result.info = comments.shift() || undefined;

    for (const part of comments) {
        const match = part.match(mdx);
        if (match) {
            const [, which, tail] = match;
            const value = result[which];
            result[which] = value ? `${value} ${tail}` : tail;
        }
    }

    const { name, info, px } = result;
    return { name, info, px };
}

function parseDecision(node: Node) {
    let i = 0;
    let fail = false;
    let mode = "";
    let type = "";
    let value = 0;
    function push(x = -1) {
        if (fail || i++ !== x) {
            fail = true;
            return false;
        }

        return true;
    }

    walk(node, {
        BinaryExpression(node) {
            switch (node.operator) {
                case "||":
                case "&&":
                    mode = node.operator;
                    return push(0);
            }

            return push();
        },

        ParenthesisExpression() {
            return push(2);
        },

        AssignmentExpression() {
            return push(3);
        },

        NumericLiteral(node) {
            value = node.value;
            return push(5);
        },

        Identifier(node) {
            switch (node.value) {
                case "$test":
                    return push(1);

                case "$fail":
                case "$last":
                case "$next":
                    type = node.value;
                    return push(4);
            }

            return push();
        },

        default() {
            return push();
        }
    });

    if (fail) {
        return undefined;
    }

    type = type.substring(1);

    const step: Step = { [type]: `${value} ${mode}` };
    return step;
}

function parseAssignment(node: Node): [string, Node] {
    let i = 0;
    let fail = false;
    let name = "";
    let inner = node;
    function push(x = -1) {
        if (fail || i++ !== x) {
            fail = true;
            return false;
        }

        return true;
    }

    walk(node, {
        AssignmentExpression() {
            return push(0);
        },

        Identifier(node) {
            name = node.value;
            return push(1);
        },

        default(node) {
            inner = node;
        }
    });

    if (fail) {
        return ["", node];
    }

    return [name, inner];
}

function parseMethod(node: ClassMethod | FunctionDeclaration, code: string) {
    const { comment } = node;
    const { id, name, info } = extractHeaders(comment || "");
    if (id && name) {
        const indent = extractIndent(code, node.prefix || "") as any;
        const { start, end } = node.span;
        const span = `${start} ${end}` as any;
        const body: Sequence[] = [];
        const vars: VarSpec[] = [];
        const method: Method = { id, name, info, indent, span };
        walk(node, {
            SwitchCase({ test, consequent }) {
                const steps: Step[] = [];
                const seq = { id: test.value, steps };
                for (const node of consequent) {
                    if (node.type === "BreakStatement") {
                        break;
                    }

                    let inner = node;
                    if (inner.type === "ExpressionStatement") {
                        inner = inner.nodes[0];
                    }

                    let step = parseDecision(inner);
                    if (!step) {
                        let assign = "";
                        [assign, inner] = parseAssignment(inner);

                        const { start, end } = inner.span;
                        const expr = format(code.substring(start, end), node.prefix || "");
                        step = { code: expr, assign: assign || undefined };
                    }

                    Object.assign(step, extractAnnotations(node.comment || ""));
                    steps.push(step);
                }

                if (steps.length > 0) {
                    body.push(seq);                    
                }
            },

            VariableDeclarator({ id, init }) {
                const { value: name } = id;
                if (name[0] !== "$") {
                    const spec: VarSpec = { name };   
                    vars.push(spec);

                    const type = id.typeAnnotation;
                    if (type) {
                        const nodes = [...type.nodes];
                        const { start } = nodes[0].span;
                        const { end } = nodes.pop()!.span;
                        spec.type = code.substring(start, end);
                    }

                    const value = init?.value;
                    switch (typeof value) {
                        case "boolean":
                        case "number":
                        case "string":
                            spec.init = value;
                            break;
                    }
                }
            },
        });

        if (vars.length) {
            method.vars = vars;
        }

        if (body.length) {
            method.body = body;
        }

        return method;
    }

    return undefined;
}

function validate(node: Node) {
    let result = true;
    walk(node, {


        default() {
            return result;
        }
    });

    return result;
}

export function parse(code: string, parseCode: typeof swc.parseSync): [Method[], string] {
    code = code.replace(linex, "\n");

    const file = parseCode(code, {
        syntax: "typescript",
        target: "es2022",
        comments: true,
        decorators: true,
        dynamicImport: true,
        script: false,
        tsx: true,
    });

    const methods: Method[] = [];
    const [root] = reparse(file as any, code);
    if (!validate(root)) {
        throw new Error("");
    }

    walk(root, {
        ClassMethod(node) {
            const method = parseMethod(node, code);
            method && methods.push(method);
        },

        FunctionDeclaration(node) {
            const method = parseMethod(node, code);
            method && methods.push(method);
        }
    });

    return [methods, code];
}

export function update(code: string, type: string) {

}

export default parse;
