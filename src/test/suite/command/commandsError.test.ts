import * as assert from 'assert';
import * as vscode from 'vscode';
const commandList = [
    'mermaidChart.logout',
    'mermaidChart.preview',
    'mermaidChart.createMermaidFile',
    'mermaidChart.syncDiagramWithMermaid',
    'mermaidChart.connectDiagramToMermaidChart',
    'mermaidChart.downloadDiagram',
    'mermaidChart.focus',
    'mermaidChart.refresh',
    'mermaidChart.outline',
    'extension.refreshTreeView',
    'mermaidChart.diagramHelp',
    'mermaid.editAuxFile',
];
suite('Mermaid Chart Commands', () => {
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension('MermaidChart.vscode-mermaid-chart');
        assert.ok(ext, 'Extension should be present');

        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension should be active');
    });

    commandList.forEach((command) => {
        test(`Command '${command}' should execute without error`, async () => {
            try {
                await vscode.commands.executeCommand(command);
                assert.ok(true, `Command '${command}' executed successfully`);
            } catch (error) {
                assert.fail(`Command '${command}' failed to execute: ${error}`);
            }
        });
    });
});