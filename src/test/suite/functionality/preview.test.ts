import * as vscode from 'vscode';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PreviewPanel } from '../../../panels/previewPanel';
import { getPreview } from '../../../commands/createFile';


suite('getPreview', () => {
  let showErrorMessageStub: sinon.SinonStub;
  let createOrShowStub: sinon.SinonStub;

 setup(() => {
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    createOrShowStub = sinon.stub(PreviewPanel, 'createOrShow');
  });

  teardown(() => {
    sinon.restore();
  });

  test('should show an error message if no active editor', () => {
    sinon.stub(vscode.window, 'activeTextEditor').value(undefined);

    getPreview();

    expect(showErrorMessageStub.calledOnce).to.be.true;
    expect(showErrorMessageStub.calledWith("No active editor. Open a .mmd file to preview.")).to.be.true;
    expect(createOrShowStub.called).to.be.false;
  });


  test('should create or show a preview if the file is a Mermaid file', () => {
    const mockDocument = {
      fileName: 'example.mmd',

    } as vscode.TextDocument;

    sinon.stub(vscode.window, 'activeTextEditor').value({ document: mockDocument });

    getPreview();

    expect(createOrShowStub.calledOnce).to.be.true;
    expect(createOrShowStub.calledWith(mockDocument)).to.be.true;
    expect(showErrorMessageStub.called).to.be.false;
  });
});





