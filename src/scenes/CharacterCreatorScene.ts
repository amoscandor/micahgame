import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { CHARACTERS, CharacterData } from './CharacterSelectScene';

// Gradient stops for color bars
const SKIN_GRADIENT = [0xf8e8d8, 0xf0dcc8, 0xe0c0a0, 0xc49a6c, 0xba8860, 0x8a5a3a, 0x6a4428, 0x3a2010];
const HAIR_GRADIENT = [0xf8f0e0, 0xe8b800, 0xcc6600, 0x8a5530, 0x6a4a2a, 0x4a3020, 0x1a0e0e, 0x2244aa, 0xcc2200, 0x666666];
const SHIRT_GRADIENT = [0xff0000, 0xff6600, 0xffcc00, 0x44cc44, 0x2266cc, 0x4444dd, 0xaa00aa, 0xff69b4, 0xf8f8f8, 0x1a1a2e];
const PANTS_GRADIENT = [0xf0f0f0, 0x8888aa, 0x2a3a6a, 0x4a3300, 0x3a3a3a, 0x1a1a1a, 0x0e3a0e, 0x551800];
// Hat colors: -1 = no hat, rest are hat colors
const HAT_OPTIONS = [-1, 0xcc3300, 0x2266cc, 0x1a1a1a, 0xf8f8f8, 0x7a5500, 0x4a5a2a, 0xffcc00, 0xff69b4, 0xaa00aa];

