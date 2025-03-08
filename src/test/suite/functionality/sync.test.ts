import { expect } from 'chai';
import sinon from 'sinon';
import * as vscode from 'vscode';


const mcAPI = { setDocument: sinon.stub() };
const document = {
    getText: () => 'graph TD; A --> B;',
    uri: vscode.Uri.file('test.mmd'),
};

const diagramId = '123';
const projectId = '456';

suite('syncDiagramWithMermaid', () => {
        let sandbox: sinon.SinonSandbox;
            setup(() => {
                sandbox = sinon.createSandbox();
                (global as any).api = { mcAPI }; // Simulate API in global space
            });
        
    teardown(() => {
        sinon.restore(); // Restore original methods after each test
        sandbox.restore();
    });

    test('should save the document successfully', async () => {
        mcAPI.setDocument.resolves();

        await mcAPI.setDocument({
            documentID: diagramId,
            projectID: projectId,
            code: document.getText(),
        });

        expect(mcAPI.setDocument.calledOnce).to.be.true;
        expect(mcAPI.setDocument.calledWith({
            documentID: diagramId,
            projectID: projectId,
            code: document.getText(),
        })).to.be.true;
    });

    test('should handle save failure', async () => {
        const errorMsg = 'Failed to save document';
        mcAPI.setDocument.rejects(new Error(errorMsg));

        try {
            await mcAPI.setDocument({
                documentID: diagramId,
                projectID: projectId,
                code: document.getText(),
            });
            
            // Fail the test if no error is thrown
            throw new Error('Test should have thrown an error');
        } catch (error) {
            if (error instanceof Error) {
                expect(error.message).to.equal(errorMsg);
            } else {
                throw new Error('Caught an unexpected error type');
            }
        }
    });
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


