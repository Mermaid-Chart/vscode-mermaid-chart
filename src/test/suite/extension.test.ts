
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { MermaidChartVSCode } from '../../mermaidChartVSCode';
import * as myExtension from '../../extension';
import { PreviewPanel } from '../../panels/previewPanel';
import sinon from 'sinon';
import { TempFileCache } from '../../cache/tempFileCache';
import { createMermaidFile } from '../../commands/createFile';
import { normalizeMermaidText } from '../../frontmatter';
import { handleTextDocumentChange } from '../../eventHandlers';
import { applySyntaxHighlighting } from '../../syntaxHighlighter';

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
		  language: 'mermaid.flowchart'
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
				document: { languageId: 'mermaid' }, // Mocked document with mermaid language (but not checked)
				selection: new vscode.Selection(0, 0, 0, 0), // Dummy selection
			} as vscode.TextEditor;
	
			// Mocking vscode.window.activeTextEditor to return our fake editor
			sinon.stub(vscode.window, 'activeTextEditor').get(() => editor);
	
			// Execute the command
			await vscode.commands.executeCommand('mermaidChart.showCompletions');
	
			// Assert that the 'editor.action.triggerSuggest' was called
			assert.ok(triggerSuggestStub.calledOnce, 'Completion should be triggered when there is an active editor');
		});

		
	});



	
	
