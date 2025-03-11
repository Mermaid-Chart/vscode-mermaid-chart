import * as assert from 'assert';
import * as vscode from 'vscode';

const commandList = [
    'mermaidChart.login',
    'mermaidChart.logout',
    'mermaidChart.preview',
    'mermaidChart.createMermaidFile',
    'mermaidChart.syncDiagramWithMermaid',
    'mermaidChart.connectDiagramToMermaidChart',
    'mermaidChart.downloadDiagram',
    'mermaidChart.focus',
    'mermaidChart.refresh',
    'mermaidChart.outline',
    'mermaidChart.insertUuidIntoEditor',
    'extension.viewMermaidChart',
    'extension.editMermaidChart',
    'extension.refreshTreeView',
    'mermaidChart.diagramHelp',
    'mermaid.editAuxFile',
    'mermaid.connectDiagram'
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
        test(`Command '${command}' should be registered`, async () => {
            const commandExists = await vscode.commands.getCommands(true).then((commands) => commands.includes(command));
            assert.ok(commandExists, `Command '${command}' is not registered`);
        });
    });
});