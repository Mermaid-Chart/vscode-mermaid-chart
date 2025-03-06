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

	
	
	
	
	
	
	




	
	
	

	

	
	
