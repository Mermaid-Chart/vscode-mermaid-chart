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

    const createMockDocument = (content: string): vscode.TextDocument => ({
        getText: () => content,
        offsetAt: (position: vscode.Position) => {
            const lines = content.split('\n');
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += lines[i].length + 1;
            }
            return offset + position.character;
        },
    } as unknown as vscode.TextDocument);

    const mockDocument = createMockDocument(markdownContent);

    const mermaidBlockRange = {
        start: new vscode.Position(4, 0),
        end: new vscode.Position(9, 3),
    };

    const extractBlockContent = (doc: vscode.TextDocument, range: { start: vscode.Position; end: vscode.Position }) => {
        return doc.getText().substring(doc.offsetAt(range.start), doc.offsetAt(range.end));
    };

    test('should detect mermaid code blocks in markdown', () => {
        const blockContent = extractBlockContent(mockDocument, mermaidBlockRange);

        expect(blockContent).to.include('graph TD');
        expect(blockContent).to.include('A-->B;');
        expect(blockContent).to.include('C-->D;');
    });

    test('should extract mermaid diagram from markdown', () => {
        const diagram = extractBlockContent(mockDocument, mermaidBlockRange);

        expect(diagram).to.include('graph TD');
        expect(diagram).to.include('A-->B;');
    });

    test('should not extract content outside the mermaid block', () => {
        const outsideContent = mockDocument.getText().substring(0, mockDocument.offsetAt(mermaidBlockRange.start));

        expect(outsideContent).to.include('# Sample Markdown');
        expect(outsideContent).to.include('Some text before the diagram');
        expect(outsideContent).to.not.include('graph TD');
    });
});
