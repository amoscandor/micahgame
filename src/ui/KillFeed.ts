import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/game.config';

interface KillEntry {
  text: Phaser.GameObjects.Text;
  timer: number;
}

export class KillFeed {
  private scene: Phaser.Scene;
  private entries: KillEntry[] = [];
  private readonly MAX_ENTRIES = 5;
  private readonly FADE_TIME = 4000;
  private readonly X = GAME_WIDTH - 10;
  private readonly START_Y = 80;
  private readonly LINE_HEIGHT = 18;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  addKill(attackerName: string, targetName: string, isPlayerKill: boolean): void {
    const msg = `${attackerName} eliminated ${targetName}`;
    const color = isPlayerKill ? '#c8b878' : '#9a9a9a';

    const text = this.scene.add.text(this.X, this.START_Y, msg, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color,
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(300).setAlpha(0);

    // Fade in
    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      duration: 200,
    });

    this.entries.unshift({ text, timer: this.FADE_TIME });

    // Remove excess entries
    while (this.entries.length > this.MAX_ENTRIES) {
      const old = this.entries.pop()!;
      old.text.destroy();
    }

    // Reposition all entries
    this.repositionEntries();
  }

  update(delta: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.timer -= delta;

      if (entry.timer <= 500) {
        entry.text.setAlpha(entry.timer / 500);
      }

      if (entry.timer <= 0) {
        entry.text.destroy();
        this.entries.splice(i, 1);
        this.repositionEntries();
      }
    }
  }

  private repositionEntries(): void {
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].text.setY(this.START_Y + i * this.LINE_HEIGHT);
    }
  }

  destroy(): void {
    for (const entry of this.entries) {
      entry.text.destroy();
    }
    this.entries = [];
  }
}
