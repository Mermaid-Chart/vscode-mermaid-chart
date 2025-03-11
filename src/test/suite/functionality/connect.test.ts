
import * as vscode from 'vscode';
import { expect } from 'chai';
import * as sinon from 'sinon';

import * as projectCache from '../../../mermaidChartProvider';
import { MermaidChartProvider } from '../../../mermaidChartProvider';




suite('Connect Diagram Command', function () {
  let sandbox: sinon.SinonSandbox;
  let showQuickPickStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;
  let createDocumentStub: sinon.SinonStub;
  let setDocumentStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let createMermaidFileStub: sinon.SinonStub;
  let waitForSyncStub: sinon.SinonStub;
  let isSyncingStub: sinon.SinonStub;

  const mcAPI = {
    setDocument: sinon.stub(),
    createDocument: sinon.stub(),
  };

  const document: vscode.TextDocument = {
    uri: vscode.Uri.file('test.mmd'),
    fileName: 'test.mmd',
    languageId: 'markdown',
    version: 1,
    isDirty: false,
    isClosed: false,
    isUntitled: false,
    eol: vscode.EndOfLine.LF,
    lineCount: 1,
    getText: () => 'graph TD; A --> B;',
    save: async () => true,
    lineAt: (arg: number | vscode.Position) => {
      const lineNumber = typeof arg === 'number' ? arg : arg.line;
      const text = 'graph TD; A --> B;';
      return {
        lineNumber,
        text,
        range: new vscode.Range(lineNumber, 0, lineNumber, text.length),
        rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
        firstNonWhitespaceCharacterIndex: text.search(/\S|$/),
        isEmptyOrWhitespace: text.trim() === '',
      } as vscode.TextLine;
    },
    offsetAt: (position: vscode.Position) => position.character,
    positionAt: (offset: number) => new vscode.Position(0, offset),
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position,
    getWordRangeAtPosition: () => undefined,
  };

  setup(async function () {
    sandbox = sinon.createSandbox();
  
    
    openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(document);
    showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves({
      label: 'Test Project',
      description: 'Sample project',
      projectId: '123', 
    } as vscode.QuickPickItem & { projectId: string });
    

  
    
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
  
    
    createDocumentStub = mcAPI.createDocument.resolves({ documentID: '123' });
   

    setDocumentStub = mcAPI.setDocument.resolves();
  
    
    isSyncingStub = sandbox.stub(MermaidChartProvider, 'isSyncing').value(false);
    waitForSyncStub = sandbox.stub(MermaidChartProvider, 'waitForSync').resolves();


    createMermaidFileStub = sandbox.stub().resolves({
      document: { uri: vscode.Uri.file('newDiagram.mmd') },
    });

  
  });

  teardown(function () {
    sandbox.restore();
  });

  test('should connect diagram and save document', async function () {
    const uri = vscode.Uri.file('test.mmd');
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 18));

   
    await vscode.commands.executeCommand('mermaid.connectDiagram', uri, range);
    console.log("MermaidChartProvider.isSyncing:", MermaidChartProvider.isSyncing);
    console.log("waitForSyncStub called:", waitForSyncStub.called);
    
  

    console.log("openTextDocumentStub", openTextDocumentStub.called);
    console.log("showQuickPickStub", showQuickPickStub.called);

    console.log("createDocumentStub", createDocumentStub.called);
    console.log("setDocumentStub", setDocumentStub.called);
  
    console.log("createMermaidFileStub", createMermaidFileStub.called);

    
    expect(openTextDocumentStub.calledWith(uri)).to.be.true;
    expect(showQuickPickStub.calledOnce).to.be.true;
    expect(createDocumentStub.calledOnceWith('123')).to.be.true;
    expect(setDocumentStub.calledOnce).to.be.true;
    expect(setDocumentStub.args[0][0]).to.include({ documentID: '123' });
    expect(createMermaidFileStub.calledOnce).to.be.true;
    expect(showInformationMessageStub.calledWith('Operation cancelled.')).to.be.false;
  });

  test('should cancel operation if no project is selected', async function () {
    showQuickPickStub.resolves(null); 

    const uri = vscode.Uri.file('test.mmd');
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 15));
  
    
   
    await vscode.commands.executeCommand('mermaid.connectDiagram', uri, range);

    expect(createDocumentStub.called).to.be.false;
    expect(setDocumentStub.called).to.be.false;
    expect(showInformationMessageStub.calledWith('Operation cancelled.')).to.be.true;
  });
});




