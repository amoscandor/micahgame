import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { NetworkManager } from '../network/NetworkManager';
import { GameMessage, PlayerInfo } from '../network/MessageTypes';

export class LobbyScene extends Phaser.Scene {
  private network!: NetworkManager;
  private players: PlayerInfo[] = [];
  private playerListText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Rectangle;
  private startButtonText!: Phaser.GameObjects.Text;
  private characterKey: string = 'char-hedgie';
  private characterName: string = 'Player';
  private gameMode: string = 'players-first';
  private messageHandler!: (msg: GameMessage, senderId: string) => void;
  private choiceObjects: Phaser.GameObjects.GameObject[] = [];
  private stopListening: (() => void) | null = null;
  private rooms: Map<string, { code: string; hostName: string; playerCount: number; timestamp: number }> = new Map();
  private roomListText: Phaser.GameObjects.Text | null = null;
  private roomButtons: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; code: string }[] = [];
  private scanningText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(data?: { characterKey?: string; characterName?: string; action?: 'create' | 'join'; roomCode?: string; mode?: string }): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5);
    this.cameras.main.fadeIn(500);

    this.characterKey = data?.characterKey || 'char-hedgie';
    this.characterName = data?.characterName || 'Player';
    this.gameMode = data?.mode || 'players-first';
    this.players = [];
    this.rooms = new Map();
    this.roomButtons = [];

    this.network = NetworkManager.getInstance();
    this.network.setPlayerInfo({
      id: this.network.playerId,
      name: this.characterName,
      characterKey: this.characterKey,
    });

    if (data?.action === 'join' && data.roomCode) {
      this.showLobbyUI();
      this.joinRoom(data.roomCode);
    } else {
      this.showChoiceScreen();
    }
  }

  // ── Choice screen: CREATE or browse rooms to JOIN ──
  private showChoiceScreen(): void {
    this.clearChoiceUI();

    const title = this.add.text(GAME_WIDTH / 2, 30, 'MULTIPLAYER', {
      fontSize: '28px', fontFamily: 'Arial Black, Arial',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.choiceObjects.push(title);

    // CREATE ROOM button
    const createBtnBg = this.add.rectangle(GAME_WIDTH / 2, 80, 220, 45, 0x44aa44, 0.9)
      .setInteractive({ useHandCursor: true });
    const createBtnText = this.add.text(GAME_WIDTH / 2, 80, 'CREATE ROOM', {
      fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    createBtnBg.on('pointerdown', () => {
      this.clearChoiceUI();
      this.showLobbyUI();
      this.createRoom();
    });
    this.choiceObjects.push(createBtnBg, createBtnText);

    // Divider
    const divider = this.add.text(GAME_WIDTH / 2, 115, '── OR JOIN A ROOM ──', {
      fontSize: '12px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5);
    this.choiceObjects.push(divider);

    // Scanning text
    this.scanningText = this.add.text(GAME_WIDTH / 2, 145, 'Searching for rooms...', {
      fontSize: '13px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.choiceObjects.push(this.scanningText);

    // Room list area (will be populated dynamically)
    this.roomListText = null;

    // Start listening for room advertisements
    this.stopListening = this.network.listenForRooms((room) => {
      // Only keep rooms that advertised in last 6 seconds
      this.rooms.set(room.code, room);
      this.refreshRoomList();
    });

    // Periodically clean stale rooms
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        const now = Date.now();
        for (const [code, room] of this.rooms) {
          if (now - room.timestamp > 6000) {
            this.rooms.delete(code);
          }
        }
        this.refreshRoomList();
      },
    });

    // Back button
    const backBtn = this.add.text(20, GAME_HEIGHT - 25, '< Back', {
      fontSize: '14px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => {
      this.clearChoiceUI();
      this.scene.start('ModeSelectScene', {
        characterKey: this.characterKey,
        characterName: this.characterName,
      });
    });
    this.choiceObjects.push(backBtn);
  }

  private refreshRoomList(): void {
    // Remove old room buttons
    for (const rb of this.roomButtons) {
      rb.bg.destroy();
      rb.text.destroy();
    }
    this.roomButtons = [];

    const roomArr = [...this.rooms.values()];

    if (this.scanningText) {
      if (roomArr.length === 0) {
        this.scanningText.setText('Searching for rooms...\n(Create a room in another tab to test)');
      } else {
        this.scanningText.setText(`${roomArr.length} room${roomArr.length === 1 ? '' : 's'} found:`);
      }
    }

    const startY = 170;
    const rowH = 50;

    for (let i = 0; i < Math.min(roomArr.length, 4); i++) {
      const room = roomArr[i];
      const y = startY + i * rowH;

      const bg = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 80, 40, 0x224488, 0.85)
        .setInteractive({ useHandCursor: true });

      const label = `${room.hostName}'s Room  [${room.code}]  —  ${room.playerCount} player${room.playerCount === 1 ? '' : 's'}`;
      const text = this.add.text(GAME_WIDTH / 2 - 120, y, label, {
        fontSize: '14px', fontFamily: 'Arial', color: '#ffffff',
      }).setOrigin(0, 0.5);

      const joinTxt = this.add.text(GAME_WIDTH - 70, y, 'JOIN >', {
        fontSize: '14px', fontFamily: 'Arial Black, Arial', color: '#44ff44',
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.clearChoiceUI();
        this.showLobbyUI();
        this.joinRoom(room.code);
      });

      bg.on('pointerover', () => bg.setFillStyle(0x3366aa, 1));
      bg.on('pointerout', () => bg.setFillStyle(0x224488, 0.85));

      this.roomButtons.push({ bg, text, code: room.code });
      this.choiceObjects.push(bg, text, joinTxt);
    }
  }

  private clearChoiceUI(): void {
    if (this.stopListening) {
      this.stopListening();
      this.stopListening = null;
    }
    for (const rb of this.roomButtons) {
      rb.bg.destroy();
      rb.text.destroy();
    }
    this.roomButtons = [];
    for (const obj of this.choiceObjects) obj.destroy();
    this.choiceObjects = [];
    this.scanningText = null;
    this.roomListText = null;
  }

  // ── Lobby UI (after creating/joining) ──
  private showLobbyUI(): void {
    this.add.text(GAME_WIDTH / 2, 30, 'LOBBY', {
      fontSize: '28px', fontFamily: 'Arial Black, Arial',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.roomCodeText = this.add.text(GAME_WIDTH / 2, 70, '', {
      fontSize: '36px', fontFamily: 'Arial Black, Arial',
      color: '#ffdd00', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.statusText = this.add.text(GAME_WIDTH / 2, 110, 'Connecting...', {
      fontSize: '14px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(100, 150, 'Players:', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5);

    this.playerListText = this.add.text(100, 175, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#44ff44',
      align: 'center', lineSpacing: 4,
      wordWrap: { width: 180 },
    }).setOrigin(0.5, 0);

    this.startButton = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 50, 180, 50, 0x44aa44, 0.9)
      .setInteractive().setVisible(false);
    this.startButtonText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'START GAME', {
      fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false);
    this.startButton.on('pointerdown', () => this.startGame());

    const backBtn = this.add.text(20, GAME_HEIGHT - 25, '< Back', {
      fontSize: '14px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setInteractive();
    backBtn.on('pointerdown', () => {
      this.network.leave();
      this.scene.start('CharacterSelectScene');
    });

    this.messageHandler = (msg: GameMessage, senderId: string) => {
      this.handleMessage(msg, senderId);
    };
    this.network.onMessage(this.messageHandler);
  }

  private async createRoom(): Promise<void> {
    const code = await this.network.createRoom();
    this.roomCodeText.setText(code);
    this.statusText.setText('Waiting for players to join...');
    this.startButton.setVisible(true);
    this.startButtonText.setVisible(true);
    this.addPlayer(this.network.playerInfo!);
    this.network.send({ type: 'JOIN', player: this.network.playerInfo! });
    // Advertise room so others can see it
    this.network.advertiseRoom(this.players.length);
  }

  private async joinRoom(code: string): Promise<void> {
    await this.network.joinRoom(code);
    this.roomCodeText.setText(code);
    this.statusText.setText('Waiting for host to start...');
    this.network.send({ type: 'JOIN', player: this.network.playerInfo! });
  }

  private handleMessage(msg: GameMessage, _senderId: string): void {
    switch (msg.type) {
      case 'JOIN':
        this.addPlayer(msg.player);
        if (this.network.isHost) {
          this.network.send({ type: 'PLAYER_LIST', players: this.players, hostId: this.network.playerId });
          // Update room ad with new player count
          this.network.advertiseRoom(this.players.length);
        }
        break;
      case 'PLAYER_LIST':
        this.players = msg.players;
        this.updatePlayerList();
        break;
      case 'GAME_START':
        this.network.stopAdvertising();
        this.network.removeHandler(this.messageHandler);
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.time.delayedCall(500, () => {
          this.scene.start('BattleScene', {
            characterKey: this.characterKey,
            characterName: this.characterName,
            mode: this.gameMode,
            opponent: 'players',
            multiplayerPlayers: msg.players,
          });
        });
        break;
    }
  }

  private addPlayer(player: PlayerInfo): void {
    if (!this.players.find(p => p.id === player.id)) {
      this.players.push(player);
      this.updatePlayerList();
      this.playJoinDing();
    }
  }

  private playJoinDing(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1109, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) { /* audio not available */ }
  }

  private updatePlayerList(): void {
    const names = this.players.map((p, i) => `${i + 1}. ${p.name}`);
    this.playerListText.setText(names.join('\n'));
    this.statusText.setText(`${this.players.length} player${this.players.length === 1 ? '' : 's'} in room`);
  }

  private startGame(): void {
    if (this.players.length < 2) {
      this.statusText.setText('Need at least 2 players!');
      return;
    }
    this.network.stopAdvertising();
    this.network.send({ type: 'GAME_START', players: this.players });
  }
}
