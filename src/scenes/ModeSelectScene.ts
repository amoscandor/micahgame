import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class ModeSelectScene extends Phaser.Scene {
  private charData!: { characterKey: string; characterName: string };
  private step: 'opponent' | 'order' = 'opponent';
  private selectedOpponent = 'bots';
  private stepObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'ModeSelectScene' });
  }

  init(data: { characterKey: string; characterName: string }): void {
    this.charData = data;
    this.step = 'opponent';
    this.stepObjects = [];
  }

  create(): void {
    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);

    // Back button
    this.add.text(30, 20, '\u2190 BACK', {
      fontSize: '14px', fontFamily: 'Arial Black, sans-serif',
      color: '#888888', stroke: '#000', strokeThickness: 2,
    }).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.step === 'order') {
        this.step = 'opponent';
        this.showOpponentStep();
      } else {
        this.scene.start('CharacterSelectScene');
      }
    });

    this.showOpponentStep();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private clearStep(): void {
    for (const obj of this.stepObjects) obj.destroy();
    this.stepObjects = [];
  }

  private showOpponentStep(): void {
    this.clearStep();

    const title = this.add.text(GAME_WIDTH / 2, 60, 'WHO DO YOU FIGHT?', {
      fontSize: '28px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.stepObjects.push(title);

    const btnY = GAME_HEIGHT / 2 + 10;
    const btnW = 180;
    const btnH = 80;
    const gap = 20;

    this.createModeButton(
      GAME_WIDTH / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH,
      'BOTS', 'Fight against AI bots', 0x44aa44,
      () => { this.selectedOpponent = 'bots'; this.step = 'order'; this.showOrderStep(); },
    );

    this.createModeButton(
      GAME_WIDTH / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH,
      'PLAYERS', 'Fight against real players', 0x4488ff,
      () => { this.selectedOpponent = 'players'; this.step = 'order'; this.showOrderStep(); },
    );
  }

  private showOrderStep(): void {
    this.clearStep();

    const title = this.add.text(GAME_WIDTH / 2, 60, 'WHAT ORDER?', {
      fontSize: '28px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.stepObjects.push(title);

    const btnY = GAME_HEIGHT / 2 + 10;
    const btnW = 180;
    const btnH = 80;
    const gap = 20;

    this.createModeButton(
      GAME_WIDTH / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH,
      'BOSS FIRST', 'Fight the bear first', 0xcc4444,
      () => this.startGame('boss-first'),
    );

    this.createModeButton(
      GAME_WIDTH / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH,
      'PLAYERS FIRST', 'Fight bots/players first', 0x44aa44,
      () => this.startGame('players-first'),
    );
  }

  private createModeButton(cx: number, cy: number, w: number, h: number, label: string, desc: string, color: number, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(cx - w / 2 + 3, cy - h / 2 + 3, w, h, 12);
    g.fillStyle(color, 0.85);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 4, w - 8, h / 2 - 4, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.lineStyle(2, 0xffffff, 0.4);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
    this.stepObjects.push(g);

    const lbl = this.add.text(cx, cy - 10, label, {
      fontSize: '22px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.stepObjects.push(lbl);

    const dsc = this.add.text(cx, cy + 18, desc, {
      fontSize: '10px', fontFamily: 'Arial',
      color: '#dddddd',
    }).setOrigin(0.5);
    this.stepObjects.push(dsc);

    const hit = this.add.rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
    this.stepObjects.push(hit);
  }

  private startGame(mode: string): void {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(400, () => {
      if (this.selectedOpponent === 'players') {
        // Go to lobby for multiplayer matchmaking
        this.scene.start('LobbyScene', {
          ...this.charData,
          mode,
          action: 'create',
        });
      } else {
        this.scene.start('BattleScene', {
          ...this.charData,
          mode,
          opponent: this.selectedOpponent,
        });
      }
    });
  }
}
