export type Span = `${number} ${number}`;

export interface Annotations {
    name?: string;
    info?: string;
    px?: string;
    indent?: Span;
    span?: Span;
}

export interface Method extends Annotations {
    id: string;
    vars?: VarSpec[];
    body?: Sequence[];
}

export interface Sequence {
    id: number;
    steps?: Step[];
}

export type Mode = "&&" | "||";
export type Edge = `${number} ${Mode}`;

export interface Step extends Annotations {
    code?: string;
    assign?:string;
    fail?: Edge;
    last?: Edge;
    next?: Edge;
}

export interface VarSpec {
    name: string;
    type?: string;
    init?: boolean | number | string;
}
