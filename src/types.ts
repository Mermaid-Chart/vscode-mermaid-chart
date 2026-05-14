// Minimal typing for the VS Code built-in Git extension (vscode.git).
// Only the surface actually used by this extension is typed here.

export interface GitExtensionExports {
  getAPI(version: number): API;
}

export interface API {
  readonly repositories: Repository[];
}

export interface Repository {
  readonly rootUri: { fsPath: string };
  push(): Promise<void>;
}

export interface MCProject {
  id: string;
  title: string;
  parentID?: string; // Add parentID here
  // Add other properties that you expect from the SDK's MCProject
}