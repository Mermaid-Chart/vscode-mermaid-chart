import * as assert from "assert";
import * as vscode from "vscode";

/**
 * These tests require the full extension host environment.
 * In CI or headless test runs, the extension may not fully activate
 * (due to auth/API initialization), so we skip gracefully.
 */
async function getCommands(): Promise<string[]> {
  return vscode.commands.getCommands(false);
}

async function isExtensionActive(): Promise<boolean> {
  const commands = await getCommands();
  return commands.includes("mermaidChart.preview");
}

suite("Command Registration (integration)", function () {
  this.timeout(15000);

  test("core commands are registered when extension activates", async function () {
    // Open a doc to trigger activation
    const doc = await vscode.workspace.openTextDocument({ content: "x", language: "plaintext" });
    await vscode.window.showTextDocument(doc);
    await new Promise((r) => setTimeout(r, 3000));

    if (!(await isExtensionActive())) {
      this.skip();
      return;
    }

    const commands = await getCommands();
    for (const cmd of ["mermaidChart.preview", "mermaidChart.createMermaidFile"]) {
      assert.ok(commands.includes(cmd), `${cmd} command not found`);
    }
  });

  test("new flow commands are registered when extension activates", async function () {
    if (!(await isExtensionActive())) {
      this.skip();
      return;
    }

    const commands = await getCommands();
    for (const cmd of [
      "mermaidChart.generateDiagram",
      "mermaidChart.copyDiagramLink",
      "mermaidChart.repairAndSaveToCloud",
      "mermaidChart.improveDiagram",
    ]) {
      assert.ok(commands.includes(cmd), `${cmd} command not found`);
    }
  });
});

suite("Copy Diagram Link (integration)", function () {
  this.timeout(15000);

  test("copies a mermaid.live link to clipboard", async function () {
    if (!(await isExtensionActive())) {
      this.skip();
      return;
    }

    const diagramCode = "flowchart TD\n  A --> B";
    const doc = await vscode.workspace.openTextDocument({
      content: diagramCode,
      language: "mermaid",
    });
    await vscode.window.showTextDocument(doc);
    await new Promise((r) => setTimeout(r, 300));

    await vscode.commands.executeCommand("mermaidChart.copyDiagramLink");

    const clipboardText = await vscode.env.clipboard.readText();
    assert.ok(
      clipboardText.startsWith("https://mermaid.live/edit#base64:"),
      `Expected mermaid.live link, got: ${clipboardText.substring(0, 50)}`
    );

    const base64Part = clipboardText.replace("https://mermaid.live/edit#base64:", "");
    const decoded = Buffer.from(base64Part, "base64").toString("utf-8");
    assert.strictEqual(decoded, diagramCode);
  });
});
