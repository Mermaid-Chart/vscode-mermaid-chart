
import * as vscode from "vscode";
import * as sinon from "sinon";
import { expect } from "chai";
import { getProjectIdForDocument, updateDiagramInCache } from "../../../mermaidChartProvider";
import { ensureIdField } from "../../../frontmatter";
import { createMermaidFile } from "../../../commands/createFile";
import { MermaidChartVSCode } from "../../../mermaidChartVSCode";

suite("mermaidChart.downloadDiagram Command", function () {
  let showErrorMessageStub: sinon.SinonStub;
  let getProjectIdStub: sinon.SinonStub;
  let ensureIdStub: sinon.SinonStub;
  let setDocumentStub: sinon.SinonStub;
  let updateCacheStub: sinon.SinonStub;
  let createFileStub: sinon.SinonStub;
  const mcAPI = new MermaidChartVSCode();

  const mockContext = {} as vscode.ExtensionContext;
  const mockDocument = { uuid: "1234", code: "graph TD; A-->B;" };

  setup(() => {
    showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage");
    getProjectIdStub = sinon.stub().callsFake(getProjectIdForDocument);
    ensureIdStub = sinon.stub().callsFake(ensureIdField);
    setDocumentStub = sinon.stub(mcAPI, "setDocument");
    updateCacheStub = sinon.stub().callsFake(updateDiagramInCache);
    createFileStub = sinon.stub().callsFake(createMermaidFile);
  });

  teardown(() => {
    sinon.restore();
  });

  test("should show error message if no item is provided", async () => {
    await vscode.commands.executeCommand("mermaidChart.downloadDiagram", null);
    expect(showErrorMessageStub.calledWith("No code found for this diagram.")).to.be.true;
  });

  test("should show error message if item has no code", async () => {
    await vscode.commands.executeCommand("mermaidChart.downloadDiagram", { uuid: "1234" });
    expect(showErrorMessageStub.calledWith("No code found for this diagram.")).to.be.true;
  });

  test("should show error message if no project ID is found", async () => {
    getProjectIdStub.returns(null);
    await vscode.commands.executeCommand("mermaidChart.downloadDiagram", mockDocument);
    expect(showErrorMessageStub.calledWith("No project ID found for this diagram.")).to.be.true;
  });

  test("should process and save the diagram when valid inputs are provided", async () => {
    getProjectIdStub.returns("proj-5678");
    ensureIdStub.returns("processed-graph TD; A-->B;");

    await vscode.commands.executeCommand("mermaidChart.downloadDiagram", mockDocument);
    console.log(setDocumentStub.called); 
    console.log(updateCacheStub.called); 
    console.log(createFileStub.called);  

    expect(ensureIdStub.calledWith(mockDocument.code, mockDocument.uuid)).to.be.true;
    expect(setDocumentStub.calledWith({
      documentID: "1234",
      projectID: "proj-5678",
      code: "processed-graph TD; A-->B;"
    })).to.be.true;
    expect(updateCacheStub.calledWith("1234", "processed-graph TD; A-->B;")).to.be.true;
    expect(createFileStub.calledWith(mockContext, "processed-graph TD; A-->B;", false)).to.be.true;


  });

  test("should handle mcAPI.setDocument errors gracefully", async () => {
    getProjectIdStub.returns("proj-5678");
    

    ensureIdStub.returns("processed-graph TD; A-->B;");
    setDocumentStub.rejects(new Error("API failure"));

    try {
      await vscode.commands.executeCommand("mermaidChart.downloadDiagram", mockDocument);
    } catch (error) {
     
    }
  });
});
