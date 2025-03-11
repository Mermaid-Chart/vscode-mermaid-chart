import * as vscode from 'vscode';
import { expect } from 'chai';
import { MermaidChartCodeLensProvider } from '../../../mermaidChartCodeLensProvider';


suite('MermaidChartCodeLensProvider', () => {
  let provider: MermaidChartCodeLensProvider;
  let codeLenses: vscode.CodeLens[];

  setup(() => {
    provider = new MermaidChartCodeLensProvider([]);
    codeLenses = [];
  });


  const mockToken: any = {
    uri: vscode.Uri.file('/path/to/file.md'),
    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
  };

  
  const mockSession: any = {
    accessToken: 'mockToken',
  };

  test('should add "Connect Diagram" and "Edit Diagram" lenses when session exists but diagramId is undefined', () => {
    const diagramId = undefined;

    (provider as any).addAuxFileCodeLenses(codeLenses, mockToken, mockSession, diagramId);

    expect(codeLenses).to.have.length(2);
    expect(codeLenses[0].command?.title).to.equal('Connect Diagram');
    expect(codeLenses[0].command?.command).to.equal('mermaid.connectDiagram');
    expect(codeLenses[1].command?.title).to.equal('Edit Diagram');
    expect(codeLenses[1].command?.command).to.equal('mermaid.editAuxFile');
  });

  test('should add "Edit Diagram in Mermaid Chart" and "Edit Diagram" lenses when session and diagramId exist', () => {
    const diagramId = '12345';

    (provider as any).addAuxFileCodeLenses(codeLenses, mockToken, mockSession, diagramId);

    expect(codeLenses).to.have.length(2);
    expect(codeLenses[0].command?.title).to.equal('Edit Diagram in Mermaid Chart');
    expect(codeLenses[0].command?.command).to.equal('extension.editMermaidChart');
    expect(codeLenses[0].command?.arguments).to.deep.equal([diagramId]);
    expect(codeLenses[1].command?.title).to.equal('Edit Diagram');
    expect(codeLenses[1].command?.command).to.equal('mermaid.editAuxFile');
  });

  test('should only add "Edit Diagram" lens when session is undefined', () => {
    const session = undefined;
    const diagramId = '12345';

    (provider as any).addAuxFileCodeLenses(codeLenses, mockToken, session, diagramId);

    expect(codeLenses).to.have.length(1);
    expect(codeLenses[0].command?.title).to.equal('Edit Diagram');
    expect(codeLenses[0].command?.command).to.equal('mermaid.editAuxFile');
  });
});
