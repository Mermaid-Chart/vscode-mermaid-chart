import { REALTIME_LISTEN_TYPES, REALTIME_SUBSCRIBE_STATES, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { Observable } from 'lib0/observable';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface SupabaseProviderConfig {
  channelName: string;
  log: {
    debug: typeof console.debug;
    error: typeof console.error;
  };
}

export default class SupabaseProvider extends Observable<string> {
  public readonly id: number;
  public awareness: awarenessProtocol.Awareness;
  public connected = false;
  private channel: RealtimeChannel | undefined;
  private _synced = false;
  private readonly resyncInterval: ReturnType<typeof setInterval>;

  constructor(
    private doc: Y.Doc,
    private supabase: SupabaseClient,
    private config: SupabaseProviderConfig,
  ) {
    super();
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.id = doc.clientID;

    // Sync every 3 seconds
    this.resyncInterval = setInterval(() => {
      this.emit('message', [Y.encodeStateAsUpdate(this.doc)]);
    }, 3000);

    this.on('awareness', async (update: Uint8Array) => {
      await this.sendUpdateToChannel(update, 'awareness');
    });

    this.on('message', async (update: Uint8Array) => {
      await this.sendUpdateToChannel(update, 'message');
    });

    this.connect();
    this.doc.on('update', this.onDocumentUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
  }

  private sendUpdateToChannel = async (update: Uint8Array, event: 'message' | 'awareness') => {
    if (!this.connected || !this.channel) return;
    await this.channel.send({
      type: 'broadcast',
      event,
      payload: Array.from(update),
    });
  };

  private onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this) {
      this.emit('message', [update]);
    }
  };

  private onAwarenessUpdate = ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    const changedClients = added.concat(updated).concat(removed);
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
    this.emit('awareness', [awarenessUpdate]);
  };

  private connect = () => {
    this.channel = this.supabase.channel(this.config.channelName);

    this.channel
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: 'message' }, ({ payload }) => {
        Y.applyUpdate(this.doc, Uint8Array.from(payload), this);
      })
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: 'awareness' }, ({ payload }) => {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, Uint8Array.from(payload), this);
      })
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          this.connected = true;
        }
      });
  };

  public destroy = () => {
    clearInterval(this.resyncInterval);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.doc.off('update', this.onDocumentUpdate);
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = undefined;
    }
  };
} 