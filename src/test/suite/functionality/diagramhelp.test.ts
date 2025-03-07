import assert from 'assert';
import * as vscode from 'vscode';
import sinon from 'sinon';
import { getHelpUrl } from '../../../util';


const diagramTypes = [
    'erdiagram',
    'gitgraph',
    'journey',
    'classdiagram',
    'statediagram',
    'sequencediagram',
    'requirementdiagram',
    'xychart',
    'quadrantchart',
    'c4context',
];

suite('Mermaid Chart Diagram Help Command', function () {
    let openExternalStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let activeTextEditorStub: sinon.SinonStub;

    setup(() => {
       
        openExternalStub = sinon.stub(vscode.env, 'openExternal').returns(Promise.resolve(true)); 
        
       
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

        activeTextEditorStub = sinon.stub(vscode.window, 'activeTextEditor');
    });

    teardown(() => {
        // Restore all stubs
        openExternalStub.restore();
        showWarningMessageStub.restore();
        activeTextEditorStub.restore();
    });

    test('should open correct URL for ER Diagram', function () {
        const activeEditorStub = {
            document: {
                getText: () => 'erdiagram some diagram content',
            }
        };

        activeTextEditorStub.value(activeEditorStub);

        vscode.commands.executeCommand('mermaidChart.diagramHelp');

        assert.ok(openExternalStub.calledOnce, 'openExternal was called');
        assert.strictEqual(openExternalStub.calledWith(vscode.Uri.parse('https://mermaid.js.org/syntax/entityRelationshipDiagram.html')), true, 'URL for ER diagram is correct');
    });

    test('should open correct URL for Sequence Diagram', function () {
        const activeEditorStub = {
            document: {
                getText: () => 'sequencediagram some diagram content',
            }
        };

        // Mock the active editor
        activeTextEditorStub.value(activeEditorStub);

        vscode.commands.executeCommand('mermaidChart.diagramHelp');

        assert.ok(openExternalStub.calledOnce, 'openExternal was called');
        assert.strictEqual(openExternalStub.calledWith(vscode.Uri.parse('https://mermaid.js.org/syntax/sequenceDiagram.html')), true, 'URL for Sequence diagram is correct');
    });

    test('should show warning message if no active editor is found', function () {
        // Mock no active editor
        activeTextEditorStub.value(undefined);

        vscode.commands.executeCommand('mermaidChart.diagramHelp');

        assert.ok(showWarningMessageStub.calledOnce, 'showWarningMessage was called');
        assert.strictEqual(showWarningMessageStub.calledWith('No active editor found.'), true, 'Warning message is correct');
    });

    test('should return correct URL from getHelpUrl for known diagram types', function () {
        const urls = {
            erdiagram: 'https://mermaid.js.org/syntax/entityRelationshipDiagram.html',
            gitgraph: 'https://mermaid.js.org/syntax/gitgraph.html',
            journey: 'https://mermaid.js.org/syntax/userJourney.html',
            classdiagram: 'https://mermaid.js.org/syntax/classDiagram.html',
            statediagram: 'https://mermaid.js.org/syntax/stateDiagram.html',
            sequencediagram: 'https://mermaid.js.org/syntax/sequenceDiagram.html',
            requirementdiagram: 'https://mermaid.js.org/syntax/requirementDiagram.html',
            xychart: 'https://mermaid.js.org/syntax/xyChart.html',
            quadrantchart: 'https://mermaid.js.org/syntax/quadrantChart.html',
            c4context: 'https://mermaid.js.org/syntax/c4.html',
        };

      
        Object.keys(urls).forEach((key) => {
            const diagram = key as keyof typeof urls; 
            assert.strictEqual(getHelpUrl(diagram), urls[diagram]);
        });
    });

  
});
