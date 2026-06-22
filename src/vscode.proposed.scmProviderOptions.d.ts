/*---------------------------------------------------------------------------------------------
 * Proposed API: scmProviderOptions — https://github.com/microsoft/vscode/issues/254910
 * Enables createSourceControl(..., isHidden) to keep provider out of Source Control UI.
 *--------------------------------------------------------------------------------------------*/

declare module "vscode" {
  export interface SourceControl {
    /**
     * Context value for scm/sourceControl/context menu when clauses.
     */
    contextValue?: string;

    /**
     * Fired when the parent source control is disposed.
     */
    readonly onDidDisposeParent: Event<void>;
  }

  export namespace scm {
    export function createSourceControl(
      id: string,
      label: string,
      rootUri?: Uri,
      iconPath?: IconPath,
      isHidden?: boolean,
      parent?: SourceControl,
    ): SourceControl;
  }
}
