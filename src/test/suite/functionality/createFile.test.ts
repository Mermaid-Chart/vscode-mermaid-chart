import * as assert from "assert";
import * as vscode from "vscode";
import sinon from "sinon";
import { TempFileCache } from "../../../cache/tempFileCache";
import { PreviewPanel } from "../../../panels/previewPanel";
import { createMermaidFile } from "../../../commands/createFile";


suite("createMermaidFile Tests", () => {
  let openTextDocumentStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let addTempUriStub: sinon.SinonStub;
  let removeTempUriStub: sinon.SinonStub;
  let createOrShowStub: sinon.SinonStub;
  let trackExceptionStub: sinon.SinonStub;

  const mockContext = {
    globalState: { update: sinon.stub() },
  } as unknown as vscode.ExtensionContext;

  setup(() => {
    openTextDocumentStub = sinon.stub(vscode.workspace, "openTextDocument");
    showTextDocumentStub = sinon.stub(vscode.window, "showTextDocument");
    addTempUriStub = sinon.stub(TempFileCache, "addTempUri");
    removeTempUriStub = sinon.stub(TempFileCache, "removeTempUri");
    createOrShowStub = sinon.stub(PreviewPanel, "createOrShow");
   
  });

  teardown(() => {
    sinon.restore();
  });

  test("should create a Mermaid file with default content", async () => {
    const mockDocument = {
      uri: vscode.Uri.file("mockFile.mmd"),
    } as vscode.TextDocument;

    const mockEditor = {
      document: mockDocument,
    } as vscode.TextEditor;

    openTextDocumentStub.resolves(mockDocument);
    showTextDocumentStub.resolves(mockEditor);

    const result = await createMermaidFile(mockContext, null, false);

    assert.strictEqual(result, mockEditor);
    assert.ok(openTextDocumentStub.calledOnce, "openTextDocument should be called once");
    assert.ok(showTextDocumentStub.calledOnce, "showTextDocument should be called once");
    assert.ok(removeTempUriStub.calledOnceWith(mockContext, mockDocument.uri.toString()), "removeTempUri should be called with correct arguments");
    assert.ok(createOrShowStub.calledOnceWith(mockDocument), "createOrShow should be called with the document");
    
  });

  test("should create a Mermaid file with provided content", async () => {
    const diagramContent = "flowchart TD; A-->B;";
    const mockDocument = {
      uri: vscode.Uri.file("mockFile.mmd"),
    } as vscode.TextDocument;

    const mockEditor = {
      document: mockDocument,
    } as vscode.TextEditor;

    openTextDocumentStub.resolves(mockDocument);
    showTextDocumentStub.resolves(mockEditor);

    const result = await createMermaidFile(mockContext, diagramContent, false);

    assert.strictEqual(result, mockEditor);
    assert.ok(openTextDocumentStub.calledOnceWith({ language: "mermaid", content: diagramContent }));
    assert.ok(showTextDocumentStub.calledOnce);
    assert.ok(removeTempUriStub.calledOnceWith(mockContext, mockDocument.uri.toString()));
    assert.ok(createOrShowStub.calledOnceWith(mockDocument));
  });

  test("should add temp URI when isTempFile is true", async () => {
    const mockDocument = {
      uri: vscode.Uri.file("tempFile.mmd"),
    } as vscode.TextDocument;

    const mockEditor = {
      document: mockDocument,
    } as vscode.TextEditor;

    openTextDocumentStub.resolves(mockDocument);
    showTextDocumentStub.resolves(mockEditor);

    await createMermaidFile(mockContext, null, true);

    assert.ok(addTempUriStub.calledOnceWith(mockContext, mockDocument.uri.toString()));
  });

  test("should handle errors gracefully and return null", async () => {
    const errorMessage = new Error("Test Error");
    openTextDocumentStub.rejects(errorMessage);

    const result = await createMermaidFile(mockContext, null, false);

    assert.strictEqual(result, null);
  
  });
});
