import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getCoins, spendCoins } from '../utils/coinStore';

export interface ArmorItem {
  id: string;
  name: string;
  price: number;
  description: string;
  protection: number;
  color: number;
  slot: 'head' | 'chest' | 'legs' | 'feet' | 'shield' | 'full';
}

export const ARMOR_ITEMS: ArmorItem[] = [
  { id: 'iron-helmet',       name: 'Iron Helmet',       price: 50,  description: 'Basic head protection',          protection: 10, color: 0x888888, slot: 'head' },
  { id: 'gold-helmet',       name: 'Gold Helmet',       price: 100, description: 'Shiny golden headgear',          protection: 20, color: 0xffcc00, slot: 'head' },
  { id: 'diamond-helmet',    name: 'Diamond Helmet',    price: 200, description: 'The toughest helmet around',     protection: 35, color: 0x44ddff, slot: 'head' },
  { id: 'leather-vest',      name: 'Leather Vest',      price: 40,  description: 'Light body armor',               protection: 8,  color: 0x8b5a2b, slot: 'chest' },
  { id: 'iron-chestplate',   name: 'Iron Chestplate',   price: 80,  description: 'Solid iron chest armor',         protection: 15, color: 0x999999, slot: 'chest' },
  { id: 'gold-chestplate',   name: 'Gold Chestplate',   price: 150, description: 'Flashy gold chest armor',        protection: 25, color: 0xffdd00, slot: 'chest' },
  { id: 'diamond-chestplate',name: 'Diamond Chestplate', price: 300, description: 'Ultimate chest protection',     protection: 40, color: 0x55eeff, slot: 'chest' },
  { id: 'leg-guards',        name: 'Leg Guards',        price: 60,  description: 'Protects your legs',             protection: 10, color: 0x777777, slot: 'legs' },
  { id: 'iron-boots',        name: 'Iron Boots',        price: 30,  description: 'Heavy duty footwear',            protection: 5,  color: 0x666666, slot: 'feet' },
  { id: 'shield',            name: 'Shield',            price: 100, description: 'Block attacks with style',       protection: 20, color: 0x4488ff, slot: 'shield' },
  { id: 'full-iron-suit',    name: 'Full Iron Suit',    price: 250, description: 'Complete iron armor set',        protection: 40, color: 0xaaaaaa, slot: 'full' },
  { id: 'full-diamond-suit', name: 'Full Diamond Suit', price: 500, description: 'The best armor in the game!',   protection: 80, color: 0x66eeff, slot: 'full' },
];

const ARMOR_KEY = 'fighting-wars-armor';
const EQUIPPED_KEY = 'fighting-wars-equipped-armor';

function getPurchasedArmor(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ARMOR_KEY) || '[]');
  } catch { return []; }
}

function savePurchasedArmor(ids: string[]): void {
  localStorage.setItem(ARMOR_KEY, JSON.stringify(ids));
}

export function getEquippedArmor(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]');
  } catch { return []; }
}

function saveEquippedArmor(ids: string[]): void {
  localStorage.setItem(EQUIPPED_KEY, JSON.stringify(ids));
}

export class ArmorShopScene extends Phaser.Scene {
  private coinText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private cardContainer!: Phaser.GameObjects.Container;
  private statusTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private gpPrev: Record<string, boolean> = {};
  private selectedIndex = 0;
  private focusBorder!: Phaser.GameObjects.Graphics;
  private gpActive = false;
  private cardBounds: { cx: number; cy: number; w: number; h: number }[] = [];

  constructor() {
    super({ key: 'ArmorShopScene' });
  }

