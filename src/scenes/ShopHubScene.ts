import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class ShopHubScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ShopHubScene' });
  }

  create(): void {
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
    const btnH = 60;
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    // ARMOR button
    const armorBg = this.add.graphics();
    armorBg.fillStyle(0x000000, 0.3);
    armorBg.fillRoundedRect(centerX - btnW / 2 - 2, centerY - 40 - btnH / 2 - 2, btnW + 4, btnH + 4, 10);
    armorBg.fillStyle(0xff6600);
    armorBg.fillRoundedRect(centerX - btnW / 2, centerY - 40 - btnH / 2, btnW, btnH, 8);
    armorBg.fillStyle(0xff9944, 0.4);
    armorBg.fillRoundedRect(centerX - btnW / 2 + 4, centerY - 40 - btnH / 2 + 2, btnW - 8, btnH / 2 - 2, 6);

    this.add.text(centerX, centerY - 40, 'ARMOR', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.rectangle(centerX, centerY - 40, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => {
          this.scene.start('ArmorShopScene');
        });
      });

    // DRAW ON SKIN button
    const drawBg = this.add.graphics();
    drawBg.fillStyle(0x000000, 0.3);
    drawBg.fillRoundedRect(centerX - btnW / 2 - 2, centerY + 40 - btnH / 2 - 2, btnW + 4, btnH + 4, 10);
    drawBg.fillStyle(0x2288ff);
    drawBg.fillRoundedRect(centerX - btnW / 2, centerY + 40 - btnH / 2, btnW, btnH, 8);
    drawBg.fillStyle(0x44aaff, 0.4);
    drawBg.fillRoundedRect(centerX - btnW / 2 + 4, centerY + 40 - btnH / 2 + 2, btnW - 8, btnH / 2 - 2, 6);

    this.add.text(centerX, centerY + 40, 'DRAW ON SKIN', {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.rectangle(centerX, centerY + 40, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => {
          this.scene.start('DrawOnSkinScene');
        });
      });


    this.cameras.main.fadeIn(200, 0, 0, 0);
  }
}
