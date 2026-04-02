import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.config';
import { GameMessage, PlayerInfo } from './MessageTypes';

type MessageHandler = (message: GameMessage, senderId: string) => void;

export class NetworkManager {
  private static instance: NetworkManager;
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private handlers: MessageHandler[] = [];
  private _playerId: string;
  private _roomCode: string = '';
  private _isHost: boolean = false;
  private _playerInfo: PlayerInfo | null = null;

  private constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this._playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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

  async leave(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this._roomCode = '';
    this._isHost = false;
    this.handlers = [];
  }

  private async joinChannel(): Promise<void> {
    this.channel = this.supabase.channel(`fighting-wars-${this._roomCode}`, {
      config: { broadcast: { self: true } },
    });

    this.channel.on('broadcast', { event: 'game' }, (payload) => {
      const { message, senderId } = payload.payload as { message: GameMessage; senderId: string };
      for (const handler of this.handlers) {
        handler(message, senderId);
      }
    });

    await this.channel.subscribe();
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
