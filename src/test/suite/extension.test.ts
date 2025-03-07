
import * as assert from 'assert';
import * as vscode from 'vscode';

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

	
	
	
	
	
	
	




	
	
	

	

	
	
