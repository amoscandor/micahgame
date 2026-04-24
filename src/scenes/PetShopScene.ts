import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getCoins, spendCoins } from '../utils/coinStore';

interface Pet {
  name: string;
  price: number;
  color: number;
  type: string; // 'dog' | 'cat' | 'bird' | 'dragon'
}

const PETS: Pet[] = [
  { name: 'Dog', price: 50, color: 0xc8a050, type: 'dog' },
  { name: 'Cat', price: 50, color: 0x888888, type: 'cat' },
  { name: 'Bird', price: 75, color: 0x44aaff, type: 'bird' },
  { name: 'Rabbit', price: 60, color: 0xeeeeee, type: 'rabbit' },
  { name: 'Fox', price: 100, color: 0xe06020, type: 'fox' },
  { name: 'Hamster', price: 40, color: 0xddaa66, type: 'hamster' },
  { name: 'Penguin', price: 80, color: 0x1a1a1a, type: 'penguin' },
  { name: 'Turtle', price: 60, color: 0x2a6e2a, type: 'turtle' },
  { name: 'Snake', price: 90, color: 0x44aa22, type: 'snake' },
  { name: 'Dragon', price: 200, color: 0xcc2222, type: 'dragon' },
];

const STORAGE_KEY = 'fw-pets-owned';
const EQUIPPED_KEY = 'fw-pets-equipped'; // now stores JSON array

function getOwnedPets(): string[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function addOwnedPet(type: string): void {
  const owned = getOwnedPets();
  if (!owned.includes(type)) {
    owned.push(type);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(owned));
  }
}

const MAX_EQUIPPED = 3;

