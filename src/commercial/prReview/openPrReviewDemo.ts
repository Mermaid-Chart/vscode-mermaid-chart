import * as vscode from "vscode";
import {
    buildChangeList,
    diffNodes,
    summarizeNodeDiff,
} from "./diagramNodeDiff";
import { openDiagramDiffWebviews, openPrReviewPreview } from "../sync/diagramDiffView";

async function resolveDemoDir(context: vscode.ExtensionContext): Promise<vscode.Uri | null> {
    const candidates: vscode.Uri[] = [
        vscode.Uri.joinPath(context.extensionUri, "examples", "diff-demo"),
    ];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        candidates.push(vscode.Uri.joinPath(folder.uri, "examples", "diff-demo"));
        candidates.push(vscode.Uri.joinPath(folder.uri, "diff-demo"));
    }
    for (const dir of candidates) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(dir, "before.mmd"));
            return dir;
        } catch {
            // try next
        }
    }
    return null;
}

async function readDemoFile(demoDir: vscode.Uri, name: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(demoDir, name));
    return Buffer.from(bytes).toString("utf8");
}

async function runPrReviewDemo(context: vscode.ExtensionContext): Promise<void> {
    const demoDir = await resolveDemoDir(context);
    if (!demoDir) {
        vscode.window.showErrorMessage(
            "PR Review demo not found. Open the vscode-mermaid-chart repo (or examples folder) in VS Code.",
        );
        return;
    }
    try {
        const [oldContent, newContent] = await Promise.all([
            readDemoFile(demoDir, "before.mmd"),
            readDemoFile(demoDir, "after.mmd"),
        ]);
        const nodeDiff = diffNodes(oldContent, newContent);
        const counts = summarizeNodeDiff(nodeDiff);
        const changes = buildChangeList(oldContent, newContent, nodeDiff);

        let splitDispose: (() => void) | undefined;
        openPrReviewPreview(
            {
                addedNodeIds: nodeDiff.addedNodeIds,
                modifiedNodeIds: nodeDiff.modifiedNodeIds,
                removedNodeIds: nodeDiff.removedNodeIds,
                counts,
                changes,
                oldContent,
                fileName: "flowchart-demo.mmd",
                prRef: "#5642",
                onCompareSideBySide: () => {
                    splitDispose?.();
                    splitDispose = openDiagramDiffWebviews(oldContent, newContent, {
                        addedNodeIds: nodeDiff.addedNodeIds,
                        modifiedNodeIds: nodeDiff.modifiedNodeIds,
                        removedNodeIds: nodeDiff.removedNodeIds,
                    });
                },
            },
            newContent,
            vscode.ViewColumn.Active,
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`PR Review demo failed: ${msg}`);
    }
}

/** Dev/demo entry point — opens the Now/Before PR review preview without a git bot commit. */
export function registerPrReviewDemoCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("mermaidChart.prReview.openDemo", () =>
            runPrReviewDemo(context),
        ),
    );
}

/**
 * When debugging (F5), offer to open the demo so you don't hunt the command palette.
 */
export function offerPrReviewDemoInDevHost(context: vscode.ExtensionContext): void {
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return;
    }
    void (async () => {
        const demoDir = await resolveDemoDir(context);
        if (!demoDir) {
            return;
        }
        const choice = await vscode.window.showInformationMessage(
            "Mermaid (Test) is running in this window. Open the PR Review demo?",
            "Open demo",
        );
        if (choice === "Open demo") {
            await runPrReviewDemo(context);
        }
    })();
}
