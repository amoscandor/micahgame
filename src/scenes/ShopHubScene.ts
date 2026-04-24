import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class ShopHubScene extends Phaser.Scene {
  private gpPrev: Record<string, boolean> = {};
  private focusIndex = 0;
  private focusActions: (() => void)[] = [];
  private focusRects: { x: number; y: number; w: number; h: number }[] = [];
  private focusHighlight?: Phaser.GameObjects.Graphics;
  private gpActive = false;

  constructor() {
    super({ key: 'ShopHubScene' });
  }

  create(): void {
    this.focusIndex = 0;
    this.focusActions = [];
    this.focusRects = [];
    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);

    // Title
    this.add.text(GAME_WIDTH / 2, 40, 'SHOP', {
      fontSize: '24px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffdd00', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Back button
    this.add.text(30, 18, '\u2190 BACK', {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.scene.start('CharacterSelectScene');
      });

    const btnW = 180;
    const btnH = 50;
    const centerX = GAME_WIDTH / 2;
    const startY = GAME_HEIGHT / 2 - 60;
    const gap = 65;

    // ARMOR button
    const armorBg = this.add.graphics();
    armorBg.fillStyle(0x000000, 0.3);
    armorBg.fillRoundedRect(centerX - btnW / 2 - 2, startY - btnH / 2 - 2, btnW + 4, btnH + 4, 10);
    armorBg.fillStyle(0xff6600);
    armorBg.fillRoundedRect(centerX - btnW / 2, startY - btnH / 2, btnW, btnH, 8);
    armorBg.fillStyle(0xff9944, 0.4);
    armorBg.fillRoundedRect(centerX - btnW / 2 + 4, startY - btnH / 2 + 2, btnW - 8, btnH / 2 - 2, 6);

    this.add.text(centerX, startY, 'ARMOR', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    const armorGo = () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(200, () => { this.scene.start('ArmorShopScene'); });
    };
    this.add.rectangle(centerX, startY, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', armorGo);
    this.focusRects.push({ x: centerX, y: startY, w: btnW, h: btnH });
    this.focusActions.push(armorGo);

    // PETS button
    const petY = startY + gap;
    const petBg = this.add.graphics();
    petBg.fillStyle(0x000000, 0.3);
    petBg.fillRoundedRect(centerX - btnW / 2 - 2, petY - btnH / 2 - 2, btnW + 4, btnH + 4, 10);
    petBg.fillStyle(0x22aa44);
    petBg.fillRoundedRect(centerX - btnW / 2, petY - btnH / 2, btnW, btnH, 8);
    petBg.fillStyle(0x44cc66, 0.4);
    petBg.fillRoundedRect(centerX - btnW / 2 + 4, petY - btnH / 2 + 2, btnW - 8, btnH / 2 - 2, 6);

    this.add.text(centerX, petY, 'PETS', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    const petGo = () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(200, () => { this.scene.start('PetShopScene'); });
    };
    this.add.rectangle(centerX, petY, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', petGo);
    this.focusRects.push({ x: centerX, y: petY, w: btnW, h: btnH });
    this.focusActions.push(petGo);

    // DRAW ON SKIN button
    const drawY = startY + gap * 2;
    const drawBg = this.add.graphics();
    drawBg.fillStyle(0x000000, 0.3);
    drawBg.fillRoundedRect(centerX - btnW / 2 - 2, drawY - btnH / 2 - 2, btnW + 4, btnH + 4, 10);
    drawBg.fillStyle(0x2288ff);
    drawBg.fillRoundedRect(centerX - btnW / 2, drawY - btnH / 2, btnW, btnH, 8);
    drawBg.fillStyle(0x44aaff, 0.4);
    drawBg.fillRoundedRect(centerX - btnW / 2 + 4, drawY - btnH / 2 + 2, btnW - 8, btnH / 2 - 2, 6);

    this.add.text(centerX, drawY, 'DRAW ON SKIN', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    const drawGo = () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(200, () => { this.scene.start('DrawOnSkinScene'); });
    };
    this.add.rectangle(centerX, drawY, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', drawGo);
    this.focusRects.push({ x: centerX, y: drawY, w: btnW, h: btnH });
    this.focusActions.push(drawGo);

    this.focusHighlight = this.add.graphics().setDepth(50);
    this.drawFocusHighlight();

    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private drawFocusHighlight(): void {
    if (!this.focusHighlight) return;
    this.focusHighlight.clear();
    if (!this.gpActive) return;
    const r = this.focusRects[this.focusIndex];
    if (!r) return;
    this.focusHighlight.lineStyle(4, 0xffff00, 1);
    this.focusHighlight.strokeRoundedRect(r.x - r.w / 2 - 4, r.y - r.h / 2 - 4, r.w + 8, r.h + 8, 12);
  }

  update(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;
      const up = !!gp.buttons[12]?.pressed || (gp.axes[1] || 0) < -0.5;
      const down = !!gp.buttons[13]?.pressed || (gp.axes[1] || 0) > 0.5;
      const confirm = !!gp.buttons[0]?.pressed || !!gp.buttons[9]?.pressed;
      const back = !!gp.buttons[1]?.pressed;
      const edge = (k: string, cur: boolean) => {
        const prev = !!this.gpPrev[k];
        this.gpPrev[k] = cur;
        return cur && !prev;
      };
      const anyInput = up || down || confirm || back;
      if (anyInput && !this.gpActive) { this.gpActive = true; this.drawFocusHighlight(); }
      if (edge('up', up) && this.focusIndex > 0) { this.focusIndex--; this.drawFocusHighlight(); }
      if (edge('down', down) && this.focusIndex < this.focusActions.length - 1) { this.focusIndex++; this.drawFocusHighlight(); }
      if (edge('confirm', confirm)) this.focusActions[this.focusIndex]?.();
      if (edge('back', back)) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => this.scene.start('CharacterSelectScene'));
      }
      break;
    }
  }
}
