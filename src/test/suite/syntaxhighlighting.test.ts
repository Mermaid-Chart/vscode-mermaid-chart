import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { applySyntaxHighlighting } from '../../syntaxHighlighter';


// suite('applySyntaxHighlighting', () => {
//   let setTextDocumentLanguageStub: sinon.SinonStub;
//   let loadTmLanguageStub: sinon.SinonStub;
//   let consoleErrorStub: sinon.SinonStub;

//   const mockDocument = {
//     languageId: 'plaintext',
//     getText: sinon.stub().returns('mock content'),
//     uri: { toString: sinon.stub().returns('file://test.mmd') },
//   } as unknown as vscode.TextDocument;

//   setup(() => {
//     setTextDocumentLanguageStub = sinon.stub(vscode.languages, 'setTextDocumentLanguage').resolves();
//     loadTmLanguageStub = sinon.stub();
//     consoleErrorStub = sinon.stub(console, 'error');
//   });

//   teardown(() => {
//     sinon.restore();
//   });

//   test('should apply syntax highlighting if tmLanguage is loaded', async () => {
//     loadTmLanguageStub.returns({ name: 'mermaid' });

//     applySyntaxHighlighting(mockDocument, 'path/to/tmLanguage');

//     sinon.assert.calledOnce(loadTmLanguageStub);
//     sinon.assert.calledWith(setTextDocumentLanguageStub, mockDocument, 'mermaid.mermaid');

//     expect(setTextDocumentLanguageStub.called).to.be.true;
//   });

//   test('should not apply syntax highlighting if tmLanguage is not loaded', async () => {
//     loadTmLanguageStub.returns(null);

//     applySyntaxHighlighting(mockDocument, 'path/to/tmLanguage');

//     sinon.assert.notCalled(setTextDocumentLanguageStub);
//   });

//   test('should log an error if setting language fails', async () => {
//     loadTmLanguageStub.returns({ name: 'mermaid' });
//     setTextDocumentLanguageStub.rejects(new Error('Language setting failed'));

//     applySyntaxHighlighting(mockDocument, 'path/to/tmLanguage');

//     await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for promise rejection

//     sinon.assert.calledOnce(consoleErrorStub);
//     sinon.assert.calledWith(consoleErrorStub, 'Failed to apply syntax highlighting:', sinon.match.instanceOf(Error));
//   });
// });
