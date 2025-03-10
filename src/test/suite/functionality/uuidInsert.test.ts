import * as vscode from "vscode";
import { expect } from "chai";
import sinon from "sinon";
import { insertMermaidChartToken } from "../../../util";



suite("insertUuidIntoEditorDisposable Tests", function () {
  let showErrorMessageStub: sinon.SinonStub;
  let editStub: sinon.SinonStub;
  let getItemTypeStub: sinon.SinonStub;
  let activeEditorStub: any; 
  let provider: any;

 setup(()=> {
    showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage");
    editStub = sinon.stub();

    
    activeEditorStub = {
      document: { languageId: "markdown" },
      selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
      edit: sinon.stub().callsFake((callback: any) => {
        callback({ 
          insert: sinon.stub(), 
          replace: sinon.stub(), 
          delete: sinon.stub(), 
          setEndOfLine: sinon.stub() 
        });
        return Promise.resolve(true);
      }),
    };

    sinon.stub(vscode.window, "activeTextEditor").get(() => activeEditorStub);

    provider = { getItemTypeFromUuid: sinon.stub() };
    getItemTypeStub = provider.getItemTypeFromUuid;
  });

 teardown( () => {
    sinon.restore();
  });

  test("should show error message when UUID is missing", async function () {
    await vscode.commands.executeCommand("mermaidChart.insertUuidIntoEditor", {
      uuid: null,
    });

    expect(showErrorMessageStub.calledOnce).to.be.true;
    expect(showErrorMessageStub.calledWith("Invalid item selected. No UUID found.")).to.be.true;
  });

  test("should not insert token when item type is not a document", async function () {
    getItemTypeStub.returns("someOtherType");

    await insertMermaidChartToken("mock-uuid", provider);

    expect(getItemTypeStub.calledOnceWith("mock-uuid")).to.be.true;
    expect(editStub.notCalled).to.be.true;
  });

  test("should insert token when item type is a document", async function () {
    getItemTypeStub.returns("document");

    await insertMermaidChartToken("mock-uuid", provider);

    expect(getItemTypeStub.calledOnceWith("mock-uuid")).to.be.true;
    expect(activeEditorStub.edit.calledOnce).to.be.true;
  });

  test("should not insert token if no active editor", async function () {
    sinon.stub(vscode.window, "activeTextEditor").get(() => undefined);

    await insertMermaidChartToken("mock-uuid", provider);

    expect(editStub.notCalled).to.be.true;
  });
});
