import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
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

  setup(() => {
    console.log("Setting up Mermaid Syntax Highlighting Tests...");
  });

  teardown(() => {
    console.log("Teardown complete.");
  });

  Object.keys(diagramMappings).forEach((diagramType) => {
    suite(`${diagramType} Syntax Highlighting`, () => {
      const grammarPath = path.join(syntaxesDir, `mermaid-${diagramType}.tmLanguage.json`);

      test(`should have a grammar file for ${diagramType}`, () => {
        const fileExists = fs.existsSync(grammarPath);
        expect(fileExists, `Grammar file missing for ${diagramType}: ${grammarPath}`).to.be.true;
      });

      test(`should load and apply syntax highlighting for ${diagramType}`, async () => {
        const content = `%% Example ${diagramType} diagram`;
        const document = await vscode.workspace.openTextDocument({ content });

        const grammarExists = fs.existsSync(grammarPath);
        expect(grammarExists, `Grammar file missing for ${diagramType}: ${grammarPath}`).to.be.true;

        await applySyntaxHighlighting(document, grammarPath);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const expectedLanguageId = `mermaid.${diagramType}`;
        expect(document.languageId, `Expected ${expectedLanguageId} but got ${document.languageId}`).to.equal(expectedLanguageId);
      });
    });
  });
});
