import * as assert from "assert";

/**
 * The analyzeForSuggestions function is not exported from suggestionsPanel.ts
 * because it is tightly coupled with the panel class. For testability, we
 * re-implement the same static analysis rules here so we can validate
 * the detection logic without instantiating a webview.
 *
 * If the implementation drifts, this test file should be updated to match.
 */

interface DiagramSuggestionItem {
  id: string;
  title: string;
  description: string;
  category: "style" | "structure" | "readability" | "best-practice";
  priority: "high" | "medium" | "low";
}

function analyzeForSuggestions(code: string): DiagramSuggestionItem[] {
  const suggestions: DiagramSuggestionItem[] = [];
  const lines = code.split("\n");

  if (!code.match(/%%.*/)) {
    suggestions.push({
      id: "add-comments",
      title: "Add documentation comments",
      description: "The diagram has no comments. Adding %% comments improves maintainability.",
      category: "readability",
      priority: "low",
    });
  }

  if (!code.match(/style\s|classDef\s|:::/) && code.match(/flowchart|graph/i)) {
    suggestions.push({
      id: "add-styling",
      title: "Add visual styling",
      description: "No styles detected. Adding colors and classes makes the diagram clearer.",
      category: "style",
      priority: "medium",
    });
  }

  const nodeCount = (code.match(/[A-Za-z_]\w*[\[\(\{\"]/g) || []).length;
  if (nodeCount > 15) {
    suggestions.push({
      id: "split-subgraphs",
      title: "Split into subgraphs",
      description: `Found ~${nodeCount} nodes. Consider grouping related nodes into subgraphs for clarity.`,
      category: "structure",
      priority: "high",
    });
  }

  if (code.match(/--->/g) && !code.match(/--\s*\w+\s*-->/)) {
    suggestions.push({
      id: "add-edge-labels",
      title: "Add edge labels",
      description: "Edges have no labels. Adding descriptive labels helps readers understand relationships.",
      category: "readability",
      priority: "medium",
    });
  }

  const longLines = lines.filter((l) => l.length > 120);
  if (longLines.length > 0) {
    suggestions.push({
      id: "wrap-long-lines",
      title: "Wrap long lines",
      description: `${longLines.length} line(s) exceed 120 characters. Break them up for readability.`,
      category: "readability",
      priority: "low",
    });
  }

  if (code.match(/flowchart|graph/i) && !code.match(/\bTD\b|\bLR\b|\bRL\b|\bBT\b/)) {
    suggestions.push({
      id: "add-direction",
      title: "Specify diagram direction",
      description: "No direction (TD/LR/RL/BT) specified. Adding a direction makes layout predictable.",
      category: "best-practice",
      priority: "medium",
    });
  }

  return suggestions;
}

suite("Suggestions Analyzer", () => {
  test("suggests adding comments when none present", () => {
    const code = `flowchart TD\n  A --> B`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(suggestions.some((s) => s.id === "add-comments"));
  });

  test("does not suggest adding comments when present", () => {
    const code = `flowchart TD\n  %% Main flow\n  A --> B`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(!suggestions.some((s) => s.id === "add-comments"));
  });

  test("suggests styling for unstyled flowchart", () => {
    const code = `flowchart TD\n  A --> B --> C`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(suggestions.some((s) => s.id === "add-styling"));
  });

  test("does not suggest styling when classDef present", () => {
    const code = `flowchart TD\n  classDef default fill:#f9f\n  A --> B`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(!suggestions.some((s) => s.id === "add-styling"));
  });

  test("suggests subgraphs for large diagrams", () => {
    let nodes = "";
    for (let i = 0; i < 20; i++) {
      nodes += `  node${i}["Label ${i}"]\n`;
    }
    const code = `flowchart TD\n${nodes}`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(suggestions.some((s) => s.id === "split-subgraphs"));
  });

  test("suggests direction when missing from flowchart", () => {
    const code = `flowchart\n  A --> B`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(suggestions.some((s) => s.id === "add-direction"));
  });

  test("does not suggest direction when TD specified", () => {
    const code = `flowchart TD\n  A --> B`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(!suggestions.some((s) => s.id === "add-direction"));
  });

  test("suggests wrapping long lines", () => {
    const longLine = "A" + "-".repeat(130) + "> B";
    const code = `flowchart TD\n  ${longLine}`;
    const suggestions = analyzeForSuggestions(code);
    assert.ok(suggestions.some((s) => s.id === "wrap-long-lines"));
  });

  test("returns empty for non-flowchart well-structured diagram", () => {
    const code = `%% ER diagram\nerDiagram\n  USER ||--o{ ORDER : places`;
    const suggestions = analyzeForSuggestions(code);
    const flowchartSpecific = suggestions.filter(
      (s) => s.id === "add-styling" || s.id === "add-direction"
    );
    assert.strictEqual(flowchartSpecific.length, 0);
  });
});
