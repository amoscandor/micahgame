import Phaser from 'phaser';
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

  constructor() {
    super({ key: 'ArmorShopScene' });
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

    this.buildCards();

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

      // Armor icon — ultra high quality canvas preview
      const iconX = cx - cardW / 2 + 22;
      const iconY = cy - 8;
      const S = 256; // ultra hi-res canvas
      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const c = canvas.getContext('2d')!;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      const r = item.color >> 16 & 0xff, g = item.color >> 8 & 0xff, b = item.color & 0xff;
      const base = `rgb(${r},${g},${b})`;
      const dark = `rgb(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)})`;
      const darker = `rgb(${Math.max(0,r-80)},${Math.max(0,g-80)},${Math.max(0,b-80)})`;
      const darkest = `rgb(${Math.max(0,r-110)},${Math.max(0,g-110)},${Math.max(0,b-110)})`;
      const light = `rgb(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)})`;
      const bright = `rgb(${Math.min(255,r+100)},${Math.min(255,g+100)},${Math.min(255,b+100)})`;
      const glow = `rgba(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)},0.4)`;
      // Background glow
      const bgGlow = c.createRadialGradient(128, 128, 20, 128, 128, 120);
      bgGlow.addColorStop(0, glow);
      bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = bgGlow;
      c.fillRect(0, 0, S, S);

      if (item.slot === 'head') {
        // Spartan-style helmet — ultra detail
        const grad = c.createRadialGradient(100, 80, 10, 128, 128, 110);
        grad.addColorStop(0, bright);
        grad.addColorStop(0.4, base);
        grad.addColorStop(1, darker);
        // Main dome
        c.fillStyle = grad;
        c.beginPath();
        c.ellipse(128, 100, 76, 84, 0, Math.PI, 0);
        c.lineTo(204, 160);
        c.quadraticCurveTo(204, 192, 180, 200);
        c.lineTo(76, 200);
        c.quadraticCurveTo(52, 192, 52, 160);
        c.fill();
        // Engraved lines on dome
        c.strokeStyle = dark;
        c.lineWidth = 1.5;
        for (let a = -0.6; a <= 0.6; a += 0.3) {
          c.beginPath();
          c.ellipse(128, 100, 70, 78, a * 0.15, Math.PI + 0.3, -0.3);
          c.stroke();
        }
        // Face opening — deep shadow
        const faceGrad = c.createRadialGradient(128, 144, 5, 128, 144, 38);
        faceGrad.addColorStop(0, '#000000');
        faceGrad.addColorStop(1, '#0a0a0a');
        c.fillStyle = faceGrad;
        c.beginPath();
        c.ellipse(128, 144, 36, 44, 0, 0, Math.PI * 2);
        c.fill();
        // T-shaped visor
        c.fillStyle = '#111';
        c.fillRect(92, 116, 72, 10);
        c.fillRect(116, 110, 24, 64);
        // Inner visor glow
        c.fillStyle = 'rgba(100,160,255,0.08)';
        c.fillRect(94, 118, 68, 6);
        // Nose guard with bevel
        const noseGrad = c.createLinearGradient(120, 108, 136, 108);
        noseGrad.addColorStop(0, darker);
        noseGrad.addColorStop(0.5, dark);
        noseGrad.addColorStop(1, darker);
        c.fillStyle = noseGrad;
        c.fillRect(120, 108, 16, 68);
        // Crest/mohawk — layered
        const crestGrad = c.createLinearGradient(128, 16, 128, 100);
        crestGrad.addColorStop(0, bright);
        crestGrad.addColorStop(0.5, light);
        crestGrad.addColorStop(1, dark);
        c.fillStyle = crestGrad;
        c.beginPath();
        c.moveTo(116, 100);
        c.quadraticCurveTo(112, 36, 128, 12);
        c.quadraticCurveTo(144, 36, 140, 100);
        c.fill();
        // Crest ridges
        c.strokeStyle = darker;
        c.lineWidth = 1;
        for (let y = 24; y < 96; y += 8) {
          c.beginPath();
          const w = 8 + (y - 24) * 0.12;
          c.moveTo(128 - w, y);
          c.lineTo(128 + w, y);
          c.stroke();
        }
        // Cheek guards
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(56, 150);
        c.quadraticCurveTo(48, 170, 62, 192);
        c.lineTo(82, 186);
        c.quadraticCurveTo(72, 160, 68, 150);
        c.fill();
        c.beginPath();
        c.moveTo(200, 150);
        c.quadraticCurveTo(208, 170, 194, 192);
        c.lineTo(174, 186);
        c.quadraticCurveTo(184, 160, 188, 150);
        c.fill();
        // Shine highlights
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.beginPath();
        c.ellipse(96, 76, 24, 36, -0.3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.beginPath();
        c.ellipse(160, 90, 16, 24, 0.2, 0, Math.PI * 2);
        c.fill();
        // Edge trim
        c.strokeStyle = darkest;
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(52, 160);
        c.quadraticCurveTo(52, 192, 76, 200);
        c.lineTo(180, 200);
        c.quadraticCurveTo(204, 192, 204, 160);
        c.stroke();
        // Rivets along bottom
        for (const rx of [68, 92, 128, 164, 188]) {
          c.fillStyle = darkest;
          c.beginPath();
          c.arc(rx, 198, 4, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = light;
          c.beginPath();
          c.arc(rx - 1, 196, 1.5, 0, Math.PI * 2);
          c.fill();
        }
      } else if (item.slot === 'chest' || item.slot === 'full') {
        // Muscled chestplate — ultra detail
        const grad = c.createLinearGradient(60, 0, 200, 256);
        grad.addColorStop(0, light);
        grad.addColorStop(0.3, base);
        grad.addColorStop(0.7, dark);
        grad.addColorStop(1, darker);
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(48, 28);
        c.lineTo(84, 8);
        c.lineTo(172, 8);
        c.lineTo(208, 28);
        c.lineTo(216, 60);
        c.lineTo(208, 180);
        c.quadraticCurveTo(200, 220, 160, 232);
        c.lineTo(96, 232);
        c.quadraticCurveTo(56, 220, 48, 180);
        c.lineTo(40, 60);
        c.fill();
        // Pec muscles with shading
        const pecGrad = c.createRadialGradient(96, 72, 4, 96, 80, 32);
        pecGrad.addColorStop(0, base);
        pecGrad.addColorStop(1, dark);
        c.fillStyle = pecGrad;
        c.beginPath();
        c.ellipse(96, 80, 36, 28, 0, 0, Math.PI * 2);
        c.fill();
        const pecGrad2 = c.createRadialGradient(160, 72, 4, 160, 80, 32);
        pecGrad2.addColorStop(0, base);
        pecGrad2.addColorStop(1, dark);
        c.fillStyle = pecGrad2;
        c.beginPath();
        c.ellipse(160, 80, 36, 28, 0, 0, Math.PI * 2);
        c.fill();
        // Ab muscles — 6 pack
        c.strokeStyle = darker;
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(128, 112);
        c.lineTo(128, 216);
        c.stroke();
        for (const y of [128, 152, 176, 200]) {
          c.beginPath();
          c.moveTo(88, y);
          c.quadraticCurveTo(128, y + 6, 168, y);
          c.stroke();
        }
        // Individual ab shading
        for (const [ax, ay] of [[108,140],[148,140],[108,164],[148,164],[108,188],[148,188]]) {
          const abG = c.createRadialGradient(ax, ay, 2, ax, ay, 16);
          abG.addColorStop(0, 'rgba(255,255,255,0.06)');
          abG.addColorStop(1, 'rgba(0,0,0,0.04)');
          c.fillStyle = abG;
          c.beginPath();
          c.ellipse(ax, ay, 16, 10, 0, 0, Math.PI * 2);
          c.fill();
        }
        // Shoulder pauldrons
        for (const [sx, flip] of [[48, 1], [208, -1]] as [number, number][]) {
          const pGrad = c.createLinearGradient(sx, 12, sx + flip * 30, 50);
          pGrad.addColorStop(0, light);
          pGrad.addColorStop(1, darker);
          c.fillStyle = pGrad;
          c.beginPath();
          c.moveTo(sx, 28);
          c.lineTo(sx - flip * 16, 8);
          c.quadraticCurveTo(sx - flip * 24, 12, sx - flip * 20, 48);
          c.lineTo(sx, 42);
          c.fill();
          // Pauldron ridges
          c.strokeStyle = darkest;
          c.lineWidth = 1.5;
          for (let py = 18; py < 42; py += 8) {
            c.beginPath();
            c.moveTo(sx, py);
            c.lineTo(sx - flip * 16, py - 4);
            c.stroke();
          }
        }
        // Center gem with sparkle
        const gemGrad = c.createRadialGradient(126, 52, 2, 128, 56, 12);
        gemGrad.addColorStop(0, '#ffffff');
        gemGrad.addColorStop(0.3, bright);
        gemGrad.addColorStop(1, darker);
        c.fillStyle = gemGrad;
        c.beginPath();
        c.arc(128, 56, 12, 0, Math.PI * 2);
        c.fill();
        // Gem sparkle lines
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 1;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          c.beginPath();
          c.moveTo(128 + Math.cos(a) * 8, 56 + Math.sin(a) * 8);
          c.lineTo(128 + Math.cos(a) * 16, 56 + Math.sin(a) * 16);
          c.stroke();
        }
        // Shine
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.beginPath();
        c.ellipse(88, 64, 28, 40, -0.2, 0, Math.PI * 2);
        c.fill();
        // Edge outline
        c.strokeStyle = darkest;
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(48, 28);
        c.lineTo(40, 60);
        c.lineTo(48, 180);
        c.quadraticCurveTo(56, 220, 96, 232);
        c.lineTo(160, 232);
        c.quadraticCurveTo(200, 220, 208, 180);
        c.lineTo(216, 60);
        c.lineTo(208, 28);
        c.stroke();
        // Rivets along neckline
        for (const rx of [72, 96, 128, 160, 184]) {
          c.fillStyle = darkest;
          c.beginPath();
          c.arc(rx, 16, 4, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = light;
          c.beginPath();
          c.arc(rx - 1, 14, 1.5, 0, Math.PI * 2);
          c.fill();
        }
        if (item.slot === 'full') {
          // Waist belt
          c.fillStyle = darker;
          c.fillRect(56, 208, 144, 14);
          // Gold buckle
          const buckGrad = c.createLinearGradient(116, 208, 140, 222);
          buckGrad.addColorStop(0, '#ffe066');
          buckGrad.addColorStop(0.5, '#ffd700');
          buckGrad.addColorStop(1, '#b8860b');
          c.fillStyle = buckGrad;
          c.fillRect(116, 208, 24, 14);
          // Leg plates peek
          c.fillStyle = dark;
          c.fillRect(72, 222, 20, 16);
          c.fillRect(164, 222, 20, 16);
        }
      } else if (item.slot === 'shield') {
        // Kite shield — ultra detail
        const grad = c.createRadialGradient(108, 96, 20, 128, 128, 112);
        grad.addColorStop(0, bright);
        grad.addColorStop(0.5, base);
        grad.addColorStop(1, darker);
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(128, 8);
        c.lineTo(224, 40);
        c.lineTo(216, 144);
        c.quadraticCurveTo(200, 216, 128, 244);
        c.quadraticCurveTo(56, 216, 40, 144);
        c.lineTo(32, 40);
        c.fill();
        // Outer border — thick
        c.strokeStyle = darkest;
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(128, 8);
        c.lineTo(224, 40);
        c.lineTo(216, 144);
        c.quadraticCurveTo(200, 216, 128, 244);
        c.quadraticCurveTo(56, 216, 40, 144);
        c.lineTo(32, 40);
        c.closePath();
        c.stroke();
        // Inner border — ornate
        c.strokeStyle = light;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(128, 24);
        c.lineTo(208, 48);
        c.lineTo(200, 140);
        c.quadraticCurveTo(188, 200, 128, 228);
        c.quadraticCurveTo(68, 200, 56, 140);
        c.lineTo(48, 48);
        c.closePath();
        c.stroke();
        // Dragon/lion emblem instead of plain cross
        c.fillStyle = light;
        // Shield boss (center circle)
        const bossGrad = c.createRadialGradient(126, 120, 4, 128, 124, 28);
        bossGrad.addColorStop(0, '#ffffff');
        bossGrad.addColorStop(0.3, bright);
        bossGrad.addColorStop(1, dark);
        c.fillStyle = bossGrad;
        c.beginPath();
        c.arc(128, 124, 28, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = darkest;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(128, 124, 28, 0, Math.PI * 2);
        c.stroke();
        // Cross arms radiating from boss
        c.fillStyle = dark;
        c.fillRect(120, 40, 16, 76);
        c.fillRect(120, 156, 16, 60);
        c.fillRect(64, 116, 56, 16);
        c.fillRect(136, 116, 56, 16);
        // Cross bevel
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(122, 42, 6, 74);
        c.fillRect(66, 118, 54, 6);
        // Corner decorations
        for (const [cx2, cy2] of [[80, 60], [176, 60], [72, 180], [184, 180]]) {
          c.fillStyle = darkest;
          c.beginPath();
          c.arc(cx2, cy2, 8, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = light;
          c.beginPath();
          c.arc(cx2 - 2, cy2 - 2, 3, 0, Math.PI * 2);
          c.fill();
        }
        // Shine
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.beginPath();
        c.ellipse(96, 76, 32, 48, -0.2, 0, Math.PI * 2);
        c.fill();
        // Rivets around border
        const shieldPath = [[128,16],[56,44],[48,80],[44,120],[52,160],[72,196],[128,236],[184,196],[204,160],[212,120],[208,80],[200,44]];
        for (const [rx, ry] of shieldPath) {
          c.fillStyle = darkest;
          c.beginPath();
          c.arc(rx, ry, 5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = light;
          c.beginPath();
          c.arc(rx - 1.5, ry - 1.5, 2, 0, Math.PI * 2);
          c.fill();
        }
      } else if (item.slot === 'legs') {
        // Greaves — ultra detail
        for (const [lx, side] of [[36, -1], [144, 1]] as [number, number][]) {
          const legGrad = c.createLinearGradient(lx, 8, lx + 76, 240);
          legGrad.addColorStop(0, light);
          legGrad.addColorStop(0.4, base);
          legGrad.addColorStop(1, darker);
          c.fillStyle = legGrad;
          // Leg shape — tapered
          c.beginPath();
          c.moveTo(lx, 16);
          c.lineTo(lx + 76, 16);
          c.quadraticCurveTo(lx + 80, 120, lx + 72, 224);
          c.quadraticCurveTo(lx + 68, 240, lx + 52, 240);
          c.lineTo(lx + 24, 240);
          c.quadraticCurveTo(lx + 8, 240, lx + 4, 224);
          c.quadraticCurveTo(lx - 4, 120, lx, 16);
          c.fill();
          // Knee plate — layered
          const kneeGrad = c.createRadialGradient(lx + 38, 108, 4, lx + 38, 112, 28);
          kneeGrad.addColorStop(0, bright);
          kneeGrad.addColorStop(0.5, dark);
          kneeGrad.addColorStop(1, darkest);
          c.fillStyle = kneeGrad;
          c.beginPath();
          c.ellipse(lx + 38, 112, 32, 24, 0, 0, Math.PI * 2);
          c.fill();
          // Knee rivet
          c.fillStyle = bright;
          c.beginPath();
          c.arc(lx + 38, 112, 6, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.5)';
          c.beginPath();
          c.arc(lx + 36, 110, 2.5, 0, Math.PI * 2);
          c.fill();
          // Shin ridges — curved
          c.strokeStyle = darker;
          c.lineWidth = 2.5;
          for (const y of [144, 164, 184, 204]) {
            c.beginPath();
            c.moveTo(lx + 10, y);
            c.quadraticCurveTo(lx + 38, y + 4, lx + 66, y);
            c.stroke();
          }
          // Thigh plate decoration
          c.strokeStyle = dark;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(lx + 20, 28);
          c.quadraticCurveTo(lx + 38, 36, lx + 56, 28);
          c.stroke();
          c.beginPath();
          c.moveTo(lx + 22, 48);
          c.quadraticCurveTo(lx + 38, 56, lx + 54, 48);
          c.stroke();
          // Shine
          c.fillStyle = 'rgba(255,255,255,0.12)';
          c.beginPath();
          c.ellipse(lx + 24, 56, 12, 32, -0.1, 0, Math.PI * 2);
          c.fill();
          // Outline
          c.strokeStyle = darkest;
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(lx, 16);
          c.lineTo(lx + 76, 16);
          c.quadraticCurveTo(lx + 80, 120, lx + 72, 224);
          c.quadraticCurveTo(lx + 68, 240, lx + 52, 240);
          c.lineTo(lx + 24, 240);
          c.quadraticCurveTo(lx + 8, 240, lx + 4, 224);
          c.quadraticCurveTo(lx - 4, 120, lx, 16);
          c.closePath();
          c.stroke();
        }
      } else {
        // Armored boots — ultra detail
        for (const [bx] of [[8], [132]] as [number][]) {
          const bootGrad = c.createLinearGradient(bx, 20, bx + 112, 220);
          bootGrad.addColorStop(0, light);
          bootGrad.addColorStop(0.4, base);
          bootGrad.addColorStop(1, darker);
          c.fillStyle = bootGrad;
          // Boot shape
          c.beginPath();
          c.moveTo(bx + 16, 24);
          c.lineTo(bx + 88, 24);
          c.quadraticCurveTo(bx + 96, 80, bx + 92, 160);
          c.lineTo(bx + 104, 184);
          c.lineTo(bx + 104, 216);
          c.lineTo(bx + 4, 216);
          c.lineTo(bx + 4, 184);
          c.lineTo(bx + 12, 160);
          c.quadraticCurveTo(bx + 8, 80, bx + 16, 24);
          c.fill();
          // Sole
          c.fillStyle = '#111';
          c.fillRect(bx, 212, 108, 20);
          // Toe cap
          const toeGrad = c.createRadialGradient(bx + 54, 184, 8, bx + 54, 188, 32);
          toeGrad.addColorStop(0, base);
          toeGrad.addColorStop(1, darkest);
          c.fillStyle = toeGrad;
          c.beginPath();
          c.ellipse(bx + 54, 190, 44, 20, 0, 0, Math.PI);
          c.fill();
          // Ankle strap
          c.fillStyle = darker;
          c.fillRect(bx + 12, 96, 80, 14);
          // Gold buckle
          const buckGrad = c.createLinearGradient(bx + 42, 96, bx + 62, 110);
          buckGrad.addColorStop(0, '#ffe066');
          buckGrad.addColorStop(0.5, '#ffd700');
          buckGrad.addColorStop(1, '#b8860b');
          c.fillStyle = buckGrad;
          c.fillRect(bx + 42, 96, 20, 14);
          // Upper strap
          c.fillStyle = dark;
          c.fillRect(bx + 16, 48, 72, 10);
          // Shin plate
          c.fillStyle = dark;
          c.beginPath();
          c.moveTo(bx + 30, 52);
          c.lineTo(bx + 74, 52);
          c.lineTo(bx + 70, 92);
          c.lineTo(bx + 34, 92);
          c.fill();
          // Shin plate highlight
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(bx + 34, 56, 16, 30);
          // Lace holes
          for (let ly = 120; ly < 170; ly += 16) {
            c.fillStyle = darkest;
            c.beginPath();
            c.arc(bx + 44, ly, 3, 0, Math.PI * 2);
            c.fill();
            c.beginPath();
            c.arc(bx + 60, ly, 3, 0, Math.PI * 2);
            c.fill();
            // Lace
            c.strokeStyle = darker;
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(bx + 44, ly);
            c.lineTo(bx + 60, ly + 8);
            c.stroke();
            c.beginPath();
            c.moveTo(bx + 60, ly);
            c.lineTo(bx + 44, ly + 8);
            c.stroke();
          }
          // Shine
          c.fillStyle = 'rgba(255,255,255,0.1)';
          c.beginPath();
          c.ellipse(bx + 36, 56, 12, 28, -0.1, 0, Math.PI * 2);
          c.fill();
          // Outline
          c.strokeStyle = darkest;
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(bx + 16, 24);
          c.lineTo(bx + 88, 24);
          c.quadraticCurveTo(bx + 96, 80, bx + 92, 160);
          c.lineTo(bx + 104, 184);
          c.lineTo(bx + 104, 216);
          c.lineTo(bx + 4, 216);
          c.lineTo(bx + 4, 184);
          c.lineTo(bx + 12, 160);
          c.quadraticCurveTo(bx + 8, 80, bx + 16, 24);
          c.closePath();
          c.stroke();
        }
      }

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

      // Protection & price
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 22, `+${item.protection} HP  |  ${item.price} coins`, {
        fontSize: '9px', fontFamily: 'Arial', color: '#aaddff',
      }));

      // Description
      this.cardContainer.add(this.add.text(textX, cy - cardH / 2 + 34, item.description, {
        fontSize: '8px', fontFamily: 'Arial', color: '#888888',
      }));

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
