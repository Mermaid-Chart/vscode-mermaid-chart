import * as assert from "assert";
import { parseBotEditInfo } from "../../commercial/prReview/gitTrailerDetector";
import type { Commit } from "../../types/git";

function makeCommit(overrides: Partial<Commit> = {}): Commit {
    return {
        hash: "abcdef1234567890abcdef1234567890abcdef12",
        message: "regen flow",
        parents: ["1234567890abcdef1234567890abcdef12345678"],
        authorDate: new Date("2026-04-01T10:00:00Z"),
        authorName: "Mermaid Sync Bot",
        authorEmail: "bot@mermaidchart.com",
        ...overrides,
    };
}

suite("GitTrailerDetector / parseBotEditInfo", () => {
    test("returns info when the configured trailer is present", () => {
        const commit = makeCommit({
            message: "Regenerate diagrams\n\nMermaid-Sync: regenerated\n",
        });

        const info = parseBotEditInfo(commit, "Mermaid-Sync: regenerated");

        assert.ok(info);
        assert.strictEqual(info?.commitSha, commit.hash);
        assert.strictEqual(info?.shortSha, "abcdef1");
        assert.strictEqual(info?.parentSha, commit.parents[0]);
        assert.strictEqual(info?.authorName, "Mermaid Sync Bot");
    });

    test("captures the optional Mermaid-Sync-Source trailer", () => {
        const commit = makeCommit({
            message:
                "Regen\n\nMermaid-Sync: regenerated\nMermaid-Sync-Source: pr-1234\n",
        });

        const info = parseBotEditInfo(commit, "Mermaid-Sync: regenerated");

        assert.strictEqual(info?.sourceRef, "pr-1234");
    });

    test("returns null when the trailer is absent", () => {
        const commit = makeCommit({ message: "Hand-authored change" });
        assert.strictEqual(
            parseBotEditInfo(commit, "Mermaid-Sync: regenerated"),
            null,
        );
    });

    test("returns null when only a similar-looking line appears mid-message (not anchored)", () => {
        const commit = makeCommit({
            message: "Refactor: see Mermaid-Sync: regenerated for context",
        });
        assert.strictEqual(
            parseBotEditInfo(commit, "Mermaid-Sync: regenerated"),
            null,
        );
    });

    test("matches case-insensitively on the value but anchors to a line start", () => {
        const commit = makeCommit({
            message: "header\n\nMermaid-Sync:   REGENERATED  \n",
        });

        const info = parseBotEditInfo(commit, "Mermaid-Sync: regenerated");
        assert.ok(info);
    });

    test("returns null for malformed trailer specs", () => {
        const commit = makeCommit({
            message: "header\n\nMermaid-Sync: regenerated\n",
        });
        assert.strictEqual(parseBotEditInfo(commit, "no-colon-here"), null);
        assert.strictEqual(parseBotEditInfo(commit, ""), null);
    });

    test("respects a custom trailer spec", () => {
        const commit = makeCommit({
            message: "header\n\nX-Sync-Bot: ran-it\n",
        });
        const info = parseBotEditInfo(commit, "X-Sync-Bot: ran-it");
        assert.ok(info);
    });
});
