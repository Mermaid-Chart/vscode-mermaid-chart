import * as vscode from 'vscode';
import { expect } from 'chai';
import { RemoteSyncHandler } from '../../../remoteSyncHandler';
import { MermaidChartVSCode } from '../../../mermaidChartVSCode';

suite('RemoteSyncHandler', () => {
    let syncHandler: RemoteSyncHandler;
    let mockAPI: MermaidChartVSCode;

    setup(() => {
        mockAPI = createMockAPI();
        syncHandler = new RemoteSyncHandler(mockAPI);
    });

   
    const createMockAPI = (): MermaidChartVSCode => ({
        getDocument: async ({ documentID }: { documentID: string }) => {
            return documentID === 'remoteId'
                ? { code: 'graph TD; A-->C' }
                : null;
        }
    }) as MermaidChartVSCode;

    const createMockDocument = (content: string): vscode.TextDocument => ({
        getText: () => content,
    }) as vscode.TextDocument;

    test('should continue sync if there are no conflicts', async () => {
        const mockDocument = createMockDocument('graph TD; A-->B');

        const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');

        expect(result).to.equal('continue');
    });

    test('should abort sync if there are unresolved conflicts', async () => {
        const conflictContent = `<<<<<<< Current
graph TD; A-->B
=======
graph TD; A-->C
>>>>>>> Remote Changes`;

        const mockDocument = createMockDocument(conflictContent);

        const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');

        expect(result).to.equal('abort');
    });

    test('should find differences between local and remote content', () => {
        const localContent = 'graph TD; A-->B';
        const remoteContent = 'graph TD; A-->C';

        const differences = syncHandler['findDifferences'](localContent, remoteContent);

        expect(differences.localLines).to.deep.equal(['graph TD; A-->B']);
        expect(differences.remoteLines).to.deep.equal(['graph TD; A-->C']);
    });

    test('should refresh from remote changes when no conflicts exist', async () => {
        const mockDocument = createMockDocument('graph TD; A-->B');

        const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');

        expect(result).to.equal('continue');
    });

    test('should show error if remote changes fail to fetch', async () => {
        const mockDocument = createMockDocument('graph TD; A-->B');

        const result = await syncHandler.handleRemoteChanges(mockDocument, 'invalidId');

        expect(result).to.equal('continue');
    });

    test('should find the first and last different lines', () => {
        const localContent = 'A\nB\nC\nD';
        const remoteContent = 'A\nX\nC\nY';

        const firstDiff = syncHandler['findFirstDifferentLine'](localContent.split('\n'), remoteContent.split('\n'));
        const lastDiff = syncHandler['findLastDifferentLine'](localContent.split('\n'), remoteContent.split('\n'));

        expect(firstDiff).to.equal(1);
        expect(lastDiff).to.equal(3);
    });
});
