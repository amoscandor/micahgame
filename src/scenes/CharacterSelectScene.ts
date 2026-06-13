import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { addCoins } from '../utils/coinStore';

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
  { key: 'char-steve', name: 'Steve', gender: 'boy' },
];

export class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex: number = 0;
  private selectionBorder!: Phaser.GameObjects.Graphics;
  private focusBorder!: Phaser.GameObjects.Graphics;
  private bigPreview!: Phaser.GameObjects.Image;
  private bigName!: Phaser.GameObjects.Text;
  private deleteBtn!: Phaser.GameObjects.Container;
  private gpPrev: Record<string, boolean> = {};
  private gpAxPrev: Record<string, number> = {};
  private onPlayConfirm?: () => void;
  private onMakeConfirm?: () => void;
  private onShopConfirm?: () => void;
  private focusZone: 'grid' | 'make' | 'shop' = 'grid';
  private makeBtnBounds = { x: 95, y: 330, w: 130, h: 28 };
  private shopBtnBounds = { x: 245, y: 330, w: 130, h: 28 };

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  create(): void {
    // Keep legacy skin-drawing/thumb/name in sync with whichever skin is
    // active (or the first in the list), so the drawn-skin entry appears here
    // and auto-applies in battle without re-opening the Draw-on-Skin scene.
    try {
      const rawList = localStorage.getItem('fighting-wars-skins-list');
      if (rawList) {
        const list = JSON.parse(rawList);
        if (Array.isArray(list) && list.length > 0) {
          const activeId = localStorage.getItem('fighting-wars-active-skin-id');
          const picked =
            (activeId && list.find((s: { id: string }) => s && s.id === activeId))
            || list[0];
          if (picked && picked.data && typeof picked.data === 'object') {
            localStorage.setItem('fighting-wars-skin-drawing', JSON.stringify(picked.data));
            if (picked.thumb) localStorage.setItem('fighting-wars-skin-thumb', picked.thumb);
            if (picked.name) localStorage.setItem('fighting-wars-skin-name', picked.name);
          }
        }
      }
    } catch (_e) { /* ignore */ }

    // Add drawn skin to character list if it exists
    const drawnThumb = localStorage.getItem('fighting-wars-skin-thumb');
    const drawnName = localStorage.getItem('fighting-wars-skin-name') || 'My Skin';
    const drawnKey = 'char-drawn-skin';
    // Remove old drawn skin entry if exists, then add fresh one
    const drawnIdx = CHARACTERS.findIndex(c => c.key === drawnKey);
    if (drawnIdx >= 0) CHARACTERS.splice(drawnIdx, 1);
    if (drawnThumb) {
      // Load thumbnail as a Phaser texture synchronously before building grid
      if (this.textures.exists(drawnKey)) this.textures.remove(drawnKey);
      const img = new Image();
      img.src = drawnThumb;
      // Create a canvas texture immediately from the data URL
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const imgSync = new Image();
      imgSync.src = drawnThumb;
      ctx.drawImage(imgSync, 0, 0, 512, 512);
      this.textures.addCanvas(drawnKey, canvas);
      // Also update once fully loaded for better quality
      img.onload = () => {
        ctx.clearRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);
        this.textures.get(drawnKey).getSourceImage();
      };
      // Add to start of character list
      CHARACTERS.unshift({ key: drawnKey, name: drawnName, gender: 'boy' });
    }

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

    // Character grid — 10 columns x 3 rows
    const cols = 10;
    const cellW = 32;
    const cellH = 52;
    const startX = 24;
    const startY = 58;

    this.selectionBorder = this.add.graphics().setDepth(50);
    this.focusBorder = this.add.graphics().setDepth(110);

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
    const makeConfirm = () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => {
        this.scene.start('CharacterCreatorScene');
      });
    };
    this.onMakeConfirm = makeConfirm;
    this.add.rectangle(makeX, makeY, 130, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100)
      .on('pointerdown', makeConfirm);
    this.makeBtnBounds = { x: makeX, y: makeY, w: 130, h: 28 };

    // "SHOP" button (right of MAKE YOUR OWN)
    const shopX = 245;
    const shopY = 330;
    const shopBg = this.add.graphics();
    shopBg.fillStyle(0x000000, 0.3);
    shopBg.fillRoundedRect(shopX - 62, shopY - 11, 124, 24, 6);
    shopBg.fillStyle(0xffaa00);
    shopBg.fillRoundedRect(shopX - 60, shopY - 12, 120, 22, 5);
    shopBg.fillStyle(0xffcc44, 0.4);
    shopBg.fillRoundedRect(shopX - 56, shopY - 10, 112, 10, 3);
    this.add.text(shopX, shopY - 1, 'SHOP', {
      fontSize: '10px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);
    const shopConfirm = () => {
      const selected = CHARACTERS[this.selectedIndex];
      localStorage.setItem('selectedCharKey', selected.key);
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => {
        this.scene.start('ShopHubScene');
      });
    };
    this.onShopConfirm = shopConfirm;
    this.add.rectangle(shopX, shopY, 130, 28, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100)
      .on('pointerdown', shopConfirm);
    this.shopBtnBounds = { x: shopX, y: shopY, w: 130, h: 28 };

    // "SETTINGS" button — between character grid and preview, at top
    const setX = GAME_WIDTH / 2 + 60;
    const setY = 50;
    const setBg = this.add.graphics();
    setBg.fillStyle(0x000000, 0.3);
    setBg.fillRoundedRect(setX - 90, setY - 18, 180, 36, 8);
    setBg.fillStyle(0x666666);
    setBg.fillRoundedRect(setX - 88, setY - 17, 176, 34, 7);
    setBg.fillStyle(0x888888, 0.4);
    setBg.fillRoundedRect(setX - 82, setY - 14, 164, 16, 4);
    this.add.text(setX, setY, '⚙ SETTINGS', {
      fontSize: '16px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(setX, setY, 186, 40, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100)
      .on('pointerdown', () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
          this.scene.start('SettingsScene');
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
      if (selected.key.startsWith('char-custom-')) {
        CHARACTERS.splice(this.selectedIndex, 1);
        try {
          const saved = JSON.parse(localStorage.getItem('customCharacters') || '[]');
          const filtered = saved.filter((c: { key: string }) => c.key !== selected.key);
          localStorage.setItem('customCharacters', JSON.stringify(filtered));
        } catch (_e) { /* ignore */ }
        this.selectedIndex = 0;
        this.scene.restart();
        return;
      }
      if (selected.key === 'char-drawn-skin') {
        // Remove the currently-active drawn skin from the saved list and refund 50 coins.
        try {
          const rawList = localStorage.getItem('fighting-wars-skins-list');
          if (rawList) {
            const list = JSON.parse(rawList);
            if (Array.isArray(list) && list.length > 0) {
              const activeId = localStorage.getItem('fighting-wars-active-skin-id');
              const idx = activeId
                ? list.findIndex((s: { id: string }) => s && s.id === activeId)
                : 0;
              const removeIdx = idx >= 0 ? idx : 0;
              list.splice(removeIdx, 1);
              localStorage.setItem('fighting-wars-skins-list', JSON.stringify(list));
              if (list.length > 0) {
                localStorage.setItem('fighting-wars-active-skin-id', list[0].id);
              } else {
                localStorage.removeItem('fighting-wars-active-skin-id');
                localStorage.removeItem('fighting-wars-skin-drawing');
                localStorage.removeItem('fighting-wars-skin-thumb');
                localStorage.removeItem('fighting-wars-skin-name');
              }
              addCoins(50);
            }
          }
        } catch (_e) { /* ignore */ }
        CHARACTERS.splice(this.selectedIndex, 1);
        this.selectedIndex = 0;
        this.scene.restart();
      }
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

    const confirmPlay = () => {
      if (!playHit.input) return;
      playHit.removeInteractive();
      const selected = CHARACTERS[this.selectedIndex];
      localStorage.setItem('selectedCharKey', selected.key);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('BattleScene', {
          characterKey: selected.key,
          characterName: selected.name,
          mode: 'players-first',
          opponent: 'bots',
        });
      });
    };
    this.onPlayConfirm = confirmPlay;
    playHit.once('pointerdown', confirmPlay);
    this.input.keyboard?.on('keydown-ENTER', confirmPlay);
    this.input.keyboard?.on('keydown-SPACE', confirmPlay);

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
    this.bigPreview.setDisplaySize(120, 120);
    this.bigName.setText(selected.name);

    // Show delete button for custom characters and drawn skins
    this.deleteBtn.setVisible(
      selected.key.startsWith('char-custom-') || selected.key === 'char-drawn-skin',
    );

    // Focus border around MAKE YOUR OWN / SHOP buttons when focused
    this.focusBorder.clear();
    if (this.focusZone === 'make') {
      const b = this.makeBtnBounds;
      this.focusBorder.lineStyle(3, 0xffffff, 1);
      this.focusBorder.strokeRoundedRect(b.x - b.w / 2 - 2, b.y - b.h / 2 - 2, b.w + 4, b.h + 4, 7);
    } else if (this.focusZone === 'shop') {
      const b = this.shopBtnBounds;
      this.focusBorder.lineStyle(3, 0xffffff, 1);
      this.focusBorder.strokeRoundedRect(b.x - b.w / 2 - 2, b.y - b.h / 2 - 2, b.w + 4, b.h + 4, 7);
    }
  }

  update(): void {
    // Xbox controller navigation: D-pad / L-stick moves focus between the
    // character grid, MAKE YOUR OWN and SHOP buttons. A confirms the focused
    // item (PLAY when in the grid).
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;
      const cols = 10;
      const max = CHARACTERS.length - 1;
      const lastRow = Math.floor(max / cols);
      const up = !!gp.buttons[12]?.pressed;
      const down = !!gp.buttons[13]?.pressed;
      const left = !!gp.buttons[14]?.pressed;
      const right = !!gp.buttons[15]?.pressed;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const stickRight = ax > 0.5, stickLeft = ax < -0.5;
      const stickDown = ay > 0.5, stickUp = ay < -0.5;
      const edge = (key: string, cur: boolean) => {
        const prev = !!this.gpPrev[key];
        this.gpPrev[key] = cur;
        return cur && !prev;
      };
      const goLeft = edge('left', left || stickLeft);
      const goRight = edge('right', right || stickRight);
      const goUp = edge('up', up || stickUp);
      const goDown = edge('down', down || stickDown);

      if (this.focusZone === 'grid') {
        if (goLeft && this.selectedIndex > 0) { this.selectedIndex--; this.updateSelection(); }
        if (goRight && this.selectedIndex < max) { this.selectedIndex++; this.updateSelection(); }
        if (goUp && this.selectedIndex - cols >= 0) { this.selectedIndex -= cols; this.updateSelection(); }
        if (goDown) {
          const nextIdx = this.selectedIndex + cols;
          if (nextIdx <= max) {
            this.selectedIndex = nextIdx;
            this.updateSelection();
          } else if (Math.floor(this.selectedIndex / cols) === lastRow) {
            // Leave the grid and land on MAKE YOUR OWN / SHOP depending on column
            this.focusZone = (this.selectedIndex % cols) < 5 ? 'make' : 'shop';
            this.updateSelection();
          }
        }
      } else if (this.focusZone === 'make') {
        if (goRight) { this.focusZone = 'shop'; this.updateSelection(); }
        if (goUp) { this.focusZone = 'grid'; this.updateSelection(); }
      } else if (this.focusZone === 'shop') {
        if (goLeft) { this.focusZone = 'make'; this.updateSelection(); }
        if (goUp) { this.focusZone = 'grid'; this.updateSelection(); }
      }

      // A / Start → confirm focused item
      const confirmCur = !!gp.buttons[0]?.pressed || !!gp.buttons[9]?.pressed;
      if (edge('confirm', confirmCur)) {
        if (this.focusZone === 'make') this.onMakeConfirm?.();
        else if (this.focusZone === 'shop') this.onShopConfirm?.();
        else this.onPlayConfirm?.();
      }
      // B → back to title
      if (edge('back', !!gp.buttons[1]?.pressed)) {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => this.scene.start('TitleScene'));
      }
      break;
    }
  }
}
