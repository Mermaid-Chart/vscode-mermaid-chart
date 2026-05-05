/**
 * Minimal LCS-based line diff. Returns one entry per line in the unified
 * view, in source order, tagged keep / add / remove.
 *
 * Sized for human-authored Mermaid diagrams (tens to a few hundred lines) —
 * O(N*M) in time and memory, which is fine here. Don't reach for this on
 * megabyte-scale inputs; reach for jsdiff or Myers.
 */
export type LineOp = "keep" | "add" | "remove";

export interface LineDiffEntry {
    op: LineOp;
    /** 1-based line number in the OLD file, or null for additions. */
    oldLine: number | null;
    /** 1-based line number in the NEW file, or null for removals. */
    newLine: number | null;
    text: string;
}

export interface LineDiffSummary {
    entries: LineDiffEntry[];
    addedCount: number;
    removedCount: number;
}

export function computeLineDiff(oldText: string, newText: string): LineDiffSummary {
    const a = splitLines(oldText);
    const b = splitLines(newText);

    const lcs = buildLcsTable(a, b);
    const entries: LineDiffEntry[] = [];

    let i = a.length;
    let j = b.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            entries.push({ op: "keep", oldLine: i, newLine: j, text: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
            entries.push({ op: "add", oldLine: null, newLine: j, text: b[j - 1] });
            j--;
        } else {
            entries.push({ op: "remove", oldLine: i, newLine: null, text: a[i - 1] });
            i--;
        }
    }
    entries.reverse();

    let addedCount = 0;
    let removedCount = 0;
    for (const e of entries) {
        if (e.op === "add") { addedCount++; }
        else if (e.op === "remove") { removedCount++; }
    }
    return { entries, addedCount, removedCount };
}

function splitLines(text: string): string[] {
    if (text === "") { return []; }
    return text.split(/\r\n|\n/);
}

function buildLcsTable(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const t: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
        }
    }
    return t;
}
