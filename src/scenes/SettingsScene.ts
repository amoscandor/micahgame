import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getControls, saveControls, resetControls, ACTION_LABELS, DEFAULT_KEYBOARD, DEFAULT_GAMEPAD, keyCodeToLabel, gamepadButtonLabel, type ControlScheme, type Binding } from '../utils/controlBindings';

export class SettingsScene extends Phaser.Scene {
  private listeningFor: { action: keyof ControlScheme; device: 'keyboard' | 'gamepad'; text: Phaser.GameObjects.Text } | null = null;
  private controlTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private pollTimer: Phaser.Time.TimerEvent | null = null;
  private scrollY = 0;
  private maxScroll = 0;
  private scrollContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.listeningFor = null;
    this.controlTexts = new Map();
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

    // ── KEYBOARD CONTROLS ──
    this.addSectionTitle(cx, y, 'KEYBOARD CONTROLS');
    y += 25;
    const kbControls = getControls('keyboard');
    y = this.createControlBindings(cx, y, 'keyboard', kbControls);
    y += 15;

    // Reset keyboard to defaults
    this.createSmallButton(cx, y, 'Reset Keyboard Defaults', 0x666666, () => {
      resetControls();
      this.scene.restart();
    });
    y += 40;

    // ── GAMEPAD CONTROLS ──
    this.addSectionTitle(cx, y, 'GAMEPAD CONTROLS');
    y += 25;
    const gpControls = getControls('gamepad');
    y = this.createControlBindings(cx, y, 'gamepad', gpControls);
    y += 15;

    // Reset gamepad to defaults
    this.createSmallButton(cx, y, 'Reset Gamepad Defaults', 0x666666, () => {
      resetControls();
      this.scene.restart();
    });
    y += 40;

    // ── TOUCH CONTROLS ──
    this.addSectionTitle(cx, y, 'TOUCH CONTROLS (iPhone)');
    y += 25;
    const touchNote = this.add.text(cx, y, 'Left side: Move joystick\nRight side: Look\nButtons: Shoot, Car, Quit', {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#aaaaaa', align: 'center',
    }).setOrigin(0.5, 0);
    this.scrollContainer.add(touchNote);
    y += 55;

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
        this.cleanUp();
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

    // Listen for keyboard rebinding
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.listeningFor || this.listeningFor.device !== 'keyboard') return;
      const action = this.listeningFor.action;
      const controls = getControls('keyboard');
      const label = keyCodeToLabel(event.code);
      controls[action] = { type: 'keyboard', code: event.code, label };
      saveControls('keyboard', controls);
      this.listeningFor.text.setText(label);
      this.listeningFor.text.setColor('#ffffff');
      this.listeningFor = null;
    });

    // Poll gamepad for rebinding
    this.pollTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        if (!this.listeningFor || this.listeningFor.device !== 'gamepad') return;
        const gamepads = navigator.getGamepads?.();
        if (!gamepads) return;
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (!gp) continue;
          // Check buttons
          for (let b = 0; b < gp.buttons.length; b++) {
            if (gp.buttons[b].pressed) {
              const action = this.listeningFor.action;
              const controls = getControls('gamepad');
              const label = gamepadButtonLabel(b);
              if (b === 6 || b === 7) {
                controls[action] = { type: 'gamepad-trigger', code: `trigger-${b}`, label };
              } else {
                controls[action] = { type: 'gamepad-button', code: `button-${b}`, label };
              }
              saveControls('gamepad', controls);
              this.listeningFor.text.setText(label);
              this.listeningFor.text.setColor('#ffffff');
              this.listeningFor = null;
              return;
            }
          }
          // Check axes
          for (let a = 0; a < gp.axes.length; a++) {
            if (Math.abs(gp.axes[a]) > 0.7) {
              const action = this.listeningFor.action;
              const controls = getControls('gamepad');
              const dir = gp.axes[a] > 0 ? 'pos' : 'neg';
              const axisLabels: Record<string, string> = {
                '0-neg': 'L Stick ←', '0-pos': 'L Stick →',
                '1-neg': 'L Stick ↑', '1-pos': 'L Stick ↓',
                '2-neg': 'R Stick ←', '2-pos': 'R Stick →',
                '3-neg': 'R Stick ↑', '3-pos': 'R Stick ↓',
              };
              const label = axisLabels[`${a}-${dir}`] || `Axis ${a} ${dir}`;
              controls[action] = { type: 'gamepad-axis', code: `axis-${a}-${dir}`, label };
              saveControls('gamepad', controls);
              this.listeningFor.text.setText(label);
              this.listeningFor.text.setColor('#ffffff');
              this.listeningFor = null;
              return;
            }
          }
        }
      },
    });

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private addSectionTitle(x: number, y: number, title: string): void {
    const t = this.add.text(x, y, title, {
      fontSize: '12px', fontFamily: 'Arial Black, sans-serif', color: '#ffcc00',
    }).setOrigin(0.5);
    this.scrollContainer.add(t);
  }

  private createControlBindings(cx: number, startY: number, device: 'keyboard' | 'gamepad', controls: ControlScheme): number {
    let y = startY;
    const actions = Object.keys(ACTION_LABELS) as (keyof ControlScheme)[];

    for (const action of actions) {
      const binding = controls[action];
      const labelText = this.add.text(cx - 90, y, ACTION_LABELS[action], {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#cccccc',
      }).setOrigin(0, 0.5);
      this.scrollContainer.add(labelText);

      // Binding button
      const btnBg = this.add.graphics();
      btnBg.fillStyle(0x333355);
      btnBg.fillRoundedRect(cx + 40, y - 10, 100, 20, 4);
      this.scrollContainer.add(btnBg);

      const bindText = this.add.text(cx + 90, y, binding.label, {
        fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
      }).setOrigin(0.5);
      this.scrollContainer.add(bindText);
      this.controlTexts.set(`${device}-${action}`, bindText);

      const hitArea = this.add.rectangle(cx + 90, y, 100, 20, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      this.scrollContainer.add(hitArea);

      hitArea.on('pointerdown', () => {
        // Cancel previous listening
        if (this.listeningFor) {
          this.listeningFor.text.setColor('#ffffff');
        }
        this.listeningFor = { action, device, text: bindText };
        bindText.setText('Press...');
        bindText.setColor('#ffcc00');
      });

      y += 24;
    }
    return y;
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
      const clamped = Math.max(startX, Math.min(startX + barW, dragX + this.scrollY * 0));
      handle.x = clamped;
      const v = (clamped - startX) / barW;
      drawFill(v);
      onChange(v);
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

  private cleanUp(): void {
    if (this.pollTimer) {
      this.pollTimer.remove();
      this.pollTimer = null;
    }
    this.listeningFor = null;
  }
}
