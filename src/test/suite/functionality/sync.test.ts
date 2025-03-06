declare global {
    var mcAPI: {
        setDocument: (params: { documentID: string; projectID: string; code: string }) => Promise<void>;
    };
}
import { expect } from 'chai';
import * as vscode from 'vscode';
import sinon from 'sinon';
    suite('Mermaid Chart Sync Command', () => {
        let showInfoStub: sinon.SinonStub;
        let showErrorStub: sinon.SinonStub;
        let withProgressStub: sinon.SinonStub;
        let setDocumentStub: sinon.SinonStub;
    
    
        const mockDocument = (languageId: string, content: string) => ({
            languageId,
            getText: sinon.stub().returns(content),
            uri: { toString: sinon.stub().returns('file://test.mmd') }
        }) as unknown as vscode.TextDocument;
    
        setup(() => {
            // Stubbing VS Code API methods
            showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
            withProgressStub = sinon.stub(vscode.window, 'withProgress').callsFake(async (_, task) => {
                const mockToken = { isCancellationRequested: false } as vscode.CancellationToken;
                await task({ report: sinon.stub() }, mockToken);
            });
    
        
            globalThis.mcAPI = {
                setDocument: sinon.stub().resolves() 
            } as any;
    
            setDocumentStub = globalThis.mcAPI.setDocument as sinon.SinonStub;
        });
    
        teardown(() => {
            sinon.restore(); 
        });

        test('should save the file on Mermaid when syncing', async () => {
            const document = mockDocument('mermaid', 'graph TD; A-->B;');
            sinon.stub(vscode.window, 'activeTextEditor').value({ document });
    
            console.log('Before executing sync command...');
            setDocumentStub.resolves(); 
    
            await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');
            await new Promise((resolve) => setTimeout(resolve, 100)); 
    
            console.log('setDocumentStub called:', setDocumentStub.called);
            console.log('showInfoStub called:', showInfoStub.called);
    
            expect(setDocumentStub.calledOnce, 'setDocumentStub should be called once').to.be.true;
            expect(showInfoStub.calledOnce, 'showInfoStub should be called once').to.be.true;
            sinon.assert.calledWith(showInfoStub, 'Diagram synced successfully with Mermaid Chart.');
        });
    
    
        test('should show an error if sync fails', async () => {
            const document = mockDocument('mermaid', 'graph TD; A-->B;');
            sinon.stub(vscode.window, 'activeTextEditor').value({ document });
    
            setDocumentStub.rejects(new Error('Sync failed!')); 
    
            console.log('Executing failing sync command...');
            await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');
            await new Promise((resolve) => setTimeout(resolve, 100)); 
    
            console.log('setDocumentStub called:', setDocumentStub.called);
            console.log('showErrorStub called:', showErrorStub.called);
    
            expect(setDocumentStub.calledOnce, 'setDocumentStub should be called once').to.be.true;
            expect(showErrorStub.calledOnce, 'showErrorStub should be called once').to.be.true;
            sinon.assert.calledWith(showErrorStub, 'Failed to sync file: Sync failed!');
        });
    
        
        test('should show a message for non-mermaid files', async () => {
            const document = mockDocument('plaintext', 'Some text');
            sinon.stub(vscode.window, 'activeTextEditor').value({ document });
    
            console.log('Executing sync command with non-mermaid file...');
            await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');
    
            expect(setDocumentStub.notCalled, 'setDocumentStub should NOT be called').to.be.true;
            expect(showInfoStub.calledOnce, 'showInfoStub should be called once').to.be.true;
            sinon.assert.calledWith(showInfoStub, 'This file is not a Mermaid diagram.');
        });
    
        
        test('should show a message if the file is empty', async () => {
            const document = mockDocument('mermaid', '');
            sinon.stub(vscode.window, 'activeTextEditor').value({ document });
    
            console.log('Executing sync command with empty file...');
            await vscode.commands.executeCommand('mermaidChart.syncDiagramWithMermaid');
    
            expect(setDocumentStub.notCalled, 'setDocumentStub should NOT be called').to.be.true;
            expect(showInfoStub.calledOnce, 'showInfoStub should be called once').to.be.true;
            sinon.assert.calledWith(showInfoStub, 'The file is empty.');
        });
    });