import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getCoins } from '../utils/coinStore';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    // Forest background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    // Dark overlay for readability
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45);

    // === BIG TITLE — Fortnite style ===
    // Title glow behind text
    const titleGlow = this.add.text(GAME_WIDTH / 2, 55, 'FIGHTING WARS', {
      fontSize: '52px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#4488ff',
      stroke: '#0022aa',
      strokeThickness: 12,
    }).setOrigin(0.5).setAlpha(0.4);

    // Main title
    const title = this.add.text(GAME_WIDTH / 2, 55, 'FIGHTING WARS', {
      fontSize: '52px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#ffffff',
      stroke: '#1a3a8a',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Subtle title pulse
    this.tweens.add({
      targets: titleGlow,
      alpha: 0.6,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // === PLAY BUTTON — big yellow like Fortnite ===
    const btnX = GAME_WIDTH / 2;
    const btnY = GAME_HEIGHT - 55;

    const btnBg = this.add.graphics();
    // Button shadow
    btnBg.fillStyle(0x000000, 0.3);
    btnBg.fillRoundedRect(btnX - 82, btnY - 17, 164, 38, 8);
    // Button body — bright yellow
    btnBg.fillStyle(0xffcc00);
    btnBg.fillRoundedRect(btnX - 80, btnY - 18, 160, 36, 6);
    // Button highlight
    btnBg.fillStyle(0xffdd44, 0.6);
    btnBg.fillRoundedRect(btnX - 76, btnY - 16, 152, 16, 4);

    const playText = this.add.text(btnX, btnY, 'PLAY', {
      fontSize: '22px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);

    // Coin display — top right
    const coins = getCoins();
    const coinBg = this.add.graphics();
    coinBg.fillStyle(0x000000, 0.5);
    coinBg.fillRoundedRect(GAME_WIDTH - 130, 8, 120, 26, 6);
    this.add.text(GAME_WIDTH - 70, 21, `${coins}`, {
      fontSize: '14px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffdd00',
    }).setOrigin(0.5);
    // Coin icon
    const coinIcon = this.add.graphics();
    coinIcon.fillStyle(0xffcc00);
    coinIcon.fillCircle(GAME_WIDTH - 115, 21, 8);
    coinIcon.fillStyle(0xffdd44);
    coinIcon.fillCircle(GAME_WIDTH - 115, 20, 6);
    coinIcon.fillStyle(0x000000, 0.3);
    coinIcon.fillRect(GAME_WIDTH - 117, 19, 4, 4);

    // Season info — top left
    const seasonBg = this.add.graphics();
    seasonBg.fillStyle(0x000000, 0.5);
    seasonBg.fillRoundedRect(10, 8, 140, 26, 6);
    this.add.text(80, 21, 'SEASON 1', {
      fontSize: '13px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    // === PLAY BUTTON HIT ZONE ===
    const playHit = this.add.rectangle(btnX, btnY, 170, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);

    // Button hover effect
    playHit.on('pointerover', () => {
      playText.setScale(1.05);
    });
    playHit.on('pointerout', () => {
      playText.setScale(1);
    });

    playHit.once('pointerdown', () => {
      playHit.removeInteractive();
      // Flash the button
      this.tweens.add({
        targets: [playText, btnBg],
        alpha: 0.5,
        duration: 100,
        yoyo: true,
      });
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('CharacterSelectScene');
      });
    });

    // Fade in
    this.cameras.main.fadeIn(600, 0, 0, 0);
  }
}
