import * as assert from "assert";
import {
    diffNodes,
    extractNodeIds,
} from "../../commercial/prReview/diagramNodeDiff";

suite("diagramNodeDiff / extractNodeIds", () => {
    test("collects ids from a flowchart graph", () => {
        const ids = extractNodeIds(`flowchart LR
    A[Start] --> B[Middle]
    B --> C{Decision}
    C -->|yes| D
`);
        assert.deepStrictEqual(
            [...ids].sort(),
            ["A", "B", "C", "D"],
        );
    });

    test("ignores reserved keywords and direction tokens", () => {
        const ids = extractNodeIds(`graph TD
    subgraph auth [Authentication]
        A --> B
    end
`);
        assert.ok(!ids.has("graph"));
        assert.ok(!ids.has("TD"));
        assert.ok(!ids.has("subgraph"));
        assert.ok(!ids.has("end"));
        assert.ok(ids.has("A"));
        assert.ok(ids.has("B"));
        assert.ok(ids.has("auth"));
    });

    test("does not pick up tokens inside labels", () => {
        const ids = extractNodeIds(`flowchart LR
    A["Click here B C D"] --> E
`);
        assert.ok(ids.has("A"));
        assert.ok(ids.has("E"));
        assert.ok(!ids.has("B"));
        assert.ok(!ids.has("C"));
        assert.ok(!ids.has("D"));
    });

    test("ignores comment lines", () => {
        const ids = extractNodeIds(`flowchart LR
    %% comment with FAKE id
    A --> B
`);
        assert.ok(!ids.has("FAKE"));
    });

    test("strips frontmatter before parsing", () => {
        const ids = extractNodeIds(`---
title: My diagram
id: 12345
---
flowchart LR
    A --> B
`);
        assert.ok(ids.has("A"));
        assert.ok(ids.has("B"));
        assert.ok(!ids.has("title"));
    });
});

suite("diagramNodeDiff / diffNodes", () => {
    test("identifies a single added node", () => {
        const before = `flowchart LR
    A --> B
`;
        const after = `flowchart LR
    A --> B --> C
`;
        const result = diffNodes(before, after);
        assert.deepStrictEqual(result.addedNodeIds, ["C"]);
        assert.deepStrictEqual(result.removedNodeIds, []);
    });

    test("identifies a single removed node", () => {
        const before = `flowchart LR
    A --> B --> C
`;
        const after = `flowchart LR
    A --> B
`;
        const result = diffNodes(before, after);
        assert.deepStrictEqual(result.addedNodeIds, []);
        assert.deepStrictEqual(result.removedNodeIds, ["C"]);
    });

    test("returns empty diffs for identical diagrams", () => {
        const src = `flowchart LR\n    A --> B\n`;
        const result = diffNodes(src, src);
        assert.deepStrictEqual(result.addedNodeIds, []);
        assert.deepStrictEqual(result.removedNodeIds, []);
    });

    test("doesn't false-positive on label-only edits", () => {
        const before = `flowchart LR
    A[Old label] --> B
`;
        const after = `flowchart LR
    A[New label] --> B
`;
        const result = diffNodes(before, after);
        assert.deepStrictEqual(result.addedNodeIds, []);
        assert.deepStrictEqual(result.removedNodeIds, []);
    });
});
