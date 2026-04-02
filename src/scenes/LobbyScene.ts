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
  private messageHandler!: (msg: GameMessage, senderId: string) => void;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(data?: { characterKey?: string; characterName?: string; action?: 'create' | 'join'; roomCode?: string }): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5);
    this.cameras.main.fadeIn(500);

    this.characterKey = data?.characterKey || 'char-hedgie';
    this.characterName = data?.characterName || 'Player';
    this.players = [];

    this.network = NetworkManager.getInstance();
    this.network.setPlayerInfo({
      id: this.network.playerId,
      name: this.characterName,
      characterKey: this.characterKey,
    });

    // Title
    this.add.text(GAME_WIDTH / 2, 30, 'LOBBY', {
      fontSize: '28px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Room code
    this.roomCodeText = this.add.text(GAME_WIDTH / 2, 70, '', {
      fontSize: '36px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffdd00',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(GAME_WIDTH / 2, 110, 'Connecting...', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Player list (left side)
    this.add.text(100, 150, 'Players:', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5);

    this.playerListText = this.add.text(100, 175, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#44ff44',
      align: 'center', lineSpacing: 4,
      wordWrap: { width: 180 },
    }).setOrigin(0.5, 0);

    // Start button
    this.startButton = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 50, 180, 50, 0x44aa44, 0.9)
      .setInteractive().setVisible(false);
    this.startButtonText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'START GAME', {
      fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false);

    this.startButton.on('pointerdown', () => this.startGame());

    // Back button
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

    if (data?.action === 'join' && data.roomCode) {
      this.joinRoom(data.roomCode);
    } else {
      this.createRoom();
    }
  }

  private async createRoom(): Promise<void> {
    const code = await this.network.createRoom();
    this.roomCodeText.setText(code);
    this.statusText.setText('Share this code with friends!');
    this.startButton.setVisible(true);
    this.startButtonText.setVisible(true);
    this.addPlayer(this.network.playerInfo!);
    this.network.send({ type: 'JOIN', player: this.network.playerInfo! });
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
        }
        break;
      case 'PLAYER_LIST':
        this.players = msg.players;
        this.updatePlayerList();
        break;
      case 'GAME_START':
        this.network.removeHandler(this.messageHandler);
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.time.delayedCall(500, () => {
          this.scene.start('BattleScene', {
            characterKey: this.characterKey,
            characterName: this.characterName,
          });
        });
        break;
    }
  }

  private addPlayer(player: PlayerInfo): void {
    if (!this.players.find(p => p.id === player.id)) {
      this.players.push(player);
      this.updatePlayerList();
    }
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
    this.network.send({ type: 'GAME_START', players: this.players });
  }
}
