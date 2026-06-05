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

export type DiagramChangeKind = "added" | "modified" | "removed";

export interface DiagramChangeItem {
    kind: DiagramChangeKind;
    nodeId: string;
    label: string;
}

/** Optional node focus when opening app-review vscode.diff from View code. */
export interface DiagramCodeDiffFocus {
    nodeId: string;
    kind?: DiagramChangeKind;
}

export interface DiagramNodeDiff {
    addedNodeIds: string[];
    modifiedNodeIds: string[];
    removedNodeIds: string[];
}

export interface DiagramDiffCounts {
    added: number;
    modified: number;
    removed: number;
    total: number;
}

/** Counts for panel titles and summary chips — omits zero buckets. */
export function summarizeNodeDiff(diff: DiagramNodeDiff): DiagramDiffCounts {
    return {
        added: diff.addedNodeIds.length,
        modified: diff.modifiedNodeIds.length,
        removed: diff.removedNodeIds.length,
        total:
            diff.addedNodeIds.length +
            diff.modifiedNodeIds.length +
            diff.removedNodeIds.length,
    };
}

/** Title suffix: `18 added, 2 changed, 6 removed`. */
export function formatDiffCountSummary(counts: DiagramDiffCounts): string {
    const parts: string[] = [];
    if (counts.added > 0) {
        parts.push(`${counts.added} added`);
    }
    if (counts.modified > 0) {
        parts.push(`${counts.modified} changed`);
    }
    if (counts.removed > 0) {
        parts.push(`${counts.removed} removed`);
    }
    return parts.join(", ");
}

/**
 * Symmetric set difference of node identifiers between two diagram sources,
 * plus `modifiedNodeIds` for ids present in both whose declarations changed.
 * Removed nodes are surfaced in counts / changes list only — not on the
 * after diagram (Slice 4 ghost overlay can hook `removedNodeIds` later).
 */
export function diffNodes(
    oldSource: string,
    newSource: string,
): DiagramNodeDiff {
    const oldIds = extractNodeIds(oldSource);
    const newIds = extractNodeIds(newSource);
    const oldDecls = extractNodeDeclarations(oldSource);
    const newDecls = extractNodeDeclarations(newSource);

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

    const modified: string[] = [];
    for (const id of oldIds) {
        if (!newIds.has(id)) {
            continue;
        }
        const oldSig = oldDecls.get(id);
        const newSig = newDecls.get(id);
        if (oldSig !== undefined && newSig !== undefined && oldSig !== newSig) {
            modified.push(id);
        }
    }

    return {
        addedNodeIds: added,
        modifiedNodeIds: modified,
        removedNodeIds: removed,
    };
}

/**
 * Flat change list for the collapsed diff overlay. Labels come from bracket
 * text when available, otherwise the node id.
 */
export function buildChangeList(
    oldSource: string,
    newSource: string,
    diff: DiagramNodeDiff,
): DiagramChangeItem[] {
    const oldLabels = extractNodeLabels(oldSource);
    const newLabels = extractNodeLabels(newSource);
    const items: DiagramChangeItem[] = [];

    for (const nodeId of diff.addedNodeIds) {
        items.push({
            kind: "added",
            nodeId,
            label: newLabels.get(nodeId) ?? nodeId,
        });
    }
    for (const nodeId of diff.modifiedNodeIds) {
        const oldLabel = oldLabels.get(nodeId) ?? nodeId;
        const newLabel = newLabels.get(nodeId) ?? nodeId;
        items.push({
            kind: "modified",
            nodeId,
            label: oldLabel !== newLabel ? `${oldLabel} → ${newLabel}` : newLabel,
        });
    }
    for (const nodeId of diff.removedNodeIds) {
        items.push({
            kind: "removed",
            nodeId,
            label: oldLabels.get(nodeId) ?? nodeId,
        });
    }
    return items;
}

/**
 * Map node id → normalized declaration signature (lines mentioning the id).
 * Used to detect label / shape edits without treating them as add+remove.
 */
function extractNodeDeclarations(source: string): Map<string, string> {
    const decls = new Map<string, string>();
    const withoutFrontmatter = stripFrontMatter(source);

    for (const rawLine of withoutFrontmatter.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("%%") || line.startsWith("#")) {
            continue;
        }
        const idsOnLine = new Set<string>();
        const stripped = stripLabelContent(line);
        const tokenRegex = /\b[A-Za-z_][A-Za-z0-9_-]*\b/g;
        let match: RegExpExecArray | null;
        while ((match = tokenRegex.exec(stripped)) !== null) {
            const token = match[0];
            if (RESERVED_KEYWORDS.has(token) || /^\d+$/.test(token)) {
                continue;
            }
            idsOnLine.add(token);
        }
        const normalized = line.replace(/\s+/g, " ");
        for (const id of idsOnLine) {
            const prev = decls.get(id);
            decls.set(id, prev ? `${prev}\n${normalized}` : normalized);
        }
    }
    return decls;
}

/** Best-effort human label from `id[Label]` / `id(Label)` / `id{Label}`. */
function extractNodeLabels(source: string): Map<string, string> {
    const labels = new Map<string, string>();
    const withoutFrontmatter = stripFrontMatter(source);

    for (const rawLine of withoutFrontmatter.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("%%") || line.startsWith("#")) {
            continue;
        }
        const labelPatterns = [
            /\b([A-Za-z_][A-Za-z0-9_-]*)\s*\[([^\]"]+)\]/g,
            /\b([A-Za-z_][A-Za-z0-9_-]*)\s*\["([^"]+)"\]/g,
            /\b([A-Za-z_][A-Za-z0-9_-]*)\s*\('([^']+)'\)/g,
            /\b([A-Za-z_][A-Za-z0-9_-]*)\s*\(([^)"]+)\)/g,
            /\b([A-Za-z_][A-Za-z0-9_-]*)\s*\{([^}"]+)\}/g,
        ];
        for (const pattern of labelPatterns) {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                const id = match[1];
                const label = match[2].trim();
                if (label && !RESERVED_KEYWORDS.has(id)) {
                    labels.set(id, label);
                }
            }
        }
    }
    return labels;
}

/** 0-based line indices where `nodeId` appears in diagram source (declaration lines). */
export function findNodeLineRanges(source: string, nodeId: string): number[] {
    if (!nodeId.trim()) {
        return [];
    }
    const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idRegex = new RegExp(`\\b${escaped}\\b`);
    const lines: number[] = [];
    const withoutFrontmatter = stripFrontMatter(source);

    const lineArr = withoutFrontmatter.split(/\r?\n/);
    for (let i = 0; i < lineArr.length; i++) {
        const raw = lineArr[i];
        const line = raw.trim();
        if (!line || line.startsWith("%%") || line.startsWith("#")) {
            continue;
        }
        if (idRegex.test(stripLabelContent(line)) || idRegex.test(line)) {
            lines.push(i);
        }
    }
    return lines;
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
