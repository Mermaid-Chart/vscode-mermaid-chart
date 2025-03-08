import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { expect } from 'chai';
import { applySyntaxHighlighting } from '../../syntaxHighlighter';

const diagramMappings: Record<string, string[]> = {
  c4Diagram: ["C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment"],
  classDiagram: ["classDiagram", "classDiagram-v2"],
  erDiagram: ["erDiagram"],
  flowchart: ["flowchart", "flowchart-v2", "flowchart-elk", "graph"],
  gantt: ["gantt", "section"],
  gitGraph: ["gitGraph"],
  info: ["info"],
  journey: ["journey"],
  pie: ["pie"],
  requirementDiagram: ["requirement", "requirementDiagram"],
  sequenceDiagram: ["sequenceDiagram"],
  quadrantChart: ["quadrantChart"],
  mindmap: ["mindmap"],
  timeline: ["timeline"],
  xychart: ["xychart", "xychart-beta"],
  sankeyDiagram: ["sankey", "sankey-beta"],
  stateDiagram: ["stateDiagram", "stateDiagram-v2"],
  kanban: ["kanban"],
  block: ["block-beta", "block", "blockDiagram"],
  architecture: ["architecture"],
  packet: ["packet", "packet-beta"],
};

suite('Mermaid Syntax Highlighting Tests', () => {
  const syntaxesDir = path.join(__dirname, '../../../syntaxes');

  for (const diagramType of Object.keys(diagramMappings)) {
    test(`should have a grammar file for ${diagramType}`, () => {
      const grammarPath = path.join(syntaxesDir, `mermaid-${diagramType}.tmLanguage.json`);
      const fileExists = fs.existsSync(grammarPath);

      expect(fileExists, `Grammar file missing for ${diagramType}: ${grammarPath}`).to.be.true;
    });

    test(`should load and apply syntax highlighting for ${diagramType}`, async () => {
      const content = `%% Example ${diagramType} diagram`;
      const document = await vscode.workspace.openTextDocument({ content });

      const grammarPath = path.join(syntaxesDir, `mermaid-${diagramType}.tmLanguage.json`);
     

     
      const grammarExists = fs.existsSync(grammarPath);
      assert.strictEqual(grammarExists, true, `Grammar file missing for ${diagramType}: ${grammarPath}`);

     
      await applySyntaxHighlighting(document, grammarPath);
      await new Promise((resolve) => setTimeout(resolve, 100));

    
      const expectedLanguageId = `mermaid.${diagramType}`;
      assert.strictEqual(document.languageId, expectedLanguageId, `Expected ${expectedLanguageId} but got ${document.languageId}`);
    });
  }
});


