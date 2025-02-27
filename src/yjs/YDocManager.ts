import * as Y from 'yjs';
import { SupabaseClient } from '@supabase/supabase-js';
import SupabaseProvider from './ySupabase';
import { C } from '../constants';

export class YDocManager {
  private yDoc: Y.Doc;
  private ySupabase: SupabaseProvider;
  private isUpdating = false;

  constructor(
    private readonly documentId: string,
    private readonly supabase: SupabaseClient,
    private readonly onContentChange: (content: string) => void
  ) {
    this.yDoc = new Y.Doc();
    this.ySupabase = new SupabaseProvider(this.yDoc, this.supabase, {
      channelName: `mermaid-${documentId}`,
      log: {
        debug: console.debug,
        error: console.error
      }
    });

    // Listen for changes from YJS
    const textField = this.yDoc.getText(C.yDocCodeKey);
    textField.observe(() => {
      if (!this.isUpdating) {
        this.onContentChange(textField.toString());
      }
    });
  }

  public updateContent(content: string) {
    const textField = this.yDoc.getText(C.yDocCodeKey);
    if (textField.toString() !== content) {
      this.isUpdating = true;
      textField.delete(0, textField.length);
      textField.insert(0, content);
      this.isUpdating = false;
    }
  }

  public dispose() {
    this.yDoc.destroy();
    this.ySupabase.destroy();
  }
} 