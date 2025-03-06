import * as assert from 'assert';
import * as vscode from 'vscode';
import sinon from 'sinon';
suite('Mermaid Chart Command Tests', () => {
        let triggerSuggestStub: sinon.SinonStub;
    
        setup(() => {
            triggerSuggestStub = sinon.stub(vscode.commands, 'executeCommand');
        });
    
        teardown(() => {
            triggerSuggestStub.restore();
        });
    
        test('Should trigger "editor.action.triggerSuggest" when mermaidChart.showCompletions is called', async () => {
            const editor = {
                document: { languageId: 'mermaid' }, 
                selection: new vscode.Selection(0, 0, 0, 0), 
            } as vscode.TextEditor;
    
            
            sinon.stub(vscode.window, 'activeTextEditor').get(() => editor);
    
            
            await vscode.commands.executeCommand('mermaidChart.showCompletions');
    
            
            assert.ok(triggerSuggestStub.calledOnce, 'Completion should be triggered when there is an active editor');
        });

        
    });