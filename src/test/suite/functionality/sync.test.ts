import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { expect } from 'chai';


suite('syncDiagramWithMermaid Command', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    // it('should sync local changes if the file is a Mermaid diagram', async () => {
    //     const documentMock = {
    //         languageId: 'mermaid',
    //         getText: sinon.stub().returns('graph TD; A-->B;'),
    //         uri: { toString: () => 'file://path/to/file' }
    //     } as unknown as vscode.TextDocument;
    
    //     const editorMock = { document: documentMock } as unknown as vscode.TextEditor;
    //     sandbox.stub(vscode.window, 'activeTextEditor').value(editorMock);
        
    //     const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();
    //     const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        
    //     // Stub the helper functions to ensure success
    //     (global as any).extractIdFromCode = sinon.stub().returns('diagram123');
    //     (global as any).getProjectIdForDocument = sinon.stub().returns('project456');
    //     sandbox.stub(api.mcAPI, 'setDocument').resolves();
    //     (global as any).TempFileCache = { hasTempUri: sinon.stub().returns(true) };
        
    
    //     await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');
    
    //     expect(showMessageStub.calledWith('Diagram synced successfully with Mermaid Chart.')).to.be.true;
    //     expect(executeCommandStub.calledWith('workbench.action.files.save')).to.be.true;
    // });
    

    test('should show a message if the file is not a Mermaid diagram', async () => {
        const documentMock = {
            languageId: 'plaintext',
            getText: sinon.stub().returns('random text')
        } as unknown as vscode.TextDocument;

        const editorMock = { document: documentMock } as unknown as vscode.TextEditor;
        sandbox.stub(vscode.window, 'activeTextEditor').value(editorMock);
        
        const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

        await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');

        expect(showMessageStub.calledWith('This file is not a Mermaid diagram.')).to.be.true;
    });

    test('should show a message if the file is empty', async () => {
        const documentMock = {
            languageId: 'mermaid',
            getText: sinon.stub().returns('')
        } as unknown as vscode.TextDocument;

        const editorMock = { document: documentMock } as unknown as vscode.TextEditor;
        sandbox.stub(vscode.window, 'activeTextEditor').value(editorMock);
        
        const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

        await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');

        expect(showMessageStub.calledWith('The file is empty.')).to.be.true;
    });

    test('should do nothing if no active editor is present', async () => {
        sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
        
        const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

        await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');

        expect(showMessageStub.called).to.be.false;
    });
});
