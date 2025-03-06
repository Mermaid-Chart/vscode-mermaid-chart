import * as assert from 'assert';
import * as vscode from 'vscode';

import sinon from 'sinon';
import { PreviewPanel } from '../../../panels/previewPanel';



suite('Diagram Preview Functionality Tests', () => {
    const previewCommand = 'mermaidChart.preview';

    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension('MermaidChart.vscode-mermaid-chart');
        assert.ok(ext, 'Extension should be present');

        if (!ext.isActive) {
            await ext.activate();
        }

        assert.ok(ext.isActive, 'Extension should be active');
    });

    test('Preview command should be registered', async () => {
        const commandExists = await vscode.commands.getCommands(true).then((commands) => commands.includes(previewCommand));
        assert.ok(commandExists, `Command '${previewCommand}' is not registered`);
    });

    test('Should show error if no active editor', async () => {
        const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

        // Clean up any existing stubs
        showErrorMessageStub.restore();

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand(previewCommand);

        assert.ok(showErrorMessageStub.calledWith('No active editor. Open a .mmd file to preview.'));
        showErrorMessageStub.restore();
    });


// As createOrShow  require Document so why you dont pass

    test('Should open preview for valid Mermaid file', async () => {
        const createOrShowStub = sinon.stub(PreviewPanel, 'createOrShow');

        const document = await vscode.workspace.openTextDocument({ 
            content: 'graph TD; A --> B;', 
            language: 'mermaid' 
        });

        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand(previewCommand);

        
        assert.ok(createOrShowStub.calledOnceWith(document), 'Preview panel should be shown for a valid Mermaid file');
        createOrShowStub.restore();
    });
});
