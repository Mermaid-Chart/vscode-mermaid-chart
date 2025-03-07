import * as vscode from 'vscode';
import { expect } from 'chai';
import { RemoteSyncHandler } from '../../../remoteSyncHandler';
import { MermaidChartVSCode } from '../../../mermaidChartVSCode';


suite('RemoteSyncHandler', () => {
  let syncHandler: RemoteSyncHandler;
  let mockAPI: MermaidChartVSCode;

  setup(() => {
    // Mock the MermaidChartVSCode API
    mockAPI = {
      getDocument: async ({ documentID }: { documentID: string }) => {
        if (documentID === 'remoteId') {
          return { code: 'graph TD; A-->C' };
        }
        return null;
      }
    } as MermaidChartVSCode;

    syncHandler = new RemoteSyncHandler(mockAPI);
  });

  test('should continue sync if there are no conflicts', async () => {
    const mockDocument = {
      getText: () => 'graph TD; A-->B'
    } as vscode.TextDocument;

    const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');
    expect(result).to.equal('continue');
  });

  test('should abort sync if there are unresolved conflicts', async () => {
    const mockDocument = {
      getText: () => `<<<<<<< Current\ngraph TD; A-->B\n=======\ngraph TD; A-->C\n>>>>>>> Remote Changes`
    } as vscode.TextDocument;

    const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');
    expect(result).to.equal('abort');
  });

//   it('should handle conflict resolution by inserting markers', async () => {
//     const mockDocument = {
//       getText: () => 'graph TD; A-->B',
//       uri: vscode.Uri.file('mockFile'),
//       positionAt: (offset: number) => new vscode.Position(0, offset)
//     } as unknown as vscode.TextDocument;

//     const canSaveFile = await syncHandler.insertMergeConflictMarkers(mockDocument, 'graph TD; A-->C');
//     expect(canSaveFile).to.be.false;
//   });

test('should find differences between local and remote content', () => {
    const localContent = 'graph TD; A-->B';
    const remoteContent = 'graph TD; A-->C';
  
    const differences = syncHandler['findDifferences'](localContent, remoteContent);
  
    expect(differences.localLines).to.deep.equal(['graph TD; A-->B']);
    expect(differences.remoteLines).to.deep.equal(['graph TD; A-->C']);
  });
  

  test('should refresh from remote changes when no conflicts exist', async () => {
    const mockDocument = {
      getText: () => 'graph TD; A-->B'
    } as vscode.TextDocument;

    const result = await syncHandler.handleRemoteChanges(mockDocument, 'remoteId');
    expect(result).to.equal('continue');
  });

  test('should show error if remote changes fail to fetch', async () => {
    const mockDocument = {
      getText: () => 'graph TD; A-->B'
    } as vscode.TextDocument;

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
