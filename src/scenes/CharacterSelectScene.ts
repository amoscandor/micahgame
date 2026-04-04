import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export interface CharacterData {
  key: string;
  name: string;
  gender: 'boy' | 'girl';
}

export const CHARACTERS: CharacterData[] = [
  // Boys
  { key: 'char-0', name: 'Jake', gender: 'boy' },
  { key: 'char-1', name: 'Marcus', gender: 'boy' },
  { key: 'char-2', name: 'Tyler', gender: 'boy' },
  { key: 'char-3', name: 'DeShawn', gender: 'boy' },
  { key: 'char-4', name: 'Ethan', gender: 'boy' },
  { key: 'char-5', name: 'Carlos', gender: 'boy' },
  { key: 'char-6', name: 'Ryan', gender: 'boy' },
  { key: 'char-7', name: 'Tyrone', gender: 'boy' },
  { key: 'char-8', name: 'Noah', gender: 'boy' },
  { key: 'char-9', name: 'Andre', gender: 'boy' },
  // Girls
  { key: 'char-10', name: 'Mia', gender: 'girl' },
  { key: 'char-11', name: 'Luna', gender: 'girl' },
  { key: 'char-12', name: 'Zoe', gender: 'girl' },
  { key: 'char-13', name: 'Aaliyah', gender: 'girl' },
  { key: 'char-14', name: 'Bella', gender: 'girl' },
  { key: 'char-15', name: 'Ivy', gender: 'girl' },
  { key: 'char-16', name: 'Jade', gender: 'girl' },
  { key: 'char-17', name: 'Scarlett', gender: 'girl' },
  { key: 'char-18', name: 'Aria', gender: 'girl' },
  { key: 'char-19', name: 'Roxy', gender: 'girl' },
];

