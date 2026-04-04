import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.config';
import { GameMessage, PlayerInfo } from './MessageTypes';

type MessageHandler = (message: GameMessage, senderId: string) => void;

// BroadcastChannel-based fallback for local testing (same browser, multiple tabs)
class LocalChannel {
  private bc: BroadcastChannel;
  private handlers: Array<(payload: { payload: { message: GameMessage; senderId: string } }) => void> = [];

  constructor(name: string) {
    this.bc = new BroadcastChannel(name);
    this.bc.onmessage = (ev) => {
      for (const h of this.handlers) {
        h({ payload: ev.data });
      }
    };
  }

  on(_type: string, _filter: object, handler: (payload: { payload: { message: GameMessage; senderId: string } }) => void) {
    this.handlers.push(handler);
    return this;
  }

  send(msg: { type: string; event: string; payload: object }) {
    this.bc.postMessage(msg.payload);
    // Also deliver to self
    for (const h of this.handlers) {
      h({ payload: msg.payload as { message: GameMessage; senderId: string } });
    }
  }

  async subscribe() { return this; }
  unsubscribe() { this.bc.close(); }
}

export class NetworkManager {
  private static instance: NetworkManager;
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | LocalChannel | null = null;
  private handlers: MessageHandler[] = [];
  private _playerId: string;
  private _roomCode: string = '';
  private _isHost: boolean = false;
  private _playerInfo: PlayerInfo | null = null;
  private useLocal: boolean;

  private constructor() {
    // Detect if Supabase is configured with real credentials
    this.useLocal = !SUPABASE_URL || SUPABASE_URL.includes('your-project') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('your-anon');
    if (!this.useLocal) {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    this._playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (this.useLocal) {
      console.log('[NetworkManager] No Supabase credentials — using BroadcastChannel (local tabs only)');
    }
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  get playerId(): string { return this._playerId; }
  get roomCode(): string { return this._roomCode; }
  get isHost(): boolean { return this._isHost; }
  get playerInfo(): PlayerInfo | null { return this._playerInfo; }

  setPlayerInfo(info: PlayerInfo): void {
    this._playerInfo = info;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: MessageHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  async createRoom(): Promise<string> {
    this._roomCode = this.generateRoomCode();
    this._isHost = true;
    await this.joinChannel();
    return this._roomCode;
  }

  async joinRoom(code: string): Promise<void> {
    this._roomCode = code.toUpperCase();
    this._isHost = false;
    await this.joinChannel();
  }

  send(message: GameMessage): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'game',
      payload: { message, senderId: this._playerId },
    });
  }

  private async joinChannel(): Promise<void> {
    const channelName = `fighting-wars-${this._roomCode}`;

    if (this.useLocal) {
      // BroadcastChannel fallback for local testing
      const lc = new LocalChannel(channelName);
      lc.on('broadcast', { event: 'game' }, (payload) => {
        const { message, senderId } = payload.payload as { message: GameMessage; senderId: string };
        for (const handler of this.handlers) {
          handler(message, senderId);
        }
      });
      await lc.subscribe();
      this.channel = lc as unknown as RealtimeChannel;
    } else {
      this.channel = this.supabase!.channel(channelName, {
        config: { broadcast: { self: true } },
      });

      (this.channel as RealtimeChannel).on('broadcast', { event: 'game' }, (payload) => {
        const { message, senderId } = payload.payload as { message: GameMessage; senderId: string };
        for (const handler of this.handlers) {
          handler(message, senderId);
        }
      });

      await (this.channel as RealtimeChannel).subscribe();
    }
  }

  // ── Room discovery ──

  private lobbyChannel: BroadcastChannel | null = null;
  private advertiseInterval: ReturnType<typeof setInterval> | null = null;

  /** Host calls this to advertise room on a shared lobby channel */
  advertiseRoom(playerCount: number): void {
    this.stopAdvertising();
    const send = () => {
      const bc = new BroadcastChannel('fighting-wars-lobby');
      bc.postMessage({
        type: 'ROOM_AD',
        code: this._roomCode,
        hostName: this._playerInfo?.name || 'Unknown',
        playerCount,
        timestamp: Date.now(),
      });
      bc.close();
    };
    send();
    this.advertiseInterval = setInterval(send, 2000);
  }

  stopAdvertising(): void {
    if (this.advertiseInterval) {
      clearInterval(this.advertiseInterval);
      this.advertiseInterval = null;
    }
  }

  /** Listen for room advertisements. Returns a cleanup function. */
  listenForRooms(onRoom: (room: { code: string; hostName: string; playerCount: number; timestamp: number }) => void): () => void {
    const bc = new BroadcastChannel('fighting-wars-lobby');
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'ROOM_AD') {
        onRoom(ev.data);
      }
    };
    return () => bc.close();
  }

  async leave(): Promise<void> {
    this.stopAdvertising();
    if (this.channel) {
      if (this.useLocal) {
        (this.channel as LocalChannel).unsubscribe();
      } else if (this.supabase) {
        await this.supabase.removeChannel(this.channel as RealtimeChannel);
      }
      this.channel = null;
    }
    this._roomCode = '';
    this._isHost = false;
    this.handlers = [];
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