export function getEquippedPets(): string[] {
  try {
    const stored = localStorage.getItem(EQUIPPED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
    // Migrate old single-pet key
    const old = localStorage.getItem('fw-pet-equipped');
    if (old) {
      const arr = [old];
      localStorage.setItem(EQUIPPED_KEY, JSON.stringify(arr));
      localStorage.removeItem('fw-pet-equipped');
      return arr;
    }
  } catch (_e) { /* ignore */ }
  return [];
}

// Keep old export name working for BattleScene import
export function getEquippedPet(): string | null {
  const pets = getEquippedPets();
  return pets[0] || null;
}

function setEquippedPets(types: string[]): void {
  localStorage.setItem(EQUIPPED_KEY, JSON.stringify(types.slice(0, MAX_EQUIPPED)));
}

function toggleEquippedPet(type: string): void {
  const equipped = getEquippedPets();
  const idx = equipped.indexOf(type);
  if (idx >= 0) {
    equipped.splice(idx, 1);
  } else if (equipped.length < MAX_EQUIPPED) {
    equipped.push(type);
  }
  setEquippedPets(equipped);
}

export class PetShopScene extends Phaser.Scene {
  private coinText!: Phaser.GameObjects.Text;
  private gpPrev: Record<string, boolean> = {};

  constructor() {
    super({ key: 'PetShopScene' });
  }

  update(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;
      const back = !!gp.buttons[1]?.pressed;
      const prev = !!this.gpPrev['back'];
      this.gpPrev['back'] = back;
      if (back && !prev) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.time.delayedCall(200, () => this.scene.start('ShopHubScene'));
      }
      break;
    }
  }

  create(): void {
    // Background — same as other shop scenes
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);

    // Title
    this.add.text(GAME_WIDTH / 2, 30, 'PET SHOP', {
      fontSize: '22px', fontFamily: 'Arial Black, sans-serif',
      color: '#44ff88', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Coins
    this.coinText = this.add.text(GAME_WIDTH - 10, 20, `${getCoins()} coins`, {
      fontSize: '12px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0.5);

    // Back button
    this.add.text(30, 18, '\u2190 BACK', {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.scene.start('ShopHubScene');
      });

    const owned = getOwnedPets();
    const equippedList = getEquippedPets();

    // Slots indicator
    this.add.text(GAME_WIDTH / 2, 52, `Pets equipped: ${equippedList.length}/${MAX_EQUIPPED}`, {
      fontSize: '11px', fontFamily: 'Arial Black', color: '#aaaaaa',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    const cardW = 120;
    const cardH = 150;
    const gap = 10;
    const cols = 5;
    const rows = Math.ceil(PETS.length / cols);
    const totalW = cols * cardW + (cols - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const totalH = rows * cardH + (rows - 1) * gap;
    const startY = (GAME_HEIGHT - totalH) / 2 + cardH / 2 + 20;

    PETS.forEach((pet, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap);
      const cardY = startY + row * (cardH + gap);
      const isOwned = owned.includes(pet.type);
      const isEquipped = equippedList.includes(pet.type);

      // Card background
      const g = this.add.graphics();
      g.fillStyle(isEquipped ? 0x225533 : 0x222244, 1);
      g.fillRoundedRect(cx - cardW / 2, cardY - cardH / 2, cardW, cardH, 8);
      g.lineStyle(2, isEquipped ? 0x44ff88 : 0x444466);
      g.strokeRoundedRect(cx - cardW / 2, cardY - cardH / 2, cardW, cardH, 8);

      // Equipped slot number badge
      if (isEquipped) {
        const slotNum = equippedList.indexOf(pet.type) + 1;
        const badge = this.add.graphics();
        badge.fillStyle(0x44ff88);
        badge.fillCircle(cx + cardW / 2 - 12, cardY - cardH / 2 + 12, 10);
        this.add.text(cx + cardW / 2 - 12, cardY - cardH / 2 + 12, `${slotNum}`, {
          fontSize: '11px', fontFamily: 'Arial Black', color: '#000000',
        }).setOrigin(0.5);
      }

      // Pet preview — render actual 3D model
      const texKey = `pet-preview-${pet.type}`;
      if (!this.textures.exists(texKey)) {
        this.renderPetPreview(pet.type, texKey);
      }
      this.add.image(cx, cardY - 25, texKey).setDisplaySize(90, 75);

      // Name
      this.add.text(cx, cardY + 20, pet.name, {
        fontSize: '14px', fontFamily: 'Arial Black', color: '#ffffff',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);

      // Price or status
      let btnText = `${pet.price} coins`;
      let btnColor = 0x4488ff;
      if (isEquipped) {
        btnText = 'UNEQUIP';
        btnColor = 0xff6644;
      } else if (isOwned && equippedList.length < MAX_EQUIPPED) {
        btnText = 'EQUIP';
        btnColor = 0x22aa44;
      } else if (isOwned) {
        btnText = 'FULL (3/3)';
        btnColor = 0x666666;
      }

      const btnW = 95;
      const btnH = 26;
      const btnY = cardY + 50;
      const bg2 = this.add.graphics();
      bg2.fillStyle(btnColor);
      bg2.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);

      this.add.text(cx, btnY, btnText, {
        fontSize: '10px', fontFamily: 'Arial Black', color: '#ffffff',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);

      this.add.rectangle(cx, btnY, btnW, btnH, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (isEquipped) {
            toggleEquippedPet(pet.type);
            this.scene.restart();
          } else if (isOwned) {
            if (equippedList.length < MAX_EQUIPPED) {
              toggleEquippedPet(pet.type);
              this.scene.restart();
            }
          } else {
            // Buy
            if (spendCoins(pet.price)) {
              addOwnedPet(pet.type);
              if (equippedList.length < MAX_EQUIPPED) {
                toggleEquippedPet(pet.type);
              }
              this.scene.restart();
            } else {
              const warn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Not enough coins!', {
                fontSize: '12px', fontFamily: 'Arial Black', color: '#ff4444',
                stroke: '#000', strokeThickness: 2,
              }).setOrigin(0.5);
              this.time.delayedCall(1500, () => warn.destroy());
            }
          }
        });
    });

    // Remove all pets button at bottom
    if (equippedList.length > 0) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'REMOVE ALL PETS', {
        fontSize: '11px', fontFamily: 'Arial Black', color: '#ff6666',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          setEquippedPets([]);
          this.scene.restart();
        });
    }

    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private renderPetPreview(type: string, texKey: string): void {
    const w = 200, h = 160;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
    cam.position.set(0, 0.3, 1.6);
    cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    const pet = this.buildPetMesh(type);
    // Rotate to show from side/front
    pet.rotation.y = -0.6;
    scene.add(pet);

    renderer.render(scene, cam);
    // Copy to canvas so Phaser can use it
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    this.textures.addCanvas(texKey, canvas);
    renderer.dispose();
  }

  private buildPetMesh(petType: string): THREE.Group {
    const pet = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });

    if (petType === 'dog') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.8 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.5), mat));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.25), mat);
      head.position.set(0, 0.08, 0.35); pet.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), mat);
      snout.position.set(0, 0.0, 0.5); pet.add(snout);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), darkMat);
      nose.position.set(0, 0.02, 0.56); pet.add(nose);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat);
        ear.position.set(s * 0.12, 0.1, 0.3); ear.rotation.z = s * 0.3; pet.add(ear);
      }
      for (const s of [-1, 1]) for (const fb of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.07), mat);
        leg.position.set(s * 0.12, -0.22, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), mat);
      tail.position.set(0, 0.15, -0.28); tail.rotation.x = 0.5; pet.add(tail);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
        eye.position.set(s * 0.07, 0.12, 0.47); pet.add(eye);
      }
    } else if (petType === 'cat') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.45), mat));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), mat);
      head.position.set(0, 0.06, 0.3); pet.add(head);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), mat);
        ear.position.set(s * 0.08, 0.2, 0.3); pet.add(ear);
      }
      for (const s of [-1, 1]) for (const fb of [-0.14, 0.14]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), mat);
        leg.position.set(s * 0.08, -0.19, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.03), mat);
      tail.position.set(0, 0.1, -0.28); tail.rotation.x = 0.7; pet.add(tail);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02),
          new THREE.MeshBasicMaterial({ color: 0x44ff44 }));
        eye.position.set(s * 0.06, 0.1, 0.4); pet.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
      nose.position.set(0, 0.04, 0.4); pet.add(nose);
    } else if (petType === 'bird') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff, roughness: 0.7 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.25), mat));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mat);
      head.position.set(0, 0.1, 0.15); pet.add(head);
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xffaa22 }));
      beak.position.set(0, 0.08, 0.26); pet.add(beak);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.18), mat);
        wing.position.set(s * 0.1, 0.02, -0.02); wing.rotation.z = s * -0.3; pet.add(wing);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), mat);
      tail.position.set(0, 0.02, -0.16); pet.add(tail);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.05, 0.13, 0.22); pet.add(eye);
      }
      for (const s of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xffaa22 }));
        foot.position.set(s * 0.05, -0.11, 0); pet.add(foot);
      }
    } else if (petType === 'dragon') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.7 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.5), mat));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), mat);
      head.position.set(0, 0.08, 0.32); pet.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), mat);
      snout.position.set(0, 0.02, 0.45); pet.add(snout);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03),
          new THREE.MeshStandardMaterial({ color: 0x444444 }));
        horn.position.set(s * 0.08, 0.2, 0.28); horn.rotation.z = s * -0.3; pet.add(horn);
      }
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x991111 }));
        wing.position.set(s * 0.14, 0.12, -0.05); wing.rotation.z = s * -0.4; pet.add(wing);
      }
      for (const s of [-1, 1]) for (const fb of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.06), mat);
        leg.position.set(s * 0.1, -0.18, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), mat);
      tail.position.set(0, -0.04, -0.4); pet.add(tail);
      const spike = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), mat);
      spike.position.set(0, -0.02, -0.58); pet.add(spike);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
        eye.position.set(s * 0.06, 0.12, 0.42); pet.add(eye);
      }
    } else if (petType === 'rabbit') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), mat));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), mat);
      head.position.set(0, 0.1, 0.2); pet.add(head);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), mat);
        ear.position.set(s * 0.06, 0.3, 0.18); ear.rotation.z = s * 0.1; pet.add(ear);
        const earInner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02),
          new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
        earInner.position.set(s * 0.06, 0.3, 0.2); earInner.rotation.z = s * 0.1; pet.add(earInner);
      }
      for (const s of [-1, 1]) {
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), mat);
        fl.position.set(s * 0.08, -0.17, 0.1); pet.add(fl);
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), mat);
        bl.position.set(s * 0.1, -0.18, -0.1); pet.add(bl);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), mat);
      tail.position.set(0, 0.02, -0.18); pet.add(tail);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
        eye.position.set(s * 0.06, 0.13, 0.29); pet.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
      nose.position.set(0, 0.06, 0.29); pet.add(nose);
    } else if (petType === 'turtle') {
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x2a6e2a, roughness: 0.6 });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0x6aaa4a, roughness: 0.8 });
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.4), shellMat);
      shell.position.set(0, 0.04, 0); pet.add(shell);
      const shellTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.32), shellMat);
      shellTop.position.set(0, 0.14, 0); pet.add(shellTop);
      const patternMat = new THREE.MeshStandardMaterial({ color: 0x1a5a1a });
      for (let i = -1; i <= 1; i++) {
        const hex = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), patternMat);
        hex.position.set(i * 0.1, 0.2, 0); pet.add(hex);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), skinMat);
      head.position.set(0, 0.0, 0.26); pet.add(head);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.04, 0.04, 0.33); pet.add(eye);
      }
      for (const s of [-1, 1]) for (const fb of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.08), skinMat);
        leg.position.set(s * 0.16, -0.1, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), skinMat);
      tail.position.set(0, -0.04, -0.22); pet.add(tail);
    } else if (petType === 'fox') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe06020, roughness: 0.8 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.45), mat));
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), whiteMat);
      belly.position.set(0, -0.08, 0.02); pet.add(belly);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), mat);
      head.position.set(0, 0.06, 0.3); pet.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), whiteMat);
      snout.position.set(0, 0.0, 0.42); pet.add(snout);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), darkMat);
      nose.position.set(0, 0.02, 0.49); pet.add(nose);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), mat);
        ear.position.set(s * 0.08, 0.2, 0.28); pet.add(ear);
        const earInner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), darkMat);
        earInner.position.set(s * 0.08, 0.2, 0.3); pet.add(earInner);
      }
      for (const s of [-1, 1]) for (const fb of [-0.14, 0.14]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), mat);
        leg.position.set(s * 0.1, -0.19, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.25), mat);
      tail.position.set(0, 0.08, -0.32); tail.rotation.x = 0.6; pet.add(tail);
      const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), whiteMat);
      tailTip.position.set(0, 0.18, -0.42); pet.add(tailTip);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.06, 0.1, 0.4); pet.add(eye);
      }
    } else if (petType === 'penguin') {
      const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
      const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff8822 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), blackMat));
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.02), whiteMat);
      belly.position.set(0, -0.01, 0.1); pet.add(belly);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), blackMat);
      head.position.set(0, 0.2, 0); pet.add(head);
      for (const s of [-1, 1]) {
        const patch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), whiteMat);
        patch.position.set(s * 0.05, 0.22, 0.09); pet.add(patch);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.05, 0.22, 0.1); pet.add(eye);
      }
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), orangeMat);
      beak.position.set(0, 0.16, 0.11); pet.add(beak);
      for (const s of [-1, 1]) {
        const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.1), blackMat);
        flipper.position.set(s * 0.12, 0.0, 0); flipper.rotation.z = s * 0.2; pet.add(flipper);
      }
      for (const s of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.1), orangeMat);
        foot.position.set(s * 0.06, -0.17, 0.03); pet.add(foot);
      }
    } else if (petType === 'hamster') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xddaa66, roughness: 0.9 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.9 });
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), mat));
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), whiteMat);
      belly.position.set(0, -0.05, 0.02); pet.add(belly);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.16), mat);
      head.position.set(0, 0.1, 0.14); pet.add(head);
      for (const s of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), whiteMat);
        cheek.position.set(s * 0.1, 0.06, 0.16); pet.add(cheek);
      }
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.03), mat);
        ear.position.set(s * 0.08, 0.22, 0.12); pet.add(ear);
      }
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
        eye.position.set(s * 0.05, 0.13, 0.22); pet.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
      nose.position.set(0, 0.08, 0.22); pet.add(nose);
      for (const s of [-1, 1]) for (const fb of [-0.06, 0.06]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), mat);
        leg.position.set(s * 0.08, -0.12, fb); pet.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat);
      tail.position.set(0, 0.0, -0.12); pet.add(tail);
    } else if (petType === 'snake') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x44aa22, roughness: 0.6 });
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xaacc44 });
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat);
        seg.position.set(Math.sin(i * 0.4) * 0.06, 0, -i * 0.09);
        pet.add(seg);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), mat);
      head.position.set(0, 0.02, 0.1); pet.add(head);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        eye.position.set(s * 0.04, 0.06, 0.16); pet.add(eye);
      }
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xff2222 }));
      tongue.position.set(0, 0.0, 0.2); pet.add(tongue);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.5), bellyMat);
      stripe.position.set(0, -0.04, -0.15); pet.add(stripe);
    }

    pet.scale.set(0.8, 0.8, 0.8);
    return pet;
  }
}
