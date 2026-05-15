import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class SettingsScene extends Phaser.Scene {
  private scrollY = 0;
  private maxScroll = 0;
  private scrollContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.scrollY = 0;

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);

    this.add.text(GAME_WIDTH / 2, 20, '⚙ SETTINGS', {
      fontSize: '20px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    // Scrollable container for all content
    this.scrollContainer = this.add.container(0, 0);

    const cx = GAME_WIDTH / 2;
    let y = 50;

    // ── AUDIO & CAMERA ──
    this.addSectionTitle(cx, y, 'AUDIO & CAMERA');
    y += 25;

    const musicVol = parseFloat(localStorage.getItem('fw-music-vol') || '0.5');
    this.createSlider(cx, y, 'MUSIC', musicVol, (v) => localStorage.setItem('fw-music-vol', v.toString()));
    y += 40;

    const sfxVol = parseFloat(localStorage.getItem('fw-sfx-vol') || '0.5');
    this.createSlider(cx, y, 'SFX', sfxVol, (v) => localStorage.setItem('fw-sfx-vol', v.toString()));
    y += 40;

    const camSens = parseFloat(localStorage.getItem('fw-cam-sens') || '0.5');
    this.createSlider(cx, y, 'CAMERA SPEED', camSens, (v) => localStorage.setItem('fw-cam-sens', v.toString()));
    y += 40;

    const showFps = localStorage.getItem('fw-show-fps') === 'true';
    this.createToggle(cx, y, 'SHOW FPS', showFps, (v) => localStorage.setItem('fw-show-fps', v.toString()));
    y += 50;

    // ── BATTLE ──
    this.addSectionTitle(cx, y, 'BATTLE');
    y += 25;

    const storedBots = parseInt(localStorage.getItem('fw-bot-count') || '50', 10);
    const initialBots = Math.max(15, Math.min(100, isNaN(storedBots) ? 50 : storedBots));
    this.createIntSlider(cx, y, 'NUMBER OF BOTS', initialBots, 15, 100, (v) => {
      localStorage.setItem('fw-bot-count', v.toString());
    });
    y += 50;

    // ── DANGER ZONE ──
    this.addSectionTitle(cx, y, 'DANGER ZONE');
    y += 25;

    this.createSmallButton(cx, y, 'RESET ALL DATA', 0xcc2222, () => {
      localStorage.clear();
      this.scene.start('CharacterSelectScene');
    });
    y += 40;

    this.maxScroll = Math.max(0, y - GAME_HEIGHT + 60);

    // Back button (fixed, not scrollable)
    const backBg = this.add.graphics().setDepth(10);
    backBg.fillStyle(0x444444);
    backBg.fillRoundedRect(20, GAME_HEIGHT - 40, 80, 28, 6);
    this.add.text(60, GAME_HEIGHT - 26, '← BACK', {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);
    this.add.rectangle(60, GAME_HEIGHT - 26, 80, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(10)
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => this.scene.start('CharacterSelectScene'));
      });

    // Scroll hint
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 26, '↕ Scroll', {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#666666',
    }).setOrigin(1, 0.5).setDepth(10);

    // Scroll with mouse wheel or drag
    this.input.on('wheel', (_p: unknown, _gx: unknown, _gy: unknown, _gz: unknown, dy: number) => {
      this.scrollY = Math.max(0, Math.min(this.maxScroll, this.scrollY + dy * 0.5));
      this.scrollContainer.y = -this.scrollY;
    });

    let dragStartY = 0;
    let dragScrollStart = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragScrollStart = this.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        const dy = dragStartY - p.y;
        this.scrollY = Math.max(0, Math.min(this.maxScroll, dragScrollStart + dy));
        this.scrollContainer.y = -this.scrollY;
      }
    });

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private addSectionTitle(x: number, y: number, title: string): void {
    const t = this.add.text(x, y, title, {
      fontSize: '12px', fontFamily: 'Arial Black, sans-serif', color: '#ffcc00',
    }).setOrigin(0.5);
    this.scrollContainer.add(t);
  }

  private createSmallButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
    const bg = this.add.graphics();
    bg.fillStyle(color);
    bg.fillRoundedRect(x - 80, y - 12, 160, 24, 6);
    this.scrollContainer.add(bg);

    const t = this.add.text(x, y, label, {
      fontSize: '10px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
    }).setOrigin(0.5);
    this.scrollContainer.add(t);

    const hit = this.add.rectangle(x, y, 160, 24, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
    this.scrollContainer.add(hit);
  }

  private createSlider(x: number, y: number, label: string, value: number, onChange: (v: number) => void): void {
    const barW = 160;
    const barH = 8;
    const startX = x - barW / 2;

    const lbl = this.add.text(startX - 10, y, label, {
      fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#cccccc',
    }).setOrigin(1, 0.5);
    this.scrollContainer.add(lbl);

    const bg = this.add.graphics();
    bg.fillStyle(0x333333);
    bg.fillRoundedRect(startX, y - barH / 2, barW, barH, 4);
    this.scrollContainer.add(bg);

    const fill = this.add.graphics();
    const drawFill = (v: number) => {
      fill.clear();
      fill.fillStyle(0x44aaff);
      fill.fillRoundedRect(startX, y - barH / 2, barW * v, barH, 4);
    };
    drawFill(value);
    this.scrollContainer.add(fill);

    const handle = this.add.circle(startX + barW * value, y, 7, 0xffffff);
    handle.setInteractive({ useHandCursor: true, draggable: true });
    this.scrollContainer.add(handle);

    handle.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      const clamped = Math.max(startX, Math.min(startX + barW, dragX));
      handle.x = clamped;
      const v = (clamped - startX) / barW;
      drawFill(v);
      onChange(v);
    });
  }

  /** Slider that outputs a whole-number integer in [min, max], with a live readout shown to the right. */
  private createIntSlider(x: number, y: number, label: string, value: number, min: number, max: number, onChange: (v: number) => void): void {
    const barW = 140;
    const barH = 8;
    const startX = x - barW / 2;

    const lbl = this.add.text(startX - 10, y, label, {
      fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#cccccc',
    }).setOrigin(1, 0.5);
    this.scrollContainer.add(lbl);

    const bg = this.add.graphics();
    bg.fillStyle(0x333333);
    bg.fillRoundedRect(startX, y - barH / 2, barW, barH, 4);
    this.scrollContainer.add(bg);

    const valueLabel = this.add.text(startX + barW + 10, y, `${value}`, {
      fontSize: '11px', fontFamily: 'Arial Black, sans-serif', color: '#44ff88',
    }).setOrigin(0, 0.5);
    this.scrollContainer.add(valueLabel);

    const fill = this.add.graphics();
    const norm = (v: number) => (v - min) / (max - min);
    const drawFill = (v: number) => {
      fill.clear();
      fill.fillStyle(0x44aaff);
      fill.fillRoundedRect(startX, y - barH / 2, barW * norm(v), barH, 4);
    };
    drawFill(value);
    this.scrollContainer.add(fill);

    const handle = this.add.circle(startX + barW * norm(value), y, 7, 0xffffff);
    handle.setInteractive({ useHandCursor: true, draggable: true });
    this.scrollContainer.add(handle);

    handle.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      const clamped = Math.max(startX, Math.min(startX + barW, dragX));
      handle.x = clamped;
      const t = (clamped - startX) / barW;
      const intVal = Math.round(min + t * (max - min));
      handle.x = startX + barW * norm(intVal);
      drawFill(intVal);
      valueLabel.setText(`${intVal}`);
      onChange(intVal);
    });
  }

  private createToggle(x: number, y: number, label: string, value: boolean, onChange: (v: boolean) => void): void {
    const startX = x - 80;

    const lbl = this.add.text(startX - 10, y, label, {
      fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#cccccc',
    }).setOrigin(1, 0.5);
    this.scrollContainer.add(lbl);

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
    this.scrollContainer.add(box);

    const hit = this.add.rectangle(startX + 25, y, 50, 20, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { on = !on; draw(); onChange(on); });
    this.scrollContainer.add(hit);
  }
}