export class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex: number = 0;
  private selectionBorder!: Phaser.GameObjects.Graphics;
  private bigPreview!: Phaser.GameObjects.Image;
  private bigName!: Phaser.GameObjects.Text;
  private deleteBtn!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  create(): void {
    // Forest background with dark overlay
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55);

    // Title
    this.add.text(170, 22, 'SELECT YOUR CHARACTER', {
      fontSize: '16px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Dark panel behind character grid
    const panel = this.add.graphics();
    panel.fillStyle(0x151525, 0.8);
    panel.fillRoundedRect(8, 38, 330, 310, 8);

    // Character grid — 10 columns x 2 rows
    const cols = 10;
    const cellW = 32;
    const cellH = 52;
    const startX = 24;
    const startY = 58;

    this.selectionBorder = this.add.graphics().setDepth(50);

    for (let i = 0; i < CHARACTERS.length; i++) {
      const c = CHARACTERS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + row * cellH;

      // Card bg
      const card = this.add.graphics();
      card.fillStyle(0x222233, 0.7);
      card.fillRoundedRect(x - 13, y - 13, 26, 40, 3);

      // Character sprite
      this.add.image(x, y, c.key).setDisplaySize(22, 22);

      // Name
      this.add.text(x, y + 17, c.name, {
        fontSize: '6px', fontFamily: 'Arial', color: '#999999',
      }).setOrigin(0.5);

      // Hit area
      this.add.rectangle(x, y + 4, 26, 40, 0x000000, 0)
        .setInteractive()
        .on('pointerdown', () => {
          this.selectedIndex = i;
          this.updateSelection();
        });
    }

    // "MAKE YOUR OWN" button below grid (shifted left)
    const makeX = 95;
    const makeY = 330;
    const makeBg = this.add.graphics();
    makeBg.fillStyle(0x000000, 0.3);
    makeBg.fillRoundedRect(makeX - 62, makeY - 11, 124, 24, 6);
    makeBg.fillStyle(0x44aaff);
    makeBg.fillRoundedRect(makeX - 60, makeY - 12, 120, 22, 5);
    makeBg.fillStyle(0x66ccff, 0.4);
    makeBg.fillRoundedRect(makeX - 56, makeY - 10, 112, 10, 3);
    this.add.text(makeX, makeY - 1, '+ MAKE YOUR OWN', {
      fontSize: '10px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);
    this.add.rectangle(makeX, makeY, 130, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100)
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
          this.scene.start('CharacterCreatorScene');
        });
      });

    // "BUY CHARACTER" button (right of MAKE YOUR OWN)
    const shopX = 245;
    const shopY = 330;
    const shopBg = this.add.graphics();
    shopBg.fillStyle(0x000000, 0.3);
    shopBg.fillRoundedRect(shopX - 62, shopY - 11, 124, 24, 6);
    shopBg.fillStyle(0xffaa00);
    shopBg.fillRoundedRect(shopX - 60, shopY - 12, 120, 22, 5);
    shopBg.fillStyle(0xffcc44, 0.4);
    shopBg.fillRoundedRect(shopX - 56, shopY - 10, 112, 10, 3);
    this.add.text(shopX, shopY - 1, 'BUY CHARACTER', {
      fontSize: '10px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);
    this.add.rectangle(shopX, shopY, 130, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100)
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
          this.scene.start('CharacterShopScene');
        });
      });

    // Big preview on right
    const previewX = GAME_WIDTH - 150;
    const previewY = GAME_HEIGHT / 2 - 40;

    // Preview bg panel
    const previewPanel = this.add.graphics();
    previewPanel.fillStyle(0x151525, 0.6);
    previewPanel.fillRoundedRect(previewX - 80, 38, 160, 260, 8);

    this.bigPreview = this.add.image(previewX, previewY, CHARACTERS[0].key)
      .setDisplaySize(120, 120).setDepth(10);

    // Idle sway
    this.tweens.add({
      targets: this.bigPreview,
      y: previewY - 5,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.bigName = this.add.text(previewX, previewY + 70, CHARACTERS[0].name, {
      fontSize: '18px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // DELETE button (only visible for custom characters)
    const delContainer = this.add.container(previewX, previewY + 95).setDepth(20);
    const delBg = this.add.graphics();
    delBg.fillStyle(0x000000, 0.4);
    delBg.fillRoundedRect(-40, -9, 80, 18, 4);
    delBg.fillStyle(0x884444);
    delBg.fillRoundedRect(-38, -10, 76, 16, 3);
    delContainer.add(delBg);
    const delText = this.add.text(0, -2, 'DELETE', {
      fontSize: '10px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
    }).setOrigin(0.5);
    delContainer.add(delText);
    const delHit = this.add.rectangle(0, -2, 80, 20, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    delHit.on('pointerdown', () => {
      const selected = CHARACTERS[this.selectedIndex];
      if (!selected.key.startsWith('char-custom-')) return;
      CHARACTERS.splice(this.selectedIndex, 1);
      try {
        const saved = JSON.parse(localStorage.getItem('customCharacters') || '[]');
        const filtered = saved.filter((c: { key: string }) => c.key !== selected.key);
        localStorage.setItem('customCharacters', JSON.stringify(filtered));
      } catch (_e) { /* ignore */ }
      this.selectedIndex = 0;
      this.scene.restart();
    });
    delContainer.add(delHit);
    delContainer.setVisible(false);
    this.deleteBtn = delContainer;

    // PLAY button
    const btnX = GAME_WIDTH - 150;
    const btnY = GAME_HEIGHT - 35;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x000000, 0.3);
    btnBg.fillRoundedRect(btnX - 62, btnY - 15, 124, 34, 8);
    btnBg.fillStyle(0xffcc00);
    btnBg.fillRoundedRect(btnX - 60, btnY - 16, 120, 32, 6);
    btnBg.fillStyle(0xffdd44, 0.5);
    btnBg.fillRoundedRect(btnX - 56, btnY - 14, 112, 14, 4);

    this.add.text(btnX, btnY, 'PLAY', {
      fontSize: '18px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);

    const playHit = this.add.rectangle(btnX, btnY, 130, 40, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100);

    playHit.once('pointerdown', () => {
      const selected = CHARACTERS[this.selectedIndex];
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('ModeSelectScene', {
          characterKey: selected.key,
          characterName: selected.name,
        });
      });
    });

    // Back button
    this.add.text(GAME_WIDTH - 30, 15, '←', {
      fontSize: '20px', fontFamily: 'Arial', color: '#666666',
    }).setOrigin(0.5).setInteractive().on('pointerdown', () => {
      this.scene.start('TitleScene');
    });

    this.updateSelection();
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  private updateSelection(): void {
    this.selectionBorder.clear();

    const cols = 10;
    const cellW = 32;
    const cellH = 52;
    const startX = 24;
    const startY = 58;

    const col = this.selectedIndex % cols;
    const row = Math.floor(this.selectedIndex / cols);
    const x = startX + col * cellW;
    const y = startY + row * cellH;

    const selected = CHARACTERS[this.selectedIndex];

    // Selection border
    this.selectionBorder.lineStyle(2, 0x44aaff, 1);
    this.selectionBorder.strokeRoundedRect(x - 14, y - 14, 28, 42, 4);

    // Update preview
    this.bigPreview.setTexture(selected.key);
    this.bigName.setText(selected.name);

    // Show delete button only for custom characters
    this.deleteBtn.setVisible(selected.key.startsWith('char-custom-'));
  }
}