/** Linearly interpolate between gradient stops based on t (0..1) */
function sampleGradient(stops: number[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const seg = clamped * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const c0 = stops[Math.min(i, stops.length - 1)];
  const c1 = stops[Math.min(i + 1, stops.length - 1)];
  const r = ((c0 >> 16) & 0xff) + (((c1 >> 16) & 0xff) - ((c0 >> 16) & 0xff)) * f;
  const g = ((c0 >> 8) & 0xff) + (((c1 >> 8) & 0xff) - ((c0 >> 8) & 0xff)) * f;
  const b = (c0 & 0xff) + ((c1 & 0xff) - (c0 & 0xff)) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

interface CustomSave {
  key: string;
  name: string;
  gender: 'boy' | 'girl';
  skinColor: number;
  hairColor: number;
  shirtColor: number;
  pantsColor: number;
  hatColor: number; // -1 = no hat
  shirtLabel?: string; // base64 data URL for custom shirt image
  shirtBrand?: string; // brand name like NIKE, ADEDAS etc
}

export class CharacterCreatorScene extends Phaser.Scene {
  // Direct hex color values (not indices)
  private skinColor: number = SKIN_GRADIENT[1];
  private hairColor: number = HAIR_GRADIENT[4];
  private shirtColor: number = SHIRT_GRADIENT[4];
  private pantsColor: number = PANTS_GRADIENT[5];
  private selectedHat: number = 0; // 0 = no hat (index into HAT_OPTIONS)

  // Slider t values (0..1)
  private skinT = 0.14;
  private hairT = 0.44;
  private shirtT = 0.44;
  private pantsT = 0.71;

  private hatSwatches: Phaser.GameObjects.Graphics[] = [];

  private shirtLabelDataUrl: string | null = null; // uploaded image
  private shirtLabelPlane: THREE.Mesh | null = null; // 3D plane on chest
  private selectedBrand: string | null = null; // selected brand name
  private brandLabelMesh: THREE.Mesh | null = null; // brand label on preview
  private fileInput: HTMLInputElement | null = null;

  private nameInput: HTMLInputElement | null = null;
  private scrollContainer!: Phaser.GameObjects.Container;

  // 3D preview
  private previewRenderer!: THREE.WebGLRenderer;
  private previewScene!: THREE.Scene;
  private previewCamera!: THREE.PerspectiveCamera;
  private previewRoot!: THREE.Group;
  private previewImage!: Phaser.GameObjects.Image;
  private previewTexKey = '__creator_preview__';
  private previewRotation = 0;
  private previewAnimFrame = 0;
  // Material refs for live color updates
  private pShirtMat!: THREE.MeshStandardMaterial;
  private pSkinMat!: THREE.MeshStandardMaterial;
  private pPantsMat!: THREE.MeshStandardMaterial;
  private pHairMat!: THREE.MeshStandardMaterial;
  private pHatMat!: THREE.MeshStandardMaterial;
  private previewHatGroup!: THREE.Group; // contains hat meshes, swapped on change
  private previewHairMesh!: THREE.Mesh; // hair mesh, hidden when hat is on

  constructor() {
    super({ key: 'CharacterCreatorScene' });
  }

  create(): void {
    // Load saved custom characters
    this.loadCustomCharacters();

    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);

    // Title
    this.add.text(GAME_WIDTH / 2, 20, 'CREATE YOUR CHARACTER', {
      fontSize: '16px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Back button
    const backBtn = this.add.text(30, 18, '\u2190 BACK', {
      fontSize: '12px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => {
        backBtn.setColor('#ffffff');
      })
      .on('pointerout', () => {
        backBtn.setColor('#888888');
      })
      .on('pointerdown', () => {
        this.removeNameInput();
        this.scene.start('CharacterSelectScene');
      });

    // --- LAYOUT: Preview on left, options on right, name+done at bottom ---
    // 3D Preview (top-left)
    const previewX = 80;
    const previewY = 100;

    const previewPanel = this.add.graphics();
    previewPanel.fillStyle(0x151525, 0.8);
    previewPanel.fillRoundedRect(previewX - 12, previewY - 12, 24, 24, 4);

    this.setup3DPreview();
    this.render3DPreview();
    this.previewImage = this.add.image(previewX, previewY, this.previewTexKey)
      .setDisplaySize(10, 10).setDepth(10);

    this.time.addEvent({
      delay: 40, loop: true,
      callback: () => {
        this.previewRotation += 0.02;
        this.previewAnimFrame += 0.08;
        this.render3DPreview();
        if (this.textures.exists(this.previewTexKey)) this.textures.remove(this.previewTexKey);
        const canvas = this.previewRenderer.domElement;
        const copy = document.createElement('canvas');
        copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext('2d')!.drawImage(canvas, 0, 0);
        this.textures.addCanvas(this.previewTexKey, copy);
        this.previewImage.setTexture(this.previewTexKey);
      },
    });

    this.add.text(previewX, previewY + 56, 'DRAG TO ROTATE', {
      fontSize: '7px', fontFamily: 'Arial Black, sans-serif', color: '#666666',
    }).setOrigin(0.5);

    this.previewImage.setInteractive({ draggable: true });
    this.previewImage.on('drag', (_pointer: any, dragX: number) => {
      this.previewRotation += dragX * 0.002;
    });

    // --- NAME INPUT below preview ---
    this.add.text(previewX, previewY + 70, 'NAME', {
      fontSize: '8px', fontFamily: 'Arial Black, sans-serif', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.createNameInput(previewX, previewY + 86);

    // --- DONE button below name ---
    const btnX = previewX;
    const btnY = previewY + 118;

    const doneBtnBg = this.add.graphics();
    doneBtnBg.fillStyle(0x000000, 0.3);
    doneBtnBg.fillRoundedRect(btnX - 52, btnY - 12, 104, 26, 8);
    doneBtnBg.fillStyle(0xffcc00);
    doneBtnBg.fillRoundedRect(btnX - 50, btnY - 11, 100, 24, 6);
    doneBtnBg.fillStyle(0xffdd44, 0.5);
    doneBtnBg.fillRoundedRect(btnX - 46, btnY - 9, 92, 10, 4);

    this.add.text(btnX, btnY, 'DONE', {
      fontSize: '12px', fontFamily: 'Arial Black, sans-serif', color: '#000000',
    }).setOrigin(0.5);

    this.add.rectangle(btnX, btnY, 110, 30, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onDone());

    // --- OPTIONS (right side, no scroll, all visible) ---
    const optionsX = 155;
    const optionsStartY = 36;

    const optionsBg = this.add.graphics();
    optionsBg.fillStyle(0x151525, 0.7);
    optionsBg.fillRoundedRect(optionsX, optionsStartY, GAME_WIDTH - optionsX - 8, GAME_HEIGHT - optionsStartY - 8, 8);

    // No scroll - just a plain container
    this.scrollContainer = this.add.container(0, 0);

    let rowY = optionsStartY + 12;
    const labelX = optionsX + 8;
    const barStartX = optionsX + 52;
    const barWidth = GAME_WIDTH - barStartX - 20;

    // --- SKIN ---
    rowY = this.addColorBar('SKIN', SKIN_GRADIENT, labelX, barStartX, rowY, barWidth,
      this.skinT, (t: number) => {
        this.skinT = t;
        this.skinColor = sampleGradient(SKIN_GRADIENT, t);
        this.updatePreviewColors();
      });

    // --- HAIR ---
    rowY = this.addColorBar('HAIR', HAIR_GRADIENT, labelX, barStartX, rowY, barWidth,
      this.hairT, (t: number) => {
        this.hairT = t;
        this.hairColor = sampleGradient(HAIR_GRADIENT, t);
        this.updatePreviewColors();
      });

    // --- SHIRT ---
    rowY = this.addColorBar('SHIRT', SHIRT_GRADIENT, labelX, barStartX, rowY, barWidth,
      this.shirtT, (t: number) => {
        this.shirtT = t;
        this.shirtColor = sampleGradient(SHIRT_GRADIENT, t);
        this.updatePreviewColors();
      });

    // --- PANTS ---
    rowY = this.addColorBar('PANTS', PANTS_GRADIENT, labelX, barStartX, rowY, barWidth,
      this.pantsT, (t: number) => {
        this.pantsT = t;
        this.pantsColor = sampleGradient(PANTS_GRADIENT, t);
        this.updatePreviewColors();
      });

    // --- HAT ---
    const swatchStartX = barStartX;
    const swatchGap = 22;
    rowY = this.addHatRow(labelX, swatchStartX, rowY, swatchGap);

    // --- SHIRT LOGO ---
    rowY += 4;
    this.add.text(labelX, rowY, 'LOGO', {
      fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#aaaaaa',
    }).setDepth(20);

    const logoOptions = ['NONE', 'NIKE', 'ADEDAS', 'POMA', 'REBOK', 'FILA', 'GUCI', 'ZARA', 'GAP', 'CHAMP', '📷'];
    const logoGap = 90;
    const logoStartX = barStartX;
    const logoY = rowY;
    const btnW = 80;
    const btnH = 32;

    for (let li = 0; li < logoOptions.length; li++) {
      const lx = logoStartX + (li % 4) * logoGap;
      const ly = logoY + Math.floor(li / 4) * 38;
      const brand = logoOptions[li];
      const isUpload = brand === '📷';
      const isNone = brand === 'NONE';

      const bg = this.add.graphics().setDepth(20);
      bg.fillStyle(isUpload ? 0x4488ff : isNone ? 0x444444 : 0xffffff, 0.9);
      bg.fillRoundedRect(lx, ly - 14, btnW, btnH, 6);
      if (!isNone && !isUpload) {
        this.add.text(lx + btnW / 2, ly + 2, brand, {
          fontSize: '14px', fontFamily: 'Arial Black, sans-serif', color: '#000000',
        }).setOrigin(0.5).setDepth(21);
      } else {
        this.add.text(lx + btnW / 2, ly + 2, isUpload ? 'UPLOAD' : 'NONE', {
          fontSize: '14px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff',
        }).setOrigin(0.5).setDepth(21);
      }

      if (isUpload) {
        this.createFileInputOverlay(lx, ly - 14, btnW, btnH);
      }

      this.add.rectangle(lx + btnW / 2, ly + 2, btnW, btnH, 0x000000, 0)
        .setDepth(22)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (isUpload) {
            // handled by HTML overlay
          } else if (isNone) {
            this.selectedBrand = null;
            this.clearShirtLabel();
            this.updateBrandOnPreview();
          } else {
            this.selectedBrand = brand;
            this.clearShirtLabel();
            this.updateBrandOnPreview();
          }
        });
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  private addColorBar(
    label: string,
    gradient: number[],
    labelX: number,
    barX: number,
    rowY: number,
    barWidth: number,
    initialT: number,
    onChange: (t: number) => void,
  ): number {
    const rowLabel = this.add.text(labelX, rowY, label, {
      fontSize: '9px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#aaaaaa',
    });
    this.scrollContainer.add(rowLabel);

    const barY = rowY;
    const barH = 12;
    const segments = 64;

    // Draw gradient bar
    const barGfx = this.add.graphics();
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const col = sampleGradient(gradient, t);
      const sx = barX + t * barWidth;
      const sw = barWidth / segments + 1;
      barGfx.fillStyle(col, 1);
      barGfx.fillRect(sx, barY - barH / 2, sw, barH);
    }
    // Border
    barGfx.lineStyle(1, 0x555555, 1);
    barGfx.strokeRoundedRect(barX - 1, barY - barH / 2 - 1, barWidth + 2, barH + 2, 3);
    this.scrollContainer.add(barGfx);

    // Slider handle (white triangle/diamond)
    const handle = this.add.graphics();
    const drawHandle = (t: number) => {
      handle.clear();
      const hx = barX + t * barWidth;
      // Draw a white circle handle with black outline
      handle.fillStyle(0xffffff, 1);
      handle.fillCircle(hx, barY, 7);
      handle.lineStyle(2, 0x000000, 1);
      handle.strokeCircle(hx, barY, 7);
      const col = sampleGradient(gradient, t);
      handle.fillStyle(col, 1);
      handle.fillCircle(hx, barY, 4);
    };
    drawHandle(initialT);
    this.scrollContainer.add(handle);

    // Invisible hit area for dragging
    const hitZone = this.add.rectangle(barX + barWidth / 2, barY, barWidth + 20, barH + 16, 0x000000, 0)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.scrollContainer.add(hitZone);

    const updateFromPointer = (px: number) => {
      const localX = px - barX;
      const t = Math.max(0, Math.min(1, localX / barWidth));
      drawHandle(t);
      onChange(t);
    };

    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      updateFromPointer(pointer.x);
    });
    hitZone.on('drag', (pointer: Phaser.Input.Pointer) => {
      updateFromPointer(pointer.x);
    });

    return rowY + 22;
  }

  private addHatRow(labelX: number, swatchStartX: number, rowY: number, swatchGap: number): number {
    const rowLabel = this.add.text(labelX, rowY, 'HAT', {
      fontSize: '9px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#aaaaaa',
    });
    this.scrollContainer.add(rowLabel);

    const swatchY = rowY + 1;

    for (let i = 0; i < HAT_OPTIONS.length; i++) {
      const sx = swatchStartX + i * swatchGap;
      const g = this.add.graphics();
      g.setData('cx', sx);
      g.setData('cy', swatchY);

      if (HAT_OPTIONS[i] === -1) {
        g.fillStyle(0x333333, 1);
        g.fillCircle(sx, swatchY, 8);
        g.lineStyle(2, 0xff4444, 1);
        g.lineBetween(sx - 4, swatchY - 4, sx + 4, swatchY + 4);
        g.lineBetween(sx - 4, swatchY + 4, sx + 4, swatchY - 4);
      } else {
        g.fillStyle(HAT_OPTIONS[i], 1);
        g.fillCircle(sx, swatchY, 8);
      }

      if (i === this.selectedHat) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeCircle(sx, swatchY, 9);
      }

      const hit = this.add.rectangle(sx, swatchY, 18, 18, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selectedHat = i;
        this.rebuildHatSwatches();
        this.updatePreviewColors();
      });

      this.scrollContainer.add([g, hit]);
      this.hatSwatches.push(g);
    }

    return rowY + 22;
  }

  private rebuildHatSwatches(): void {
    for (let i = 0; i < this.hatSwatches.length; i++) {
      const g = this.hatSwatches[i];
      const cx = g.getData('cx') as number;
      const cy = g.getData('cy') as number;
      g.clear();

      if (HAT_OPTIONS[i] === -1) {
        g.fillStyle(0x333333, 1);
        g.fillCircle(cx, cy, 8);
        g.lineStyle(2, 0xff4444, 1);
        g.lineBetween(cx - 4, cy - 4, cx + 4, cy + 4);
        g.lineBetween(cx - 4, cy + 4, cx + 4, cy - 4);
      } else {
        g.fillStyle(HAT_OPTIONS[i], 1);
        g.fillCircle(cx, cy, 8);
      }

      if (i === this.selectedHat) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeCircle(cx, cy, 9);
      }
    }
  }


  private setup3DPreview(): void {
    const S = 512;
    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.previewRenderer.setSize(S, S);
    this.previewRenderer.setClearColor(0x000000, 0);
    this.previewRenderer.shadowMap.enabled = true;

    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.previewCamera.position.set(0, 1.2, 4.5);
    this.previewCamera.lookAt(0, 0.9, 0);

    this.previewScene.add(new THREE.AmbientLight(0x667788, 0.6));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(3, 5, 4);
    sun.castShadow = true;
    this.previewScene.add(sun);
    this.previewScene.add(new THREE.DirectionalLight(0x8899cc, 0.4).translateX(-2).translateY(3));
    this.previewScene.add(new THREE.HemisphereLight(0x88aacc, 0x3a5a20, 0.3));

    // Ground disc
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.previewScene.add(ground);

    // Build character model
    this.pShirtMat = new THREE.MeshStandardMaterial({ color: this.shirtColor, roughness: 0.8 });
    this.pSkinMat = new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.6, metalness: 0.05 });
    this.pPantsMat = new THREE.MeshStandardMaterial({ color: this.pantsColor, roughness: 0.85 });
    this.pHairMat = new THREE.MeshStandardMaterial({ color: this.hairColor, roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.1 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2010 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xc8a848, metalness: 0.6 });

    this.previewRoot = new THREE.Group();

    // Hips
    const hips = new THREE.Group();
    hips.name = 'hips';
    hips.position.y = 0.95;
    this.previewRoot.add(hips);
    hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), beltMat));
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.02), buckleMat);
    buckle.position.z = 0.15;
    hips.add(buckle);

    // Torso
    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0.05;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), this.pShirtMat);
    chest.position.y = 0.3;
    chest.castShadow = true;
    torso.add(chest);

    // Brand label placeholder (none by default)
    this.brandLabelMesh = null;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), this.pSkinMat);
    neck.position.y = 0.6;
    torso.add(neck);

    // Head
    const headGroup = new THREE.Group();
    headGroup.name = 'head';
    headGroup.position.y = 0.72;
    torso.add(headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this.pSkinMat);
    head.scale.set(1, 1.1, 0.95);
    head.castShadow = true;
    headGroup.add(head);

    // Eyes
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), whiteMat);
      eye.position.set(side * 0.07, 0.04, 0.16);
      headGroup.add(eye);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), irisMat);
      iris.position.set(side * 0.07, 0.04, 0.199);
      headGroup.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), pupilMat);
      pupil.position.set(side * 0.07, 0.04, 0.2);
      headGroup.add(pupil);
    }
    // Nose
    headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), this.pSkinMat).translateY(-0.01).translateZ(0.19));
    // Mouth
    headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.01), new THREE.MeshStandardMaterial({ color: 0xcc5555 })).translateY(-0.07).translateZ(0.18));
    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this.pSkinMat);
      ear.position.set(side * 0.2, 0.02, 0);
      ear.scale.set(0.4, 1, 0.7);
      headGroup.add(ear);
    }
    // Hair (visible when no hat)
    this.previewHairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      this.pHairMat
    );
    this.previewHairMesh.position.y = 0.04;
    headGroup.add(this.previewHairMesh);

    // Hat group (swapped on color change)
    this.pHatMat = new THREE.MeshStandardMaterial({ color: 0xcc3300, roughness: 0.7 });
    this.previewHatGroup = new THREE.Group();
    this.previewHatGroup.name = 'hatGroup';
    this.previewHatGroup.visible = false;
    // Cap dome
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      this.pHatMat
    );
    capDome.position.y = 0.04;
    this.previewHatGroup.add(capDome);
    // Brim
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.015, 10, 1, false, -Math.PI * 0.5, Math.PI),
      this.pHatMat
    );
    brim.position.set(0, 0.1, 0.18);
    brim.rotation.x = -0.3;
    this.previewHatGroup.add(brim);
    headGroup.add(this.previewHatGroup);

    // Arms
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.name = side === -1 ? 'leftUpperArm' : 'rightUpperArm';
      upper.position.set(side * 0.3, 0.48, 0);
      torso.add(upper);
      const ua = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), this.pShirtMat);
      ua.position.y = -0.14;
      ua.castShadow = true;
      upper.add(ua);
      const forearm = new THREE.Group();
      forearm.name = side === -1 ? 'leftForearm' : 'rightForearm';
      forearm.position.y = -0.28;
      upper.add(forearm);
      const fa = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), this.pSkinMat);
      fa.position.y = -0.12;
      forearm.add(fa);
      forearm.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), this.pSkinMat).translateY(-0.27));
    }

    // Legs
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.name = side === -1 ? 'leftThigh' : 'rightThigh';
      thigh.position.set(side * 0.12, 0, 0);
      hips.add(thigh);
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), this.pPantsMat);
      th.position.y = -0.2;
      th.castShadow = true;
      thigh.add(th);
      const shin = new THREE.Group();
      shin.name = side === -1 ? 'leftShin' : 'rightShin';
      shin.position.y = -0.38;
      thigh.add(shin);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), this.pPantsMat);
      sh.position.y = -0.16;
      shin.add(sh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoeMat);
      shoe.position.set(0, -0.34, 0.04);
      shin.add(shoe);
    }

    // Shadow blob
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.previewRoot.add(shadow);

    this.previewScene.add(this.previewRoot);
  }

  private render3DPreview(): void {
    // Rotate the character
    this.previewRoot.rotation.y = this.previewRotation;

    // Idle breathing animation
    const t = this.previewAnimFrame;
    const hips = this.previewRoot.getObjectByName('hips') as THREE.Group;
    if (hips) {
      hips.position.y = 0.95 + Math.sin(t * 1.5) * 0.01;
      hips.rotation.z = Math.sin(t * 0.8) * 0.015;
    }
    const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
    if (torso) {
      torso.rotation.x = Math.sin(t * 1.2) * 0.01;
    }
    const head = this.previewRoot.getObjectByName('head') as THREE.Group;
    if (head) {
      head.rotation.x = Math.sin(t * 0.7) * 0.02;
      head.rotation.y = Math.sin(t * 0.4) * 0.03;
    }
    // Subtle arm sway
    const lArm = this.previewRoot.getObjectByName('leftUpperArm') as THREE.Group;
    const rArm = this.previewRoot.getObjectByName('rightUpperArm') as THREE.Group;
    if (lArm) lArm.rotation.x = Math.sin(t * 0.5) * 0.03;
    if (rArm) rArm.rotation.x = Math.sin(t * 0.5 + 1) * 0.03;
    const lFa = this.previewRoot.getObjectByName('leftForearm') as THREE.Group;
    const rFa = this.previewRoot.getObjectByName('rightForearm') as THREE.Group;
    if (lFa) lFa.rotation.x = -0.05;
    if (rFa) rFa.rotation.x = -0.05;

    this.previewRenderer.render(this.previewScene, this.previewCamera);
  }

  private updatePreviewColors(): void {
    this.pShirtMat.color.setHex(this.shirtColor);
    this.pSkinMat.color.setHex(this.skinColor);
    this.pPantsMat.color.setHex(this.pantsColor);
    this.pHairMat.color.setHex(this.hairColor);

    const hatColor = HAT_OPTIONS[this.selectedHat];
    if (hatColor === -1) {
      // No hat — show hair, hide hat
      this.previewHairMesh.visible = true;
      this.previewHatGroup.visible = false;
    } else {
      // Hat on — hide hair, show hat
      this.previewHairMesh.visible = false;
      this.previewHatGroup.visible = true;
      this.pHatMat.color.setHex(hatColor);
    }
  }

  private updateBrandOnPreview(): void {
    // Remove old brand label
    if (this.brandLabelMesh) {
      const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
      if (torso) torso.remove(this.brandLabelMesh);
      this.brandLabelMesh = null;
    }
    if (!this.selectedBrand) return;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 48px Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(this.selectedBrand, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.13), mat);
    plane.position.set(0, 0.32, 0.19);
    this.brandLabelMesh = plane;

    const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
    if (torso) torso.add(plane);
  }

  private createFileInputOverlay(gameX: number, gameY: number, w: number, h: number): void {
    if (this.fileInput) { this.fileInput.remove(); this.fileInput = null; }

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.position = 'absolute';
    inp.style.left = `${rect.left + gameX * scaleX}px`;
    inp.style.top = `${rect.top + gameY * scaleY}px`;
    inp.style.width = `${w * scaleX}px`;
    inp.style.height = `${h * scaleY}px`;
    inp.style.opacity = '0';
    inp.style.zIndex = '9999';
    inp.style.cursor = 'pointer';
    document.body.appendChild(inp);

    inp.addEventListener('change', () => {
      const file = inp.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        this.shirtLabelDataUrl = dataUrl;
        this.applyShirtLabelToPreview(dataUrl);
      };
      reader.readAsDataURL(file);
      inp.value = '';
    });

    this.fileInput = inp;
  }

  private openFileUpload(): void {
    // fallback - not used when overlay is active
    if (this.fileInput) {
      this.fileInput.value = '';
      this.fileInput.click();
    }
  }

  private clearShirtLabel(): void {
    this.shirtLabelDataUrl = null;
    if (this.shirtLabelPlane) {
      const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
      if (torso) torso.remove(this.shirtLabelPlane);
      (this.shirtLabelPlane.material as THREE.MeshBasicMaterial).dispose();
      this.shirtLabelPlane = null;
    }
  }

  private applyShirtLabelToPreview(dataUrl: string): void {
    // Remove old label if any
    if (this.shirtLabelPlane) {
      const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
      if (torso) torso.remove(this.shirtLabelPlane);
      (this.shirtLabelPlane.material as THREE.MeshBasicMaterial).dispose();
      this.shirtLabelPlane = null;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 128);
      // Draw image centered and fitted
      const scale = Math.min(128 / img.width, 128 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), mat);
      plane.position.set(0, 0.3, 0.155);
      plane.name = 'shirtLabel';

      const torso = this.previewRoot.getObjectByName('torso') as THREE.Group;
      if (torso) torso.add(plane);
      this.shirtLabelPlane = plane;
    };
    img.src = dataUrl;
  }

  private generatePortraitTexture(): string {
    const textureKey = `char-custom-${Date.now()}`;
    const canvas = this.render3DPortrait(
      this.skinColor,
      this.hairColor,
      this.shirtColor,
      this.pantsColor,
      HAT_OPTIONS[this.selectedHat],
    );
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }
    this.textures.addCanvas(textureKey, canvas);
    return textureKey;
  }

  private render3DPortrait(skin: number, hair: number, shirt: number, pants: number, hatColor: number = -1): HTMLCanvasElement {
    const S = 512;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(S, S);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;

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

    // Build character
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });

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

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.72;
    torso.add(headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
    head.scale.set(1, 1.1, 0.95);
    headGroup.add(head);
    // Eyes
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    for (const side of [-1, 1]) {
      headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), whiteMat).translateX(side * 0.07).translateY(0.04).translateZ(0.16));
      headGroup.add(new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a3a })).translateX(side * 0.07).translateY(0.04).translateZ(0.199));
      headGroup.add(new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), new THREE.MeshStandardMaterial({ color: 0x111111 })).translateX(side * 0.07).translateY(0.04).translateZ(0.2));
      headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), skinMat).translateX(side * 0.2).translateY(0.02));
    }
    headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), skinMat).translateY(-0.01).translateZ(0.19));
    headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.01), new THREE.MeshStandardMaterial({ color: 0xcc5555 })).translateY(-0.07).translateZ(0.18));
    // Hair or hat
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

    // Arms
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.3, 0.48, 0);
      torso.add(upper);
      const ua = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat);
      ua.position.y = -0.14;
      upper.add(ua);
      const forearm = new THREE.Group();
      forearm.position.y = -0.28;
      upper.add(forearm);
      const fa = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat);
      fa.position.y = -0.12;
      forearm.add(fa);
      forearm.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat).translateY(-0.27));
    }

    // Legs
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.12, 0, 0);
      hips.add(thigh);
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat);
      th.position.y = -0.2;
      thigh.add(th);
      const shin = new THREE.Group();
      shin.position.y = -0.38;
      thigh.add(shin);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat);
      sh.position.y = -0.16;
      shin.add(sh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoeMat);
      shoe.position.set(0, -0.34, 0.04);
      shin.add(shoe);
    }

    root.rotation.y = 0.25;
    scene.add(root);

    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    renderer.dispose();
    return canvas;
  }

  private createNameInput(cx: number, cy: number): void {
    // Remove existing if any
    this.removeNameInput();

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter name...';
    input.maxLength = 12;
    input.style.cssText = `
      position: fixed;
      width: 120px;
      height: 24px;
      font-size: 12px;
      font-family: 'Arial Black', sans-serif;
      text-align: center;
      background: #1a1a2e;
      color: #ffffff;
      border: 2px solid #444466;
      border-radius: 6px;
      outline: none;
      padding: 0 4px;
      z-index: 1000;
    `;

    input.addEventListener('focus', () => {
      input.style.borderColor = '#ffcc00';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#444466';
    });

    document.body.appendChild(input);
    this.nameInput = input;

    // Position the input over the canvas
    this.positionNameInput(cx, cy);

    // Re-position on resize
    this.scale.on('resize', () => this.positionNameInput(cx, cy));
  }

  private positionNameInput(cx: number, cy: number): void {
    if (!this.nameInput) return;

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / GAME_WIDTH;
    const scaleY = rect.height / GAME_HEIGHT;

    const inputW = 120 * scaleX;
    const inputH = 24 * scaleY;
    const left = rect.left + cx * scaleX - inputW / 2;
    const top = rect.top + cy * scaleY - inputH / 2;

    this.nameInput.style.width = `${inputW}px`;
    this.nameInput.style.height = `${inputH}px`;
    this.nameInput.style.fontSize = `${12 * scaleY}px`;
    this.nameInput.style.left = `${left}px`;
    this.nameInput.style.top = `${top}px`;
  }

  private removeNameInput(): void {
    if (this.nameInput && this.nameInput.parentNode) {
      this.nameInput.parentNode.removeChild(this.nameInput);
      this.nameInput = null;
    }
  }

  private onDone(): void {
    const name = this.nameInput?.value.trim() || 'Custom Hero';

    // Generate portrait texture
    const textureKey = this.generatePortraitTexture();

    // Create new character data
    const newChar: CharacterData = {
      key: textureKey,
      name: name,
      gender: 'boy',
    };

    // Add to CHARACTERS array
    CHARACTERS.push(newChar);

    // Save to localStorage
    const customSave: CustomSave = {
      ...newChar,
      skinColor: this.skinColor,
      hairColor: this.hairColor,
      shirtColor: this.shirtColor,
      pantsColor: this.pantsColor,
      hatColor: HAT_OPTIONS[this.selectedHat],
      shirtLabel: this.shirtLabelDataUrl || undefined,
      shirtBrand: this.selectedBrand || undefined,
    };

    const saved = this.getSavedCustomCharacters();
    saved.push(customSave);
    localStorage.setItem('customCharacters', JSON.stringify(saved));

    // Clean up and go back
    this.removeNameInput();
    this.scene.start('CharacterSelectScene');
  }

  private getSavedCustomCharacters(): CustomSave[] {
    try {
      const raw = localStorage.getItem('customCharacters');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
  }

  private loadCustomCharacters(): void {
    const saved = this.getSavedCustomCharacters();
    for (const sc of saved) {
      // Skip if already loaded
      if (CHARACTERS.find(c => c.key === sc.key)) continue;

      // Regenerate the texture using 3D rendering
      const canvas = this.render3DPortrait(sc.skinColor, sc.hairColor, sc.shirtColor, sc.pantsColor, sc.hatColor ?? -1);

      if (!this.textures.exists(sc.key)) {
        this.textures.addCanvas(sc.key, canvas);
      }

      CHARACTERS.push({
        key: sc.key,
        name: sc.name,
        gender: sc.gender,
      });
    }
  }

  shutdown(): void {
    this.removeNameInput();
    if (this.fileInput) { this.fileInput.remove(); this.fileInput = null; }
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
    }
  }

  destroy(): void {
    this.removeNameInput();
    if (this.fileInput) { this.fileInput.remove(); this.fileInput = null; }
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
    }
  }
}
