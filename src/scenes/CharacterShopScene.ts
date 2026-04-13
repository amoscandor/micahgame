import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { CHARACTERS } from './CharacterSelectScene';
import { SHOP_CHARACTERS, ShopCharacter } from '../data/shopCharacters';
import { getCharacterTextures } from '../utils/charPainter';
import { getCoins, spendCoins } from '../utils/coinStore';

const PURCHASED_KEY = 'fighting-wars-purchased';

export class CharacterShopScene extends Phaser.Scene {
  private searchInput: HTMLInputElement | null = null;
  private resultContainer!: Phaser.GameObjects.Container;
  private previewImage!: Phaser.GameObjects.Image;
  private previewName!: Phaser.GameObjects.Text;
  private priceText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private buyBtnBg!: Phaser.GameObjects.Graphics;
  private buyBtnText!: Phaser.GameObjects.Text;
  private buyHit!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private selectedChar: ShopCharacter | null = null;
  private previewTexKey = '__shop_preview__';

  constructor() {
    super({ key: 'CharacterShopScene' });
  }

  create(): void {
    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);

    // Title
    this.add.text(GAME_WIDTH / 2, 20, 'CHARACTER SHOP', {
      fontSize: '18px', fontFamily: 'Arial Black, sans-serif',
      color: '#ffdd00', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Coin display
    this.coinText = this.add.text(GAME_WIDTH - 10, 18, `${getCoins()} coins`, {
      fontSize: '12px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0.5);

    // Back button
    this.add.text(30, 18, '\u2190 BACK', {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.removeSearchInput();
        this.scene.start('CharacterSelectScene');
      });

    // Left panel — search
    const leftPanel = this.add.graphics();
    leftPanel.fillStyle(0x151525, 0.8);
    leftPanel.fillRoundedRect(10, 40, 220, 340, 8);

    this.add.text(120, 55, 'Search a character:', {
      fontSize: '10px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5);

    // HTML search input
    this.createSearchInput(120, 75);

    // Results container
    this.resultContainer = this.add.container(10, 95);

    // Right panel — preview
    const rightPanel = this.add.graphics();
    rightPanel.fillStyle(0x151525, 0.8);
    rightPanel.fillRoundedRect(240, 40, 200, 340, 8);

    const previewX = 340;
    const previewY = 160;

    // Placeholder preview — big and clear
    this.previewImage = this.add.image(previewX, previewY, '__missing')
      .setDisplaySize(10, 10).setVisible(false);

    this.previewName = this.add.text(previewX, previewY + 80, '', {
      fontSize: '16px', fontFamily: 'Arial Black', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.priceText = this.add.text(previewX, previewY + 100, '', {
      fontSize: '13px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Status text (for "PURCHASED!" or "NOT ENOUGH COINS")
    this.statusText = this.add.text(previewX, previewY + 135, '', {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#44ff44',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Buy button
    const btnX = previewX;
    const btnY = 320;
    this.buyBtnBg = this.add.graphics();
    this.buyBtnText = this.add.text(btnX, btnY, '', {
      fontSize: '14px', fontFamily: 'Arial Black', color: '#000000',
    }).setOrigin(0.5);
    this.buyHit = this.add.rectangle(btnX, btnY, 140, 32, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(100);
    this.buyHit.on('pointerdown', () => this.onBuy());
    this.buyHit.setVisible(false);

    // Instruction text
    this.add.text(120, 375, 'Type Mario, Sonic, Goku, etc.', {
      fontSize: '8px', fontFamily: 'Arial', color: '#666666',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private createSearchInput(cx: number, cy: number): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type character name...';
    input.style.cssText = `
      position: fixed; z-index: 9999;
      width: 180px; height: 24px;
      font: 13px Arial; color: #ffffff;
      background: #1a1a2e; border: 2px solid #44aaff;
      border-radius: 6px; padding: 2px 8px;
      outline: none; text-align: center;
    `;
    document.body.appendChild(input);
    this.searchInput = input;
    this.positionSearchInput(cx, cy);

    input.addEventListener('input', () => {
      this.onSearch(input.value);
    });

    window.addEventListener('resize', () => this.positionSearchInput(cx, cy));
    setTimeout(() => input.focus(), 100);
  }

  private positionSearchInput(cx: number, cy: number): void {
    if (!this.searchInput) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / GAME_WIDTH;
    const sy = rect.height / GAME_HEIGHT;
    this.searchInput.style.left = `${rect.left + cx * sx - 90 * sx}px`;
    this.searchInput.style.top = `${rect.top + cy * sy - 12 * sy}px`;
    this.searchInput.style.width = `${180 * sx}px`;
    this.searchInput.style.height = `${24 * sy}px`;
    this.searchInput.style.fontSize = `${13 * Math.min(sx, sy)}px`;
  }

  private removeSearchInput(): void {
    if (this.searchInput && this.searchInput.parentNode) {
      this.searchInput.parentNode.removeChild(this.searchInput);
      this.searchInput = null;
    }
  }

  private onSearch(query: string): void {
    // Clear old results
    this.resultContainer.removeAll(true);

    const q = query.toLowerCase().trim();
    if (q.length < 2) return;

    const purchased = this.getPurchasedIds();

    // Find matches
    const matches = SHOP_CHARACTERS.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const searchMatch = c.searchNames.some(s => s.toLowerCase().includes(q));
      return nameMatch || searchMatch;
    }).slice(0, 8);

    // Draw results
    for (let i = 0; i < matches.length; i++) {
      const c = matches[i];
      const y = i * 30;
      const owned = purchased.includes(c.id);

      const bg = this.add.graphics();
      bg.fillStyle(0x222244, 0.7);
      bg.fillRoundedRect(5, y, 210, 26, 4);
      this.resultContainer.add(bg);

      const name = this.add.text(12, y + 13, c.name, {
        fontSize: '11px', fontFamily: 'Arial Black', color: '#ffffff',
      }).setOrigin(0, 0.5);
      this.resultContainer.add(name);

      const priceLabel = owned ? 'OWNED' : `${c.price}`;
      const priceColor = owned ? '#44ff44' : '#ffdd00';
      const price = this.add.text(205, y + 13, priceLabel, {
        fontSize: '10px', fontFamily: 'Arial Black', color: priceColor,
      }).setOrigin(1, 0.5);
      this.resultContainer.add(price);

      const hit = this.add.rectangle(110, y + 13, 210, 26, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.selectCharacter(c));
      this.resultContainer.add(hit);
    }

    if (matches.length === 0) {
      const noResult = this.add.text(110, 15, 'No characters found', {
        fontSize: '10px', fontFamily: 'Arial', color: '#666666',
      }).setOrigin(0.5);
      this.resultContainer.add(noResult);
    }
  }

  private selectCharacter(char: ShopCharacter): void {
    this.selectedChar = char;
    this.statusText.setText('');

    // Generate 3D preview with painted details
    const canvas = this.renderShopPortrait(char);

    if (this.textures.exists(this.previewTexKey)) {
      this.textures.remove(this.previewTexKey);
    }
    this.textures.addCanvas(this.previewTexKey, canvas);
    this.previewImage.setTexture(this.previewTexKey).setVisible(true);

    this.previewName.setText(char.name);

    const purchased = this.getPurchasedIds();
    const owned = purchased.includes(char.id);

    if (owned) {
      this.priceText.setText('ALREADY OWNED');
      this.priceText.setColor('#44ff44');
      this.drawBuyButton(false, '');
    } else {
      this.priceText.setText(`${char.price} coins`);
      this.priceText.setColor('#ffdd00');
      const canAfford = getCoins() >= char.price;
      this.drawBuyButton(true, canAfford ? `BUY - ${char.price}` : 'NOT ENOUGH COINS');
      this.buyBtnText.setColor(canAfford ? '#000000' : '#aa4444');
    }
  }

  private drawBuyButton(visible: boolean, label: string): void {
    this.buyBtnBg.clear();
    this.buyHit.setVisible(visible);
    this.buyBtnText.setText(label);
    if (!visible) return;

    const btnX = 340;
    const btnY = 320;
    const canAfford = this.selectedChar ? getCoins() >= this.selectedChar.price : false;

    if (canAfford) {
      this.buyBtnBg.fillStyle(0x000000, 0.3);
      this.buyBtnBg.fillRoundedRect(btnX - 62, btnY - 14, 124, 30, 8);
      this.buyBtnBg.fillStyle(0xffcc00);
      this.buyBtnBg.fillRoundedRect(btnX - 60, btnY - 13, 120, 28, 6);
      this.buyBtnBg.fillStyle(0xffdd44, 0.5);
      this.buyBtnBg.fillRoundedRect(btnX - 56, btnY - 11, 112, 12, 4);
    } else {
      this.buyBtnBg.fillStyle(0x444444, 0.5);
      this.buyBtnBg.fillRoundedRect(btnX - 62, btnY - 14, 124, 30, 8);
    }
  }

  private onBuy(): void {
    if (!this.selectedChar) return;
    const char = this.selectedChar;
    const purchased = this.getPurchasedIds();
    if (purchased.includes(char.id)) return;
    if (!spendCoins(char.price)) {
      this.statusText.setText('Not enough coins!');
      this.statusText.setColor('#ff4444');
      return;
    }

    // Generate portrait texture with pixel art
    const canvas = this.render3DPortrait(
      char.skinColor, char.hairColor, char.shirtColor, char.pantsColor, char.hatColor, char.id
    );
    const texKey = `char-shop-${char.id}`;
    if (!this.textures.exists(texKey)) {
      this.textures.addCanvas(texKey, canvas);
    }

    // Add to CHARACTERS array
    CHARACTERS.push({ key: texKey, name: char.name, gender: char.gender });

    // Save to localStorage (same format as custom characters)
    const customSave = {
      key: texKey,
      name: char.name,
      gender: char.gender,
      skinColor: char.skinColor,
      hairColor: char.hairColor,
      shirtColor: char.shirtColor,
      pantsColor: char.pantsColor,
      hatColor: char.hatColor,
    };
    try {
      const saved = JSON.parse(localStorage.getItem('customCharacters') || '[]');
      saved.push(customSave);
      localStorage.setItem('customCharacters', JSON.stringify(saved));
    } catch { /* ignore */ }

    // Mark as purchased
    purchased.push(char.id);
    localStorage.setItem(PURCHASED_KEY, JSON.stringify(purchased));

    // Update UI
    this.coinText.setText(`${getCoins()} coins`);
    this.statusText.setText('PURCHASED!');
    this.statusText.setColor('#44ff44');
    this.priceText.setText('ALREADY OWNED');
    this.priceText.setColor('#44ff44');
    this.drawBuyButton(false, '');

    // Refresh search results
    if (this.searchInput) this.onSearch(this.searchInput.value);
  }

  private getPurchasedIds(): string[] {
    try {
      return JSON.parse(localStorage.getItem(PURCHASED_KEY) || '[]');
    } catch { return []; }
  }

  private render3DPortrait(skin: number, hair: number, shirt: number, pants: number, hatColor: number = -1, charId?: string): HTMLCanvasElement {
    const S = 1024;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(S, S);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.3, 3.2);
    camera.lookAt(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0x667788, 0.6));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0x8899cc, 0.4).translateX(-2).translateY(3));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(2, 32), new THREE.MeshStandardMaterial({ color: 0x3a5a2a }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Get pixel textures if available
    const pixTex = charId ? getCharacterTextures(charId) : null;

    // Smooth materials — no pixel textures
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.5, metalness: 0.05 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.1 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
    const armLMat = shirtMat;
    const armRMat = shirtMat;
    const legLMat = pantsMat;
    const legRMat = pantsMat;
    const headMat = skinMat;

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 })));

    const torso = new THREE.Group();
    torso.position.y = 0.05;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtMat);
    chest.position.y = 0.3;
    chest.castShadow = true;
    torso.add(chest);
    torso.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat).translateY(0.6));

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.72;
    torso.add(headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), headMat);
    head.scale.set(1, 1.1, 0.95);
    headGroup.add(head);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    for (const side of [-1, 1]) {
      headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), whiteMat).translateX(side * 0.07).translateY(0.04).translateZ(0.16));
      headGroup.add(new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a3a })).translateX(side * 0.07).translateY(0.04).translateZ(0.199));
      headGroup.add(new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), new THREE.MeshStandardMaterial({ color: 0x111111 })).translateX(side * 0.07).translateY(0.04).translateZ(0.2));
      headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), skinMat).translateX(side * 0.2).translateY(0.02));
    }
    headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), skinMat).translateY(-0.01).translateZ(0.19));
    headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.01), new THREE.MeshStandardMaterial({ color: 0xcc5555 })).translateY(-0.07).translateZ(0.18));

    if (hatColor === -1) {
      const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      hairMesh.position.y = 0.04;
      headGroup.add(hairMesh);
    } else {
      const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7 });
      const capDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
        hatMat
      );
      capDome.position.y = 0.04;
      headGroup.add(capDome);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 0.015, 10, 1, false, -Math.PI * 0.5, Math.PI),
        hatMat
      );
      brim.position.set(0, 0.1, 0.18);
      brim.rotation.x = -0.3;
      headGroup.add(brim);
    }

    let sideIdx = 0;
    for (const side of [-1, 1]) {
      const armMat = sideIdx === 0 ? armLMat : armRMat;
      const upper = new THREE.Group();
      upper.position.set(side * 0.3, 0.48, 0);
      torso.add(upper);
      const ua = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), armMat);
      ua.position.y = -0.14;
      upper.add(ua);
      const forearm = new THREE.Group();
      forearm.position.y = -0.28;
      upper.add(forearm);
      const fa = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), armMat);
      fa.position.y = -0.12;
      forearm.add(fa);
      forearm.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), armMat).translateY(-0.27));
      sideIdx++;
    }

    let legIdx = 0;
    for (const side of [-1, 1]) {
      const legMat = legIdx === 0 ? legLMat : legRMat;
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.12, 0, 0);
      hips.add(thigh);
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), legMat);
      th.position.y = -0.2;
      thigh.add(th);
      const shin = new THREE.Group();
      shin.position.y = -0.38;
      thigh.add(shin);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), legMat);
      sh.position.y = -0.16;
      shin.add(sh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoeMat);
      shoe.position.set(0, -0.34, 0.04);
      shin.add(shoe);
      legIdx++;
    }

    root.rotation.y = 0.25;
    scene.add(root);
    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx2d = canvas.getContext('2d')!;
    ctx2d.drawImage(renderer.domElement, 0, 0);
    renderer.dispose();
    return canvas;
  }

  private renderShopPortrait(char: ShopCharacter): HTMLCanvasElement {
    return this.render3DPortrait(
      char.skinColor, char.hairColor, char.shirtColor, char.pantsColor, char.hatColor, char.id
    );
  }

  shutdown(): void {
    this.removeSearchInput();
  }
}