  /** Render a piece of armor as a 3D canvas icon matching the in-game model */
  private render3DArmorIcon(item: ArmorItem): HTMLCanvasElement {
    const S = 256;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(S, S);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(1.5, 1.2, 2.5);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0x8899cc, 0.5).translateX(-3).translateY(2));

    const mat = new THREE.MeshStandardMaterial({
      color: item.color,
      roughness: 0.15,
      metalness: 0.9,
      emissive: item.color,
      emissiveIntensity: 0.2,
    });

    const root = new THREE.Group();
    scene.add(root);

    if (item.slot === 'head') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 14), mat);
      helmet.scale.set(1, 1.1, 1);
      root.add(helmet);
      const facePlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.95, roughness: 0.05 }),
      );
      facePlate.position.set(0, -0.08, 0.52);
      root.add(facePlate);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.65), mat);
      crest.position.set(0, 0.4, -0.05);
      root.add(crest);
    } else if (item.slot === 'chest' || item.slot === 'full') {
      const front = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.25), mat);
      front.position.set(0, 0.1, 0.15);
      root.add(front);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, 0.2), mat);
      back.position.set(0, 0.1, -0.15);
      root.add(back);
      for (const side of [-1, 1]) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.6), mat);
        sp.position.set(side * 0.6, 0.1, 0);
        root.add(sp);
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat);
        pad.scale.set(1.3, 0.7, 1.3);
        pad.position.set(side * 0.7, 0.55, 0);
        root.add(pad);
      }
      const collar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 0.72), mat);
      collar.position.set(0, 0.72, 0);
      root.add(collar);
      if (item.slot === 'full') {
        // Add leg plates hint for full suit
        for (const side of [-1, 1]) {
          const thighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), mat);
          thighPlate.position.set(side * 0.25, -0.75, 0);
          root.add(thighPlate);
        }
      }
    } else if (item.slot === 'shield') {
      // Curved shield
      const shield = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI, 0, Math.PI * 0.7),
        mat,
      );
      shield.rotation.y = Math.PI / 2;
      shield.rotation.z = -0.1;
      root.add(shield);
      const emblem = new THREE.Mesh(
        new THREE.CircleGeometry(0.22, 16),
        new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.9, roughness: 0.1 }),
      );
      emblem.position.set(0.22, 0, 0);
      emblem.rotation.y = -Math.PI / 2;
      root.add(emblem);
    } else if (item.slot === 'legs') {
      for (const sx of [-0.4, 0.4]) {
        const thighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), mat);
        thighPlate.position.set(sx, 0.35, 0);
        root.add(thighPlate);
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
        knee.position.set(sx, -0.05, 0.15);
        root.add(knee);
        const shinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.65, 0.46), mat);
        shinPlate.position.set(sx, -0.45, 0);
        root.add(shinPlate);
      }
    } else {
      // feet
      for (const sx of [-0.35, 0.35]) {
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.75), mat);
        boot.position.set(sx, 0.0, 0.1);
        root.add(boot);
        const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.46), mat);
        ankle.position.set(sx, 0.25, 0);
        root.add(ankle);
      }
    }

    // Slight rotation so the 3D-ness reads at a glance
    root.rotation.y = -0.4;

    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    renderer.dispose();
    return canvas;
  }

  create(): void {
    this.scrollY = 0;
    this.statusTexts.clear();

    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75);

    // Title
    this.add.text(GAME_WIDTH / 2, 22, 'ARMOR SHOP', {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif',
      color: '#ff8800', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Coin display
    this.coinText = this.add.text(GAME_WIDTH - 10, 20, `${getCoins()} coins`, {
      fontSize: '12px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0.5);

    // Back button
    this.add.text(30, 20, '\u2190 BACK', {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.scene.start('ShopHubScene');
      });

    // Scrollable card area
    const topY = 44;
    const areaH = GAME_HEIGHT - topY - 4;

    // Mask for scrolling area
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillRect(0, topY, GAME_WIDTH, areaH);
    const mask = maskShape.createGeometryMask();

    this.cardContainer = this.add.container(0, topY);
    this.cardContainer.setMask(mask);

    this.focusBorder = this.add.graphics().setDepth(50);
    this.cardContainer.add(this.focusBorder);

    this.buildCards();
    this.updateFocusBorder();

    // Scroll with mouse wheel
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gx: number[], _gy: number[], _gz: number[], deltaY: number) => {
      this.scrollCards(deltaY > 0 ? -30 : 30);
    });

    // Touch drag scroll
    let dragStartY = 0;
    let dragScrollStart = 0;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > topY) {
        dragStartY = pointer.y;
        dragScrollStart = this.scrollY;
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.y > topY) {
        const dy = pointer.y - dragStartY;
        if (Math.abs(dy) > 5) {
          this.scrollY = dragScrollStart + dy;
          this.clampScroll();
          this.cardContainer.y = 44 + this.scrollY;
        }
      }
    });

    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  update(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;
      const edge = (k: string, cur: boolean) => {
        const prev = !!this.gpPrev[k];
        this.gpPrev[k] = cur;
        return cur && !prev;
      };
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const up = !!gp.buttons[12]?.pressed || ay < -0.5;
      const down = !!gp.buttons[13]?.pressed || ay > 0.5;
      const left = !!gp.buttons[14]?.pressed || ax < -0.5;
      const right = !!gp.buttons[15]?.pressed || ax > 0.5;
      const cols = 4;
      const max = ARMOR_ITEMS.length - 1;

      const anyInput = up || down || left || right || !!gp.buttons[0]?.pressed || !!gp.buttons[1]?.pressed || !!gp.buttons[3]?.pressed;
      if (anyInput && !this.gpActive) { this.gpActive = true; this.updateFocusBorder(); }

      if (edge('left', left) && this.selectedIndex > 0) {
        this.selectedIndex--; this.updateFocusBorder(); this.scrollToSelected();
      }
      if (edge('right', right) && this.selectedIndex < max) {
        this.selectedIndex++; this.updateFocusBorder(); this.scrollToSelected();
      }
      if (edge('up', up) && this.selectedIndex - cols >= 0) {
        this.selectedIndex -= cols; this.updateFocusBorder(); this.scrollToSelected();
      }
      if (edge('down', down) && this.selectedIndex + cols <= max) {
        this.selectedIndex += cols; this.updateFocusBorder(); this.scrollToSelected();
      }

      // A → buy if not owned, else toggle equip
      if (edge('confirm', !!gp.buttons[0]?.pressed)) {
        this.activateSelected();
      }
      // Y → toggle equip explicitly (when owned)
      if (edge('equip', !!gp.buttons[3]?.pressed)) {
        const item = ARMOR_ITEMS[this.selectedIndex];
        if (getPurchasedArmor().includes(item.id)) this.toggleEquipById(item);
      }
      // B → back
      if (edge('back', !!gp.buttons[1]?.pressed)) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => this.scene.start('ShopHubScene'));
      }
      break;
    }
  }

  private activateSelected(): void {
    const item = ARMOR_ITEMS[this.selectedIndex];
    if (getPurchasedArmor().includes(item.id)) {
      this.toggleEquipById(item);
    } else {
      if (!spendCoins(item.price)) {
        const warn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Not enough coins!', {
          fontSize: '12px', fontFamily: 'Arial Black', color: '#ff4444',
          stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(1000);
        this.time.delayedCall(1500, () => warn.destroy());
        return;
      }
      const purchased = getPurchasedArmor();
      purchased.push(item.id);
      savePurchasedArmor(purchased);
      this.coinText.setText(`${getCoins()} coins`);
      this.cardContainer.removeAll(true);
      this.statusTexts.clear();
      this.focusBorder = this.add.graphics().setDepth(50);
      this.cardContainer.add(this.focusBorder);
      this.buildCards();
      this.updateFocusBorder();
    }
  }

  private toggleEquipById(item: ArmorItem): void {
    let equipped = getEquippedArmor();
    const isEquipped = equipped.includes(item.id);
    if (isEquipped) {
      equipped = equipped.filter(id => id !== item.id);
    } else {
      if (item.slot === 'full') {
        equipped = [];
      } else {
        equipped = equipped.filter(id => {
          const existing = ARMOR_ITEMS.find(a => a.id === id);
          return existing && existing.slot !== 'full' && existing.slot !== item.slot;
        });
      }
      equipped.push(item.id);
    }
    saveEquippedArmor(equipped);
    this.cardContainer.removeAll(true);
    this.statusTexts.clear();
    this.focusBorder = this.add.graphics().setDepth(50);
    this.cardContainer.add(this.focusBorder);
    this.buildCards();
    this.updateFocusBorder();
  }

  private updateFocusBorder(): void {
    if (!this.focusBorder) return;
    this.focusBorder.clear();
    if (!this.gpActive) return;
    const b = this.cardBounds[this.selectedIndex];
    if (!b) return;
    this.focusBorder.lineStyle(3, 0xffff55, 1);
    this.focusBorder.strokeRoundedRect(b.cx - b.w / 2 - 2, b.cy - b.h / 2 - 2, b.w + 4, b.h + 4, 7);
  }

  private scrollToSelected(): void {
    const b = this.cardBounds[this.selectedIndex];
    if (!b) return;
    const topY = 44;
    const areaH = GAME_HEIGHT - topY - 4;
    const cardAbsY = b.cy + this.scrollY; // y in card container + current scroll offset
    const minVisible = 8;
    const maxVisible = areaH - 8;
    if (cardAbsY - b.h / 2 < minVisible) {
      this.scrollY += minVisible - (cardAbsY - b.h / 2);
    } else if (cardAbsY + b.h / 2 > maxVisible) {
      this.scrollY -= (cardAbsY + b.h / 2) - maxVisible;
    }
    this.clampScroll();
    this.cardContainer.y = 44 + this.scrollY;
  }

  private scrollCards(delta: number): void {
    this.scrollY += delta;
    this.clampScroll();
    this.cardContainer.y = 44 + this.scrollY;
  }

  private clampScroll(): void {
    const areaH = GAME_HEIGHT - 48;
    const cols = 4;
    const rows = Math.ceil(ARMOR_ITEMS.length / cols);
    const cardH = 82;
    const totalH = rows * cardH + 8;
    const minScroll = Math.min(0, areaH - totalH);
    this.scrollY = Phaser.Math.Clamp(this.scrollY, minScroll, 0);
  }

  private buildCards(): void {
    this.cardBounds = [];
    const purchased = getPurchasedArmor();
    const equipped = getEquippedArmor();
    const cols = 4;
    const cardW = 200;
    const cardH = 82;
    const padX = 8;
    const padY = 6;
    const startX = (GAME_WIDTH - cols * (cardW + padX)) / 2 + padX / 2;

    for (let i = 0; i < ARMOR_ITEMS.length; i++) {
      const item = ARMOR_ITEMS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + padX) + cardW / 2;
      const cy = row * (cardH + padY) + cardH / 2 + 4;

      // Card background
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a2e, 0.9);
      bg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      bg.lineStyle(1, 0x444466);
      bg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      this.cardContainer.add(bg);

      // Armor icon — 3D rendered (matches in-game player armor)
      const iconX = cx - cardW / 2 + 22;
      const iconY = cy - 8;
      const canvas = this.render3DArmorIcon(item);


      const texKey = 'armor-icon-' + item.id;
      if (this.textures.exists(texKey)) this.textures.remove(texKey);
      this.textures.addCanvas(texKey, canvas);
      const iconImg = this.add.image(iconX, iconY, texKey).setDisplaySize(36, 36);
      this.cardContainer.add(iconImg);

      // Name
      const textX = cx - cardW / 2 + 44;
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 8, item.name, {
        fontSize: '11px', fontFamily: 'Arial Black', color: '#ffffff',
        stroke: '#000', strokeThickness: 1,
      }));

      // Protection
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 22, `+${item.protection} HP`, {
        fontSize: '9px', fontFamily: 'Arial', color: '#aaddff',
      }));

      // Price — prominent gold text with coin marker
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 34, `\u2605 ${item.price} coins`, {
        fontSize: '11px', fontFamily: 'Arial Black', color: '#ffdd00',
        stroke: '#000', strokeThickness: 2,
      }));

      // Description
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 48, item.description, {
        fontSize: '8px', fontFamily: 'Arial', color: '#888888',
      }));

      // Track card bounds for gamepad focus
      this.cardBounds.push({ cx, cy, w: cardW, h: cardH });

      // Status text
      const statusTxt = this.add.text(cx + cardW / 2 - 8, cy - cardH / 2 + 8, '', {
        fontSize: '8px', fontFamily: 'Arial Black', color: '#44ff44',
      }).setOrigin(1, 0);
      this.cardContainer.add(statusTxt);
      this.statusTexts.set(item.id, statusTxt);

      // Buttons row
      const btnY = cy + cardH / 2 - 18;
      const owned = purchased.includes(item.id);
      const isEquipped = equipped.includes(item.id);

      // BUY button
      const buyBg = this.add.graphics();
      const buyX = cx + cardW / 2 - 90;
      if (owned) {
        buyBg.fillStyle(0x333333);
      } else {
        buyBg.fillStyle(0x228833);
      }
      buyBg.fillRoundedRect(buyX - 30, btnY - 9, 60, 18, 4);
      this.cardContainer.add(buyBg);
      const buyLabel = this.add.text(buyX, btnY, owned ? 'OWNED' : 'BUY', {
        fontSize: '9px', fontFamily: 'Arial Black',
        color: owned ? '#666666' : '#ffffff',
      }).setOrigin(0.5);
      this.cardContainer.add(buyLabel);

      if (!owned) {
        const buyHit = this.add.rectangle(buyX, btnY, 60, 18, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        this.cardContainer.add(buyHit);
        buyHit.on('pointerdown', () => {
          this.buyArmor(item, buyBg, buyLabel, buyHit);
        });
      }

      // EQUIP button
      const equipX = cx + cardW / 2 - 28;
      const equipBg = this.add.graphics();
      if (!owned) {
        equipBg.fillStyle(0x222222);
      } else if (isEquipped) {
        equipBg.fillStyle(0x886600);
      } else {
        equipBg.fillStyle(0x2266cc);
      }
      equipBg.fillRoundedRect(equipX - 24, btnY - 9, 48, 18, 4);
      this.cardContainer.add(equipBg);
      const equipLabel = this.add.text(equipX, btnY, isEquipped ? 'ON' : 'EQUIP', {
        fontSize: '9px', fontFamily: 'Arial Black',
        color: !owned ? '#444444' : '#ffffff',
      }).setOrigin(0.5);
      this.cardContainer.add(equipLabel);

      if (owned) {
        const equipHit = this.add.rectangle(equipX, btnY, 48, 18, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        this.cardContainer.add(equipHit);
        equipHit.on('pointerdown', () => {
          this.toggleEquip(item, equipBg, equipLabel);
        });
      }

      // Update status
      this.updateStatusText(item.id, owned, isEquipped);
    }
  }

  private buyArmor(
    item: ArmorItem,
    buyBg: Phaser.GameObjects.Graphics,
    buyLabel: Phaser.GameObjects.Text,
    buyHit: Phaser.GameObjects.Rectangle,
  ): void {
    if (!spendCoins(item.price)) {
      // Not enough coins — flash feedback
      const warn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Not enough coins!', {
        fontSize: '12px', fontFamily: 'Arial Black', color: '#ff4444',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => warn.destroy());
      return;
    }

    // Save purchase
    const purchased = getPurchasedArmor();
    purchased.push(item.id);
    savePurchasedArmor(purchased);

    // Update coin display
    this.coinText.setText(`${getCoins()} coins`);

    // Update button visuals
    buyBg.clear();
    buyBg.fillStyle(0x333333);
    buyBg.fillRoundedRect(-30, -9, 60, 18, 4);
    buyLabel.setText('OWNED');
    buyLabel.setColor('#666666');
    buyHit.disableInteractive();

    // Rebuild cards to refresh equip buttons
    this.cardContainer.removeAll(true);
    this.statusTexts.clear();
    this.buildCards();

    this.updateStatusText(item.id, true, false);
  }

  private toggleEquip(
    item: ArmorItem,
    equipBg: Phaser.GameObjects.Graphics,
    equipLabel: Phaser.GameObjects.Text,
  ): void {
    let equipped = getEquippedArmor();
    const isEquipped = equipped.includes(item.id);

    if (isEquipped) {
      // Unequip
      equipped = equipped.filter(id => id !== item.id);
    } else {
      // If this is a "full" suit, remove other armor; if equipping a piece, remove full suits
      if (item.slot === 'full') {
        equipped = [];
      } else {
        // Remove any full suit and any item in the same slot
        equipped = equipped.filter(id => {
          const existing = ARMOR_ITEMS.find(a => a.id === id);
          return existing && existing.slot !== 'full' && existing.slot !== item.slot;
        });
      }
      equipped.push(item.id);
    }

    saveEquippedArmor(equipped);

    // Rebuild cards to refresh all equip states
    this.cardContainer.removeAll(true);
    this.statusTexts.clear();
    this.buildCards();
  }

  private updateStatusText(id: string, owned: boolean, equipped: boolean): void {
    const txt = this.statusTexts.get(id);
    if (!txt) return;
    if (equipped) {
      txt.setText('EQUIPPED');
      txt.setColor('#ffcc00');
    } else if (owned) {
      txt.setText('OWNED');
      txt.setColor('#44ff44');
    } else {
      txt.setText('');
    }
  }
}
