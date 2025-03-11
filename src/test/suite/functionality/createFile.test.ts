import * as assert from "assert";
import * as vscode from "vscode";
import sinon from "sinon";
import { TempFileCache } from "../../../cache/tempFileCache";
import { PreviewPanel } from "../../../panels/previewPanel";
import { createMermaidFile } from "../../../commands/createFile";

suite("createMermaidFile Tests", () => {
  let sandbox: sinon.SinonSandbox;
  let openTextDocumentStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let addTempUriStub: sinon.SinonStub;
  let removeTempUriStub: sinon.SinonStub;
  let createOrShowStub: sinon.SinonStub;

  const mockContext = {
    globalState: { update: sinon.stub() },
  } as unknown as vscode.ExtensionContext;

  setup(() => {
    sandbox = sinon.createSandbox();

    openTextDocumentStub = sandbox.stub(vscode.workspace, "openTextDocument");
    showTextDocumentStub = sandbox.stub(vscode.window, "showTextDocument");
    addTempUriStub = sandbox.stub(TempFileCache, "addTempUri");
    removeTempUriStub = sandbox.stub(TempFileCache, "removeTempUri");
    createOrShowStub = sandbox.stub(PreviewPanel, "createOrShow");
  });

 teardown(() => {
    sandbox.restore();
  });

  function createMockEditor(filePath: string): vscode.TextEditor {
    return {
      document: {
        uri: vscode.Uri.file(filePath),
      },
    } as vscode.TextEditor;
  }

  test("should create a Mermaid file with default content", async () => {
    const mockEditor = createMockEditor("mockFile.mmd");

    openTextDocumentStub.resolves(mockEditor.document);
    showTextDocumentStub.resolves(mockEditor);

    const result = await createMermaidFile(mockContext, null, false);

    assert.strictEqual(result, mockEditor);
    sinon.assert.calledOnce(openTextDocumentStub);
    sinon.assert.calledOnce(showTextDocumentStub);
    sinon.assert.calledOnceWithExactly(removeTempUriStub, mockContext, mockEditor.document.uri.toString());
    sinon.assert.calledOnceWithExactly(createOrShowStub, mockEditor.document);
  });

  test("should create a Mermaid file with provided content", async () => {
    const diagramContent = "flowchart TD; A-->B;";
    const mockEditor = createMockEditor("mockFile.mmd");

    openTextDocumentStub.resolves(mockEditor.document);
    showTextDocumentStub.resolves(mockEditor);

    const result = await createMermaidFile(mockContext, diagramContent, false);

    assert.strictEqual(result, mockEditor);
    sinon.assert.calledOnceWithExactly(openTextDocumentStub, { language: "mermaid", content: diagramContent });
    sinon.assert.calledOnce(showTextDocumentStub);
    sinon.assert.calledOnceWithExactly(removeTempUriStub, mockContext, mockEditor.document.uri.toString());
    sinon.assert.calledOnceWithExactly(createOrShowStub, mockEditor.document);
  });

  test("should add temp URI when isTempFile is true", async () => {
    const mockEditor = createMockEditor("tempFile.mmd");

    openTextDocumentStub.resolves(mockEditor.document);
    showTextDocumentStub.resolves(mockEditor);

    await createMermaidFile(mockContext, null, true);

    sinon.assert.calledOnceWithExactly(addTempUriStub, mockContext, mockEditor.document.uri.toString());
  });

  test("should handle errors gracefully and return null", async () => {
    openTextDocumentStub.rejects(new Error("Test Error"));

    const result = await createMermaidFile(mockContext, null, false);

    assert.strictEqual(result, null);
  });
});
