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
    let sandbox: sinon.SinonSandbox;
    let openExternalStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let activeTextEditorStub: sinon.SinonStub;

    const mockActiveEditor = (text: string) => ({
        document: { getText: () => text },
    });

    const expectedUrls: Record<string, string> = {
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

    setup(() => {
        sandbox = sinon.createSandbox();

        openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);
        showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
        activeTextEditorStub = sandbox.stub(vscode.window, 'activeTextEditor');
    });

    teardown(() => {
        sandbox.restore();
    });

    diagramTypes.forEach((diagram) => {
        test(`should open correct URL for ${diagram}`, async function () {
            const editorStub = mockActiveEditor(`${diagram} some diagram content`);
            activeTextEditorStub.value(editorStub);

            await vscode.commands.executeCommand('mermaidChart.diagramHelp');

            assert.ok(openExternalStub.calledOnce, 'openExternal should be called once');
            assert.strictEqual(
                openExternalStub.calledWith(vscode.Uri.parse(expectedUrls[diagram])),
                true,
                `URL for ${diagram} is correct`
            );
        });
    });

    test('should show warning message if no active editor is found', async function () {
        activeTextEditorStub.value(undefined);

        await vscode.commands.executeCommand('mermaidChart.diagramHelp');

        assert.ok(showWarningMessageStub.calledOnce, 'showWarningMessage should be called once');
        assert.strictEqual(showWarningMessageStub.calledWith('No active editor found.'), true, 'Warning message is correct');
    });

    test('should return correct URL from getHelpUrl for known diagram types', function () {
        Object.entries(expectedUrls).forEach(([diagram, url]) => {
            assert.strictEqual(getHelpUrl(diagram), url, `URL for ${diagram} is correct`);
        });
    });
});
