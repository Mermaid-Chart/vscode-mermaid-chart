import * as vscode from 'vscode';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PreviewPanel } from '../../../panels/previewPanel';
import { getPreview } from '../../../commands/createFile';

suite('getPreview', () => {
    let showErrorMessageStub: sinon.SinonStub;
    let createOrShowStub: sinon.SinonStub;
    let activeTextEditorStub: sinon.SinonStub;

    setup(() => {
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        createOrShowStub = sinon.stub(PreviewPanel, 'createOrShow');
        activeTextEditorStub = sinon.stub(vscode.window, 'activeTextEditor');
    });

    teardown(() => {
        sinon.restore();
    });

    const setActiveEditor = (fileName: string | null) => {
        activeTextEditorStub.value(
            fileName
                ? { document: { fileName } as vscode.TextDocument }
                : undefined
        );
    };

    test('should show an error message if no active editor', () => {
        setActiveEditor(null);

        getPreview();

        expect(showErrorMessageStub.calledOnceWith("No active editor. Open a .mmd file to preview.")).to.be.true;
        expect(createOrShowStub.called).to.be.false;
    });

    test('should create or show a preview if the file is a Mermaid file', () => {
        setActiveEditor('example.mmd');

        getPreview();

        expect(createOrShowStub.calledOnce).to.be.true;
        expect(createOrShowStub.calledWithMatch({ fileName: 'example.mmd' })).to.be.true;
        expect(showErrorMessageStub.called).to.be.false;
    });
});






