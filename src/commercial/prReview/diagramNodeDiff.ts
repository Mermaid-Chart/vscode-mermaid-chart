/**
 * Pure, testable utilities for diffing Mermaid diagram source at the
 * node-identifier level. Slice 2 uses this to highlight nodes that exist in
 * the new (post-bot) source but not the old one.
 *
 * This is a lightweight heuristic — not a full Mermaid parser. The goal is to
 * cover the common single-change case (flowcharts, sequence diagrams,
 * class/state diagrams). Layout-only restructures are explicitly out of
 * scope for Slice 2 and handled by Slice 4 next quarter.
 */

const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
    "flowchart",
    "graph",
    "subgraph",
    "end",
    "direction",
    "LR",
    "RL",
    "TB",
    "BT",
    "TD",
    "style",
    "classDef",
    "class",
    "linkStyle",
    "click",
    "callback",
    "call",
    "sequenceDiagram",
    "participant",
    "actor",
    "note",
    "loop",
    "alt",
    "opt",
    "par",
    "rect",
    "activate",
    "deactivate",
    "autonumber",
    "stateDiagram",
    "stateDiagram-v2",
    "classDiagram",
    "erDiagram",
    "Note",
    "Title",
    "title",
    "as",
    "over",
    "left",
    "right",
    "of",
    "and",
]);

/**
 * Extract the set of node identifiers referenced in a Mermaid source string.
 *
 * Strategy: strip front-matter, strip label content between bracket pairs
 * (`[`, `(`, `{`), then collect any remaining word-form identifiers that
 * aren't reserved keywords. Comment lines are ignored.
 */
export function extractNodeIds(source: string): Set<string> {
    const ids = new Set<string>();

    const withoutFrontmatter = stripFrontMatter(source);

    for (const rawLine of withoutFrontmatter.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("%%") || line.startsWith("#")) {
            continue;
        }

        const stripped = stripLabelContent(line);

        const tokenRegex = /\b[A-Za-z_][A-Za-z0-9_-]*\b/g;
        let match: RegExpExecArray | null;
        while ((match = tokenRegex.exec(stripped)) !== null) {
            const token = match[0];
            if (RESERVED_KEYWORDS.has(token)) {
                continue;
            }
            if (/^\d+$/.test(token)) {
                continue;
            }
            ids.add(token);
        }
    }

    return ids;
}

export interface DiagramNodeDiff {
    addedNodeIds: string[];
    removedNodeIds: string[];
}

/**
 * Symmetric set difference of node identifiers between two diagram sources.
 * Slice 2 only consumes `addedNodeIds`; `removedNodeIds` is exposed so Slice 4
 * (next quarter) can layer the ghost / removed treatment on top.
 */
export function diffNodes(
    oldSource: string,
    newSource: string,
): DiagramNodeDiff {
    const oldIds = extractNodeIds(oldSource);
    const newIds = extractNodeIds(newSource);

    const added: string[] = [];
    for (const id of newIds) {
        if (!oldIds.has(id)) {
            added.push(id);
        }
    }

    const removed: string[] = [];
    for (const id of oldIds) {
        if (!newIds.has(id)) {
            removed.push(id);
        }
    }

    return { addedNodeIds: added, removedNodeIds: removed };
}

function stripFrontMatter(source: string): string {
    if (!source.startsWith("---")) {
        return source;
    }
    const end = source.indexOf("\n---", 3);
    if (end === -1) {
        return source;
    }
    return source.slice(end + 4);
}

/**
 * Replace the contents of `[...]`, `(...)`, `{...}`, `|...|`, and quoted
 * strings with spaces so identifiers inside labels don't get counted as node
 * references.
 *
 * Single-pass scanner — handles nested same-type brackets greedily because
 * Mermaid label syntax doesn't nest meaningfully for our purposes. Pipe
 * characters open and close edge labels (e.g. `A -->|yes| B`).
 */
function stripLabelContent(line: string): string {
    const chars = Array.from(line);
    const out: string[] = [];
    let depth = 0;
    let inQuote: '"' | "'" | null = null;
    let inPipe = false;

    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];

        if (inQuote) {
            if (ch === inQuote) {
                inQuote = null;
            }
            out.push(" ");
            continue;
        }

        if (ch === '"' || ch === "'") {
            inQuote = ch;
            out.push(" ");
            continue;
        }

        if (ch === "|") {
            inPipe = !inPipe;
            out.push(" ");
            continue;
        }

        if (ch === "[" || ch === "(" || ch === "{") {
            depth++;
            out.push(" ");
            continue;
        }

        if (ch === "]" || ch === ")" || ch === "}") {
            depth = Math.max(0, depth - 1);
            out.push(" ");
            continue;
        }

        out.push(depth > 0 || inPipe ? " " : ch);
    }

    return out.join("");
}
