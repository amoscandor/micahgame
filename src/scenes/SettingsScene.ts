import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);

    this.add.text(GAME_WIDTH / 2, 30, '⚙ SETTINGS', {
      fontSize: '22px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    const cx = GAME_WIDTH / 2;
    let y = 80;

    // Music volume
    const musicVol = parseFloat(localStorage.getItem('fw-music-vol') || '0.5');
    this.createSlider(cx, y, 'MUSIC', musicVol, (v) => {
      localStorage.setItem('fw-music-vol', v.toString());
    });
    y += 50;

    // SFX volume
    const sfxVol = parseFloat(localStorage.getItem('fw-sfx-vol') || '0.5');
    this.createSlider(cx, y, 'SFX', sfxVol, (v) => {
      localStorage.setItem('fw-sfx-vol', v.toString());
    });
    y += 50;

    // Camera sensitivity
    const camSens = parseFloat(localStorage.getItem('fw-cam-sens') || '0.5');
    this.createSlider(cx, y, 'CAMERA SPEED', camSens, (v) => {
      localStorage.setItem('fw-cam-sens', v.toString());
    });
    y += 50;

    // Show FPS toggle
    const showFps = localStorage.getItem('fw-show-fps') === 'true';
    this.createToggle(cx, y, 'SHOW FPS', showFps, (v) => {
      localStorage.setItem('fw-show-fps', v.toString());
    });
    y += 50;

    // Reset coins button
    const resetBg = this.add.graphics();
    resetBg.fillStyle(0xcc2222);
    resetBg.fillRoundedRect(cx - 80, y - 14, 160, 28, 6);
    this.add.text(cx, y, 'RESET ALL DATA', {
      fontSize: '11px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(cx, y, 160, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        localStorage.clear();
        this.scene.start('CharacterSelectScene');
      });

    // Back button
    const backBg = this.add.graphics();
    backBg.fillStyle(0x444444);
    backBg.fillRoundedRect(20, GAME_HEIGHT - 40, 80, 28, 6);
    this.add.text(60, GAME_HEIGHT - 26, '← BACK', {
      fontSize: '11px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(60, GAME_HEIGHT - 26, 80, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => {
          this.scene.start('CharacterSelectScene');
        });
      });

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private createSlider(x: number, y: number, label: string, value: number, onChange: (v: number) => void): void {
    const barW = 200;
    const barH = 10;
    const startX = x - barW / 2;

    this.add.text(startX - 10, y, label, {
      fontSize: '10px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#cccccc',
    }).setOrigin(1, 0.5);

    const bg = this.add.graphics();
    bg.fillStyle(0x333333);
    bg.fillRoundedRect(startX, y - barH / 2, barW, barH, 4);

    const fill = this.add.graphics();
    const drawFill = (v: number) => {
      fill.clear();
      fill.fillStyle(0x44aaff);
      fill.fillRoundedRect(startX, y - barH / 2, barW * v, barH, 4);
    };
    drawFill(value);

    const handle = this.add.circle(startX + barW * value, y, 8, 0xffffff);
    handle.setInteractive({ useHandCursor: true, draggable: true });

    handle.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      const clamped = Math.max(startX, Math.min(startX + barW, dragX));
      handle.x = clamped;
      const v = (clamped - startX) / barW;
      drawFill(v);
      onChange(v);
    });
  }

  private createToggle(x: number, y: number, label: string, value: boolean, onChange: (v: boolean) => void): void {
    const startX = x - 100;

    this.add.text(startX - 10, y, label, {
      fontSize: '10px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#cccccc',
    }).setOrigin(1, 0.5);

    const box = this.add.graphics();
    let on = value;
    const draw = () => {
      box.clear();
      box.fillStyle(on ? 0x44cc44 : 0x444444);
      box.fillRoundedRect(startX, y - 10, 50, 20, 6);
      box.fillStyle(0xffffff);
      box.fillCircle(on ? startX + 38 : startX + 12, y, 8);
    };
    draw();

    this.add.rectangle(startX + 25, y, 50, 20, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        on = !on;
        draw();
        onChange(on);
      });
  }
}
