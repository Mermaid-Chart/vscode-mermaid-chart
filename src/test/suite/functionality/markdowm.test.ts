import { expect } from 'chai';
	import * as vscode from 'vscode';
	
	suite('Markdown Integration', () => {
	  const markdownContent = `
	  # Sample Markdown
	  Some text before the diagram.
	
	  \`\`\`mermaid
	  graph TD;
		A-->B;
		B-->C;
		C-->D;
	  \`\`\`
	
	  Some text after the diagram.
	  `;
	
	  const document = {
		getText: () => markdownContent,
		offsetAt: (position: vscode.Position) => {
		  const lines = markdownContent.split('\n');
		  let offset = 0;
		  for (let i = 0; i < position.line; i++) {
			offset += lines[i].length + 1; 
		  }
		  return offset + position.character;
		},
	  } as unknown as vscode.TextDocument;
	
	  test('should detect mermaid code blocks in markdown', () => {
		const start = new vscode.Position(4, 0);
		const end = new vscode.Position(9, 3);
	
		const blockContent = markdownContent.substring(
		  document.offsetAt(start),
		  document.offsetAt(end)
		);
	
		expect(blockContent).to.include('graph TD');
		expect(blockContent).to.include('A-->B;');
		expect(blockContent).to.include('C-->D;');
	  });
	
	
	  test('should extract mermaid diagram from markdown', () => {
		const start = new vscode.Position(4, 0);
		const end = new vscode.Position(9, 3);
	
		const diagram = markdownContent.substring(
		  document.offsetAt(start),
		  document.offsetAt(end)
		);
	
		expect(diagram).to.include('graph TD');
		expect(diagram).to.include('A-->B;');
	  });
	});
	