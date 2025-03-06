declare global {
    var mcAPI: {
        setDocument: (params: { documentID: string; projectID: string; code: string }) => Promise<void>;
    };
}

import * as assert from 'assert';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { MermaidChartVSCode } from '../../mermaidChartVSCode';
import * as myExtension from '../../extension';
import { PreviewPanel } from '../../panels/previewPanel';
import sinon from 'sinon';
import { expect } from 'chai';




suite('Extension Tests', () => {
	test('Extension should be present and activate', async () => {
		
		const ext = vscode.extensions.getExtension('MermaidChart.vscode-mermaid-chart');
		assert.ok(ext, 'Extension should be present');
		
		if (!ext.isActive) {
			await ext.activate();
		}
		assert.ok(ext.isActive, 'Extension should be active');
	});

	test('Sample test', () => {
		console.log('Running sample test...');
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
		console.log('Sample test: PASS');
	});
});
suite('Mermaid Chart Commands', () => {
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

		
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');

		await vscode.commands.executeCommand(previewCommand);

		assert.ok(showErrorMessageStub.calledWith('No active editor. Open a .mmd file to preview.'));

		showErrorMessageStub.restore();
	});

	test('Should show error for non-mermaid file', async () => {
		const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

		
		const document = await vscode.workspace.openTextDocument({ content: 'This is a test', language: 'plaintext'  });

		await vscode.window.showTextDocument(document);

		await vscode.commands.executeCommand(previewCommand);

		assert.ok(showErrorMessageStub.calledWith('Mermaid Preview is only available for mermaid files.'));

		showErrorMessageStub.restore();
	});

	test('Should open preview for valid Mermaid file', async () => {
		const createOrShowStub = sinon.stub(PreviewPanel, 'createOrShow');
	
		
		const document = await vscode.workspace.openTextDocument({ 
		  content: 'graph TD; A --> B;', 
		  language: 'mermaid'
		});
	  
		await vscode.window.showTextDocument(document);
		await vscode.commands.executeCommand(previewCommand);
	  
		
		assert.ok(createOrShowStub.calledOnce, 'Preview panel should be shown for a valid Mermaid file');
		
		createOrShowStub.restore();
	  });
	});

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
	


	

	
	
	




	
	
	

	

	
	
