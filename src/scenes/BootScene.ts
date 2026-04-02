import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Loading bar
    const barWidth = GAME_WIDTH * 0.6;
    const barHeight = 20;
    const barX = (GAME_WIDTH - barWidth) / 2;
    const barY = GAME_HEIGHT / 2;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x333333, 0.8);
    progressBox.fillRect(barX, barY, barWidth, barHeight);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xff4444, 1);
      progressBar.fillRect(barX + 2, barY + 2, (barWidth - 4) * value, barHeight - 4);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    // Load real character photos
    this.load.image('char-hedgie', 'assets/characters/hedgie.png');
    this.load.image('char-stickman', 'assets/characters/stickman.png');
    this.load.image('char-tinfoilman', 'assets/characters/tinfoilman.png');

    // Load real forest background photo
    this.load.image('forest-bg', 'assets/backgrounds/forest.jpg');

    // Apple monster — generated in createPlaceholderTextures()

    // Generate placeholder textures programmatically
    this.createPlaceholderTextures();

    // Dry Texas grass ground tile
    const gridGfx = this.make.graphics({ x: 0, y: 0 });
    gridGfx.fillStyle(0x5a7a40);
    gridGfx.fillRect(0, 0, 128, 128);
    // Dry yellow-brown patches
    gridGfx.fillStyle(0x8a7a50, 0.4);
    gridGfx.fillEllipse(30, 40, 45, 35);
    gridGfx.fillEllipse(90, 80, 40, 30);
    gridGfx.fillEllipse(60, 20, 35, 22);
    // Some green patches
    gridGfx.fillStyle(0x4a6a30, 0.3);
    gridGfx.fillEllipse(70, 50, 35, 28);
    gridGfx.fillEllipse(20, 100, 30, 22);
    // Sandy dirt spots
    gridGfx.fillStyle(0x9a8060, 0.25);
    gridGfx.fillEllipse(50, 90, 18, 12);
    gridGfx.fillEllipse(100, 30, 14, 10);
    gridGfx.fillEllipse(15, 60, 12, 10);
    // Dry grass tufts
    gridGfx.lineStyle(1, 0x6a8a48, 0.3);
    gridGfx.lineBetween(20, 50, 22, 44);
    gridGfx.lineBetween(60, 70, 62, 64);
    gridGfx.lineBetween(100, 40, 102, 34);
    gridGfx.lineBetween(40, 110, 42, 104);
    gridGfx.lineStyle(1, 0x8a7a48, 0.2);
    gridGfx.lineBetween(80, 20, 82, 14);
    gridGfx.lineBetween(110, 100, 112, 94);
    gridGfx.generateTexture('ground-grid', 128, 128);
    gridGfx.destroy();
  }

  create(): void {
    // Generate walk cycle frames for photo-based characters
    const photoChars = [
      { key: 'char-hedgie', shirt: 0x4488aa, pants: 0x2a2a3a, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0x4a3020 },
      { key: 'char-stickman', shirt: 0x333333, pants: 0x1a1a1a, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0x1a1a1a },
      { key: 'char-tinfoilman', shirt: 0xaaaaaa, pants: 0x555555, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0x888888 },
    ];

    const toRGB2 = (hex: number) => ({ r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff });
    const rgb2 = (hex: number, a = 1) => { const { r, g, b } = toRGB2(hex); return `rgba(${r},${g},${b},${a})`; };

    const P_FC = 16;
    const P_FS = 96;
    const P_MX = P_FS / 2;

    for (const pc of photoChars) {
      if (!this.textures.exists(pc.key)) continue;

      const srcTexture = this.textures.get(pc.key);
      const srcCanvas = srcTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

      for (let frame = 0; frame < P_FC; frame++) {
        const fc = document.createElement('canvas');
        fc.width = P_FS;
        fc.height = P_FS;
        const ctx = fc.getContext('2d')!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const isIdle = frame === 0;
        const phase = ((frame - 1) / (P_FC - 1)) * Math.PI * 2;
        const sinP = isIdle ? 0 : Math.sin(phase);
        const legAng = sinP * 0.55;
        const armAng = -sinP * 0.45;
        const bob = isIdle ? 0 : -Math.abs(sinP) * 4;
        const hipTwist = sinP * 1.5;

        // Shadow
        ctx.fillStyle = `rgba(0,0,0,${isIdle ? 0.25 : 0.2 + Math.abs(sinP) * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(P_MX, 90, 18 + Math.abs(sinP) * 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left leg — thigh + shin + shoe
        ctx.save();
        ctx.translate(P_MX - 7 + hipTwist * 0.3, 58);
        ctx.rotate(legAng);
        const pltg = ctx.createLinearGradient(-4, 0, 5, 0);
        pltg.addColorStop(0, rgb2(pc.pants, 0.9));
        pltg.addColorStop(1, rgb2(pc.pants));
        ctx.fillStyle = pltg;
        ctx.beginPath();
        ctx.roundRect(-4, 0, 9, 14, 2);
        ctx.fill();
        ctx.save();
        ctx.translate(0, 13);
        ctx.rotate(isIdle ? 0 : Math.max(0, -sinP) * 0.3);
        ctx.fillStyle = rgb2(pc.pants);
        ctx.beginPath();
        ctx.roundRect(-3.5, 0, 8, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.roundRect(-5, 10, 11, 5, 2);
        ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.roundRect(-4, 10, 5, 4, 1);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // Right leg
        ctx.save();
        ctx.translate(P_MX + 7 - hipTwist * 0.3, 58);
        ctx.rotate(-legAng);
        const prtg = ctx.createLinearGradient(-4, 0, 5, 0);
        prtg.addColorStop(0, rgb2(pc.pants, 0.9));
        prtg.addColorStop(1, rgb2(pc.pants));
        ctx.fillStyle = prtg;
        ctx.beginPath();
        ctx.roundRect(-4, 0, 9, 14, 2);
        ctx.fill();
        ctx.save();
        ctx.translate(0, 13);
        ctx.rotate(isIdle ? 0 : Math.max(0, sinP) * 0.3);
        ctx.fillStyle = rgb2(pc.pants);
        ctx.beginPath();
        ctx.roundRect(-3.5, 0, 8, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.roundRect(-5, 10, 11, 5, 2);
        ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.roundRect(-4, 10, 5, 4, 1);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // Belt
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(P_MX - 13, 55 + bob, 26, 4);
        ctx.fillStyle = '#c8a848';
        ctx.beginPath();
        ctx.roundRect(P_MX - 3, 54 + bob, 6, 6, 1);
        ctx.fill();

        // Torso
        ctx.save();
        ctx.translate(P_MX, 40 + bob);
        ctx.rotate(isIdle ? 0 : 0.04);
        const ptg = ctx.createLinearGradient(-14, -16, 14, 16);
        ptg.addColorStop(0, rgb2(pc.shirt, 0.85));
        ptg.addColorStop(0.4, rgb2(pc.shirt));
        ptg.addColorStop(1, rgb2(pc.shirt, 0.7));
        ctx.fillStyle = ptg;
        ctx.beginPath();
        ctx.moveTo(-14, -14);
        ctx.bezierCurveTo(-16, -10, -14, 14, -12, 18);
        ctx.lineTo(12, 18);
        ctx.bezierCurveTo(14, 14, 16, -10, 14, -14);
        ctx.closePath();
        ctx.fill();
        // Collar
        ctx.fillStyle = rgb2(pc.skin, 0.85);
        ctx.beginPath();
        ctx.ellipse(0, -13, 7, 4, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        // Wrinkle
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.quadraticCurveTo(0, -2, 8, 0);
        ctx.stroke();
        ctx.restore();

        // Left arm
        ctx.save();
        ctx.translate(P_MX - 16, 28 + bob);
        ctx.rotate(armAng);
        const plag = ctx.createLinearGradient(-4, 0, 4, 0);
        plag.addColorStop(0, rgb2(pc.shirt, 0.9));
        plag.addColorStop(1, rgb2(pc.shirt, 0.7));
        ctx.fillStyle = plag;
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, 12, 2);
        ctx.fill();
        ctx.save();
        ctx.translate(0, 11);
        ctx.rotate(isIdle ? 0 : -Math.abs(sinP) * 0.2);
        ctx.fillStyle = rgb2(pc.skin);
        ctx.beginPath();
        ctx.roundRect(-3, 0, 7, 10, 2);
        ctx.fill();
        ctx.fillStyle = rgb2(pc.skinHi);
        ctx.beginPath();
        ctx.ellipse(1, 12, 4, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // Right arm + weapon
        ctx.save();
        ctx.translate(P_MX + 16, 28 + bob);
        ctx.rotate(-armAng);
        const prag = ctx.createLinearGradient(-4, 0, 4, 0);
        prag.addColorStop(0, rgb2(pc.shirt, 0.9));
        prag.addColorStop(1, rgb2(pc.shirt, 0.7));
        ctx.fillStyle = prag;
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, 12, 2);
        ctx.fill();
        ctx.save();
        ctx.translate(0, 11);
        ctx.rotate(isIdle ? 0 : Math.abs(sinP) * 0.2);
        ctx.fillStyle = rgb2(pc.skin);
        ctx.beginPath();
        ctx.roundRect(-3, 0, 7, 10, 2);
        ctx.fill();
        ctx.fillStyle = rgb2(pc.skinHi);
        ctx.beginPath();
        ctx.ellipse(1, 12, 4, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Weapon
        ctx.fillStyle = '#555';
        ctx.fillRect(-1, -4, 3, 16);
        ctx.fillStyle = '#444';
        ctx.fillRect(-0.5, -7, 2, 4);
        ctx.restore();
        ctx.restore();

        // Neck
        ctx.fillStyle = rgb2(pc.skin);
        ctx.fillRect(P_MX - 4, 18 + bob, 8, 8);

        // Head — photo cropped to circle
        ctx.save();
        ctx.translate(P_MX, 12 + bob);
        ctx.rotate(isIdle ? 0 : sinP * 0.02);
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.clip();
        try {
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width ?? 512, srcCanvas.height ?? 512, -13, -13, 26, 26);
        } catch (_e) {
          ctx.fillStyle = rgb2(pc.skin);
          ctx.fillRect(-13, -13, 26, 26);
        }
        ctx.restore();

        this.textures.addCanvas(`${pc.key}-f${frame}`, fc);
      }

      this.anims.create({
        key: `${pc.key}-idle`,
        frames: [{ key: `${pc.key}-f0` }],
        frameRate: 1,
        repeat: -1,
      });

      const pcRunFrames: { key: string }[] = [];
      for (let f = 1; f < P_FC; f++) pcRunFrames.push({ key: `${pc.key}-f${f}` });
      this.anims.create({
        key: `${pc.key}-run`,
        frames: pcRunFrames,
        frameRate: 20,
        repeat: -1,
      });
    }

    this.scene.start('TitleScene');
  }

  private createPlaceholderTextures(): void {
    // Realistic cloud background for boss phase — gradient sky with volumetric clouds
    const cloudGfx = this.make.graphics({ x: 0, y: 0 });
    // Sky gradient
    for (let sy = 0; sy < GAME_HEIGHT; sy++) {
      const t = sy / GAME_HEIGHT;
      const r = Math.floor(60 + t * 80);
      const g = Math.floor(120 + t * 60);
      const b = Math.floor(200 - t * 30);
      cloudGfx.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
      cloudGfx.fillRect(0, sy, GAME_WIDTH, 1);
    }
    // Volumetric clouds — multiple layered ellipses per cloud
    const cloudPositions = [
      { x: 80, y: 60 }, { x: 250, y: 100 }, { x: 450, y: 50 },
      { x: 600, y: 120 }, { x: 150, y: 200 }, { x: 400, y: 250 },
      { x: 700, y: 180 }, { x: 50, y: 300 }, { x: 500, y: 320 },
    ];
    for (const cp of cloudPositions) {
      // Shadow
      cloudGfx.fillStyle(0x8888aa, 0.2);
      cloudGfx.fillEllipse(cp.x + 5, cp.y + 8, 90, 35);
      // Cloud base
      cloudGfx.fillStyle(0xddddef, 0.6);
      cloudGfx.fillEllipse(cp.x, cp.y + 5, 80, 30);
      // Cloud main
      cloudGfx.fillStyle(0xeeeeff, 0.7);
      cloudGfx.fillEllipse(cp.x, cp.y, 70, 28);
      cloudGfx.fillEllipse(cp.x - 20, cp.y + 3, 50, 22);
      cloudGfx.fillEllipse(cp.x + 25, cp.y + 2, 45, 20);
      // Bright top
      cloudGfx.fillStyle(0xffffff, 0.5);
      cloudGfx.fillEllipse(cp.x - 5, cp.y - 5, 40, 16);
    }
    cloudGfx.generateTexture('cloud-bg', GAME_WIDTH, GAME_HEIGHT);
    cloudGfx.destroy();

    // 20 unique realistic characters — diverse skin tones, body types, hairstyles
    const chars = [
      // Boys — thicker brows, shorter hair, lower lip tint
      { name: 'Jake', shirt: 0x1a1a2e, shirtHi: 0x2e2e4a, pants: 0x101018, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0x9a7a52, hair: 0x0e0e0e, hairHi: 0x2a2a2a, hat: 0, irisCol: '#4a5a3a', lipTint: 0.1, browThick: 5.5, gender: 'boy' },
      { name: 'Marcus', shirt: 0xcc3300, shirtHi: 0xee5522, pants: 0x551800, skin: 0x8a5a3a, skinHi: 0xa87a58, skinDk: 0x6a4028, hair: 0x1a1008, hairHi: 0x2a2018, hat: 0, irisCol: '#5a3a1a', lipTint: 0.12, browThick: 6, gender: 'boy' },
      { name: 'Tyler', shirt: 0x2266cc, shirtHi: 0x4488ee, pants: 0x0e2244, skin: 0xe0c0a0, skinHi: 0xf4d8bc, skinDk: 0xc0a080, hair: 0x4a3020, hairHi: 0x6a4a38, hat: 0, irisCol: '#4a7aaa', lipTint: 0.08, browThick: 5, gender: 'boy' },
      { name: 'DeShawn', shirt: 0x1e7a1e, shirtHi: 0x3a9a3a, pants: 0x0e3a0e, skin: 0x6a4428, skinHi: 0x8a6040, skinDk: 0x4a2a18, hair: 0x0e0e0e, hairHi: 0x1e1e1e, hat: 0, irisCol: '#3a5a2a', lipTint: 0.15, browThick: 6, gender: 'boy' },
      { name: 'Ethan', shirt: 0xc0c0c0, shirtHi: 0xe0e0e0, pants: 0x707070, skin: 0xf0dcc8, skinHi: 0xfff0e0, skinDk: 0xd0bca8, hair: 0xd8d0c8, hairHi: 0xeee8e0, hat: 0, irisCol: '#8a9aaa', lipTint: 0.06, browThick: 4.5, gender: 'boy' },
      { name: 'Carlos', shirt: 0x7a5500, shirtHi: 0x9a7520, pants: 0x4a3300, skin: 0xba8860, skinHi: 0xd8a880, skinDk: 0x8a6840, hair: 0x2a1a0a, hairHi: 0x4a3a2a, hat: 1, irisCol: '#6a5a3a', lipTint: 0.1, browThick: 6, gender: 'boy' },
      { name: 'Ryan', shirt: 0xaa00aa, shirtHi: 0xcc44cc, pants: 0x550055, skin: 0xd4aa78, skinHi: 0xecc898, skinDk: 0xb48a58, hair: 0x0e0e0e, hairHi: 0x2a2a2a, hat: 0, irisCol: '#5a4a6a', lipTint: 0.1, browThick: 5, gender: 'boy' },
      { name: 'Tyrone', shirt: 0x4a5a2a, shirtHi: 0x6a7a4a, pants: 0x2a3a1a, skin: 0x7a5438, skinHi: 0x9a7458, skinDk: 0x5a3a22, hair: 0x0a0a0a, hairHi: 0x1a1a1a, hat: 2, irisCol: '#4a3a2a', lipTint: 0.15, browThick: 6.5, gender: 'boy' },
      { name: 'Noah', shirt: 0xf8f8f8, shirtHi: 0xffffff, pants: 0x1a1a1a, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0x6a4a2a, hairHi: 0x8a6a4a, hat: 0, irisCol: '#5a7a4a', lipTint: 0.08, browThick: 5, gender: 'boy' },
      { name: 'Andre', shirt: 0x1e0e1e, shirtHi: 0x3a2a3a, pants: 0x100010, skin: 0xa87a58, skinHi: 0xc89a78, skinDk: 0x885a38, hair: 0x0a0a0a, hairHi: 0x1a1a1a, hat: 0, irisCol: '#2a2a3a', lipTint: 0.12, browThick: 5.5, gender: 'boy' },
      // Girls — thinner brows, longer hair, more lip color
      { name: 'Mia', shirt: 0xd4a000, shirtHi: 0xf0c020, pants: 0x7a5a00, skin: 0xe0c0a0, skinHi: 0xf4d8bc, skinDk: 0xc0a080, hair: 0x4a3020, hairHi: 0x6a4a38, hat: 0, irisCol: '#6a6a3a', lipTint: 0.35, browThick: 2.5, gender: 'girl' },
      { name: 'Luna', shirt: 0x181818, shirtHi: 0x2e2e2e, pants: 0x0a0a0a, skin: 0xd8c0b0, skinHi: 0xf0dcd0, skinDk: 0xb8a090, hair: 0x0a0a0a, hairHi: 0x1a1a1a, hat: 0, irisCol: '#3a4a3a', lipTint: 0.3, browThick: 2.5, gender: 'girl' },
      { name: 'Zoe', shirt: 0x0060b8, shirtHi: 0x2080d8, pants: 0x002a50, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0xe8b800, hairHi: 0xffd840, hat: 0, irisCol: '#3a7aaa', lipTint: 0.32, browThick: 2.5, gender: 'girl' },
      { name: 'Aaliyah', shirt: 0x2a2a2a, shirtHi: 0x4a4a4a, pants: 0x181818, skin: 0x7a5438, skinHi: 0x9a7458, skinDk: 0x5a3a22, hair: 0x0a0a0a, hairHi: 0x1a1a1a, hat: 0, irisCol: '#3a3a2a', lipTint: 0.4, browThick: 2.5, gender: 'girl' },
      { name: 'Bella', shirt: 0xe86080, shirtHi: 0xf88898, pants: 0xaa3050, skin: 0xe0c0a0, skinHi: 0xf4d8bc, skinDk: 0xc0a080, hair: 0x7a3818, hairHi: 0x9a5838, hat: 0, irisCol: '#5a7a5a', lipTint: 0.38, browThick: 2.5, gender: 'girl' },
      { name: 'Ivy', shirt: 0x5a5a6a, shirtHi: 0x8a8a9a, pants: 0x3a3a4a, skin: 0xba8860, skinHi: 0xd8a880, skinDk: 0x8a6840, hair: 0x1a1a1a, hairHi: 0x2a2a2a, hat: 0, irisCol: '#4a5a5a', lipTint: 0.35, browThick: 2.5, gender: 'girl' },
      { name: 'Jade', shirt: 0x4a6030, shirtHi: 0x6a8050, pants: 0x304020, skin: 0xc49a6c, skinHi: 0xdcb88a, skinDk: 0xa47a4c, hair: 0x2a1a0a, hairHi: 0x4a3a2a, hat: 0, irisCol: '#4a6a3a', lipTint: 0.33, browThick: 2.5, gender: 'girl' },
      { name: 'Scarlett', shirt: 0xe84400, shirtHi: 0xff6622, pants: 0x8a2200, skin: 0x8a5a3a, skinHi: 0xa87a58, skinDk: 0x6a4028, hair: 0xcc2200, hairHi: 0xee4420, hat: 0, irisCol: '#5a4a2a', lipTint: 0.4, browThick: 2.5, gender: 'girl' },
      { name: 'Aria', shirt: 0x98b8d8, shirtHi: 0xb8d8f0, pants: 0x6888a8, skin: 0xe0c0a0, skinHi: 0xf4d8bc, skinDk: 0xc0a080, hair: 0xe0dcd8, hairHi: 0xf8f4f0, hat: 0, irisCol: '#4a8aaa', lipTint: 0.3, browThick: 2.5, gender: 'girl' },
      { name: 'Roxy', shirt: 0x7a0000, shirtHi: 0xa82020, pants: 0x440000, skin: 0xba8860, skinHi: 0xd8a880, skinDk: 0x8a6840, hair: 0x0a0a0a, hairHi: 0x1a1a1a, hat: 0, irisCol: '#4a3a2a', lipTint: 0.38, browThick: 2.5, gender: 'girl' },
    ];

    // Generate 3D character portraits using Three.js
    this.render3DCharacters(chars);

    // Death sprite — dark realistic apple with bite/slice
    const appleGfx = this.make.graphics({ x: 0, y: 0 });
    // Dark red apple body
    appleGfx.fillStyle(0x8a1515);
    appleGfx.fillCircle(24, 26, 20);
    // Shading
    appleGfx.fillStyle(0x6a0e0e, 0.6);
    appleGfx.fillCircle(28, 30, 16);
    // Highlight
    appleGfx.fillStyle(0xaa3030, 0.4);
    appleGfx.fillCircle(18, 20, 8);
    // Exposed flesh (cut face)
    appleGfx.fillStyle(0xd4c8a0, 0.7);
    appleGfx.slice(24, 26, 17, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(130), false);
    appleGfx.fillPath();
    // Seeds
    appleGfx.fillStyle(0x3a2a1a);
    appleGfx.fillEllipse(22, 26, 3, 5);
    appleGfx.fillEllipse(28, 25, 3, 5);
    // Stem
    appleGfx.fillStyle(0x3a2a18);
    appleGfx.fillRect(23, 4, 3, 8);
    // Leaf
    appleGfx.fillStyle(0x2a5a1a, 0.7);
    appleGfx.fillEllipse(30, 8, 10, 5);
    appleGfx.generateTexture('apple-slice', 48, 48);
    appleGfx.destroy();

    // === REALISTIC LOOT ITEMS ===
    // Shield potion (glowing blue bottle with liquid)
    const shieldGfx = this.make.graphics({ x: 0, y: 0 });
    // Bottle body
    shieldGfx.fillStyle(0x1a3366);
    shieldGfx.fillRoundedRect(8, 10, 16, 20, 4);
    // Glass highlight
    shieldGfx.fillStyle(0x3366cc, 0.8);
    shieldGfx.fillRoundedRect(10, 12, 12, 16, 3);
    // Liquid inside
    shieldGfx.fillStyle(0x4488ff, 0.7);
    shieldGfx.fillRoundedRect(11, 16, 10, 11, 2);
    // Liquid glow
    shieldGfx.fillStyle(0x66aaff, 0.4);
    shieldGfx.fillRoundedRect(12, 18, 6, 7, 1);
    // Bottle neck
    shieldGfx.fillStyle(0x1a3366);
    shieldGfx.fillRect(13, 5, 6, 7);
    // Cork
    shieldGfx.fillStyle(0x8a6a3a);
    shieldGfx.fillRect(13, 3, 6, 4);
    // Glass shine
    shieldGfx.fillStyle(0xffffff, 0.25);
    shieldGfx.fillRect(11, 12, 2, 10);
    shieldGfx.generateTexture('loot-shield', 32, 32);
    shieldGfx.destroy();

    // Health kit (white box with red cross)
    const healGfx = this.make.graphics({ x: 0, y: 0 });
    // Box body
    healGfx.fillStyle(0xeeeeee);
    healGfx.fillRoundedRect(4, 6, 24, 20, 3);
    // Box shadow
    healGfx.fillStyle(0xcccccc, 0.5);
    healGfx.fillRect(4, 22, 24, 4);
    // Red cross
    healGfx.fillStyle(0xdd2222);
    healGfx.fillRect(12, 9, 8, 14);
    healGfx.fillRect(8, 13, 16, 6);
    // Shine
    healGfx.fillStyle(0xffffff, 0.4);
    healGfx.fillRect(5, 7, 10, 2);
    healGfx.generateTexture('loot-heal', 32, 32);
    healGfx.destroy();

    // Speed boost (energy drink can)
    const speedGfx = this.make.graphics({ x: 0, y: 0 });
    // Can body
    speedGfx.fillStyle(0xddaa00);
    speedGfx.fillRoundedRect(8, 4, 16, 24, 3);
    // Label stripe
    speedGfx.fillStyle(0xff6600);
    speedGfx.fillRect(8, 12, 16, 8);
    // Lightning bolt on label
    speedGfx.fillStyle(0xffff00);
    speedGfx.fillTriangle(16, 12, 12, 18, 15, 17);
    speedGfx.fillTriangle(17, 17, 20, 17, 16, 22);
    // Can top
    speedGfx.fillStyle(0xcccccc);
    speedGfx.fillRoundedRect(10, 3, 12, 3, 1);
    // Metallic shine
    speedGfx.fillStyle(0xffffff, 0.2);
    speedGfx.fillRect(10, 5, 3, 20);
    speedGfx.generateTexture('loot-speed', 32, 32);
    speedGfx.destroy();

    // Damage boost (red potion with skull)
    const dmgGfx = this.make.graphics({ x: 0, y: 0 });
    // Bottle body
    dmgGfx.fillStyle(0x661111);
    dmgGfx.fillRoundedRect(8, 10, 16, 20, 4);
    // Red liquid
    dmgGfx.fillStyle(0xcc2200, 0.8);
    dmgGfx.fillRoundedRect(10, 14, 12, 14, 3);
    // Glow
    dmgGfx.fillStyle(0xff4400, 0.4);
    dmgGfx.fillRoundedRect(12, 16, 8, 8, 2);
    // Neck
    dmgGfx.fillStyle(0x661111);
    dmgGfx.fillRect(13, 5, 6, 7);
    // Cork
    dmgGfx.fillStyle(0x8a6a3a);
    dmgGfx.fillRect(13, 3, 6, 4);
    // Skull icon
    dmgGfx.fillStyle(0xffffff, 0.6);
    dmgGfx.fillCircle(16, 19, 4);
    dmgGfx.fillRect(14, 23, 4, 3);
    // Shine
    dmgGfx.fillStyle(0xffffff, 0.2);
    dmgGfx.fillRect(11, 12, 2, 12);
    dmgGfx.generateTexture('loot-damage', 32, 32);
    dmgGfx.destroy();

    // Loot glow (soft radial glow)
    const glowGfx = this.make.graphics({ x: 0, y: 0 });
    for (let gr = 20; gr > 0; gr -= 2) {
      const a = 0.02 + (20 - gr) * 0.01;
      glowGfx.fillStyle(0xffff88, a);
      glowGfx.fillCircle(20, 20, gr);
    }
    glowGfx.generateTexture('loot-glow', 40, 40);
    glowGfx.destroy();

    // Apple monster — loaded from real photo in preload()

    // Cloud platform
    const platGfx = this.make.graphics({ x: 0, y: 0 });
    platGfx.fillStyle(0xffffff, 0.9);
    platGfx.fillEllipse(50, 25, 100, 40);
    platGfx.fillEllipse(30, 20, 50, 30);
    platGfx.fillEllipse(70, 20, 50, 30);
    platGfx.generateTexture('cloud-platform', 100, 50);
    platGfx.destroy();

    // === REALISTIC TREE (small) ===
    const treeGfx = this.make.graphics({ x: 0, y: 0 });
    // Trunk with bark texture
    treeGfx.fillStyle(0x3d2b1f);
    treeGfx.fillRect(13, 28, 6, 16);
    treeGfx.fillStyle(0x4d3828, 0.6);
    treeGfx.fillRect(14, 28, 2, 16);
    treeGfx.lineStyle(1, 0x2a1a0f, 0.4);
    treeGfx.lineBetween(14, 30, 17, 30);
    treeGfx.lineBetween(13, 35, 18, 35);
    treeGfx.lineBetween(14, 39, 17, 40);
    // Root flare
    treeGfx.fillStyle(0x3d2b1f);
    treeGfx.fillTriangle(11, 44, 16, 38, 21, 44);
    // Canopy — multiple layered leaf clusters
    treeGfx.fillStyle(0x1a5c1a, 0.9);
    treeGfx.fillCircle(16, 20, 13);
    treeGfx.fillStyle(0x226b22, 0.85);
    treeGfx.fillCircle(12, 16, 9);
    treeGfx.fillCircle(20, 17, 10);
    treeGfx.fillStyle(0x2d8a2d, 0.7);
    treeGfx.fillCircle(16, 12, 8);
    treeGfx.fillCircle(10, 22, 7);
    treeGfx.fillCircle(22, 21, 7);
    // Light hitting top
    treeGfx.fillStyle(0x44aa44, 0.35);
    treeGfx.fillCircle(14, 10, 5);
    treeGfx.fillCircle(19, 13, 4);
    // Dark underside
    treeGfx.fillStyle(0x0d3a0d, 0.3);
    treeGfx.fillCircle(16, 26, 8);
    treeGfx.generateTexture('tree-decor', 32, 48);
    treeGfx.destroy();

    // === REALISTIC MOUNTAIN ===
    const mtnGfx = this.make.graphics({ x: 0, y: 0 });
    // Back mountain (darker, further)
    mtnGfx.fillStyle(0x4a4a5a);
    mtnGfx.fillTriangle(20, 150, 80, 15, 150, 150);
    // Shading on left face
    mtnGfx.fillStyle(0x3a3a4a, 0.6);
    mtnGfx.fillTriangle(20, 150, 80, 15, 80, 150);
    // Front mountain (lighter)
    mtnGfx.fillStyle(0x5a5a6a);
    mtnGfx.fillTriangle(70, 150, 140, 8, 220, 150);
    // Light face (right side)
    mtnGfx.fillStyle(0x6a6a7a, 0.7);
    mtnGfx.fillTriangle(140, 8, 220, 150, 140, 150);
    // Rocky texture lines
    mtnGfx.lineStyle(1, 0x3a3a4a, 0.3);
    for (let ml = 0; ml < 8; ml++) {
      const my1 = 30 + ml * 15;
      mtnGfx.lineBetween(80 + ml * 3, my1, 110 + ml * 8, my1 + 10);
    }
    // Snow caps with shading
    mtnGfx.fillStyle(0xf0f0ff);
    mtnGfx.fillTriangle(140, 8, 128, 40, 152, 38);
    mtnGfx.fillStyle(0xddddef, 0.8);
    mtnGfx.fillTriangle(140, 8, 128, 40, 140, 35);
    mtnGfx.fillStyle(0xeeeeff);
    mtnGfx.fillTriangle(80, 15, 68, 45, 90, 42);
    mtnGfx.fillStyle(0xd8d8ea, 0.7);
    mtnGfx.fillTriangle(80, 15, 68, 45, 80, 40);
    // Treeline at base
    for (let t = 0; t < 12; t++) {
      const tx = 30 + t * 16;
      const ty = 135 + (t % 3) * 4;
      mtnGfx.fillStyle(0x1a4a1a, 0.5);
      mtnGfx.fillTriangle(tx, ty + 15, tx + 5, ty, tx + 10, ty + 15);
    }
    mtnGfx.generateTexture('mountain', 240, 150);
    mtnGfx.destroy();

    // === REALISTIC LAKE ===
    const lakeGfx = this.make.graphics({ x: 0, y: 0 });
    // Shore/bank (sandy edge)
    lakeGfx.fillStyle(0x8a7a5a, 0.4);
    lakeGfx.fillEllipse(100, 60, 200, 120);
    // Deep water edge
    lakeGfx.fillStyle(0x143850, 0.85);
    lakeGfx.fillEllipse(100, 60, 185, 108);
    // Mid water
    lakeGfx.fillStyle(0x1a5570, 0.8);
    lakeGfx.fillEllipse(100, 60, 160, 90);
    // Shallow water center
    lakeGfx.fillStyle(0x2a7a9a, 0.7);
    lakeGfx.fillEllipse(100, 58, 130, 70);
    // Surface reflection (sky)
    lakeGfx.fillStyle(0x6ab8d8, 0.3);
    lakeGfx.fillEllipse(80, 48, 70, 35);
    // Sun glint
    lakeGfx.fillStyle(0xffffff, 0.2);
    lakeGfx.fillEllipse(75, 42, 25, 10);
    // Ripple lines
    lakeGfx.lineStyle(1, 0x8ac8e8, 0.15);
    for (let r = 0; r < 5; r++) {
      const ry = 40 + r * 10;
      const rx = 60 + r * 5;
      lakeGfx.beginPath();
      lakeGfx.arc(100, 60, 30 + r * 12, -0.5, 0.5, false);
      lakeGfx.strokePath();
    }
    lakeGfx.generateTexture('lake', 200, 120);
    lakeGfx.destroy();

    // === REALISTIC BIG TREE ===
    const bigTreeGfx = this.make.graphics({ x: 0, y: 0 });
    // Trunk with bark detail
    bigTreeGfx.fillStyle(0x2e1e12);
    bigTreeGfx.fillRect(34, 55, 22, 55);
    // Bark texture
    bigTreeGfx.fillStyle(0x3d2b1f, 0.7);
    bigTreeGfx.fillRect(37, 55, 8, 55);
    bigTreeGfx.fillStyle(0x4a3828, 0.5);
    bigTreeGfx.fillRect(48, 55, 5, 55);
    // Bark lines
    bigTreeGfx.lineStyle(1, 0x1a0f08, 0.4);
    for (let bl = 0; bl < 8; bl++) {
      const by = 58 + bl * 7;
      bigTreeGfx.lineBetween(35, by, 55, by + 2);
    }
    // Root flare
    bigTreeGfx.fillStyle(0x2e1e12);
    bigTreeGfx.fillTriangle(28, 110, 45, 90, 45, 110);
    bigTreeGfx.fillTriangle(45, 110, 45, 92, 62, 110);
    // Branch stubs
    bigTreeGfx.fillStyle(0x3d2b1f);
    bigTreeGfx.fillRect(28, 62, 8, 4);
    bigTreeGfx.fillRect(54, 70, 8, 3);
    // Canopy — dense, multi-layered, realistic
    // Back shadow layer
    bigTreeGfx.fillStyle(0x0d3a0d, 0.6);
    bigTreeGfx.fillCircle(45, 42, 36);
    // Main canopy mass
    bigTreeGfx.fillStyle(0x1a5a1a, 0.95);
    bigTreeGfx.fillCircle(45, 35, 34);
    bigTreeGfx.fillStyle(0x1e6a1e, 0.9);
    bigTreeGfx.fillCircle(32, 30, 22);
    bigTreeGfx.fillCircle(58, 32, 24);
    bigTreeGfx.fillCircle(45, 22, 20);
    // Mid-tone highlights
    bigTreeGfx.fillStyle(0x2a7a2a, 0.7);
    bigTreeGfx.fillCircle(38, 18, 14);
    bigTreeGfx.fillCircle(55, 24, 12);
    bigTreeGfx.fillCircle(28, 35, 13);
    bigTreeGfx.fillCircle(60, 38, 11);
    // Bright leaf clusters (sunlit top)
    bigTreeGfx.fillStyle(0x3da83d, 0.5);
    bigTreeGfx.fillCircle(40, 12, 8);
    bigTreeGfx.fillCircle(52, 16, 7);
    bigTreeGfx.fillCircle(35, 20, 6);
    // Yellow-green sun highlights
    bigTreeGfx.fillStyle(0x6ac86a, 0.25);
    bigTreeGfx.fillCircle(42, 10, 5);
    bigTreeGfx.fillCircle(50, 14, 4);
    // Dark underside
    bigTreeGfx.fillStyle(0x0a2a0a, 0.4);
    bigTreeGfx.fillCircle(45, 48, 18);
    bigTreeGfx.fillCircle(32, 44, 12);
    bigTreeGfx.fillCircle(58, 45, 12);
    bigTreeGfx.generateTexture('big-tree', 90, 110);
    bigTreeGfx.destroy();

    // === REALISTIC ROCK ===
    const rockGfx = this.make.graphics({ x: 0, y: 0 });
    // Main rock body — irregular shape via overlapping ellipses
    rockGfx.fillStyle(0x6a6a78);
    rockGfx.fillEllipse(24, 26, 40, 28);
    rockGfx.fillStyle(0x5a5a68);
    rockGfx.fillEllipse(20, 22, 30, 24);
    rockGfx.fillStyle(0x7a7a88, 0.7);
    rockGfx.fillEllipse(28, 24, 22, 18);
    // Light face (top-left highlight)
    rockGfx.fillStyle(0x9a9aaa, 0.4);
    rockGfx.fillEllipse(18, 18, 16, 12);
    // Specular highlight
    rockGfx.fillStyle(0xbbbbcc, 0.25);
    rockGfx.fillEllipse(16, 16, 6, 4);
    // Dark crevice
    rockGfx.lineStyle(1, 0x3a3a48, 0.5);
    rockGfx.lineBetween(14, 28, 28, 26);
    rockGfx.lineBetween(22, 22, 32, 24);
    // Moss spots
    rockGfx.fillStyle(0x4a6a3a, 0.3);
    rockGfx.fillCircle(28, 30, 5);
    rockGfx.fillCircle(16, 26, 3);
    rockGfx.generateTexture('rock', 48, 40);
    rockGfx.destroy();

    // === REALISTIC ATTACK EFFECTS ===
    // Bullet with tracer glow
    const bulletGfx = this.make.graphics({ x: 0, y: 0 });
    // Tracer trail
    bulletGfx.fillStyle(0xff8800, 0.3);
    bulletGfx.fillEllipse(8, 8, 16, 6);
    // Bullet core
    bulletGfx.fillStyle(0xffcc44);
    bulletGfx.fillCircle(8, 8, 4);
    // Hot center
    bulletGfx.fillStyle(0xffffff, 0.7);
    bulletGfx.fillCircle(8, 8, 2);
    bulletGfx.generateTexture('bullet', 16, 16);
    bulletGfx.destroy();

    // Knife with metallic blade
    const stabGfx = this.make.graphics({ x: 0, y: 0 });
    // Blade
    stabGfx.fillStyle(0xaaaabb);
    stabGfx.fillTriangle(12, 0, 8, 16, 16, 16);
    // Blade edge highlight
    stabGfx.fillStyle(0xddddee, 0.6);
    stabGfx.fillTriangle(12, 0, 10, 12, 14, 12);
    // Blade shadow
    stabGfx.fillStyle(0x777788, 0.5);
    stabGfx.fillTriangle(12, 4, 14, 16, 16, 16);
    // Guard
    stabGfx.fillStyle(0x886622);
    stabGfx.fillRect(8, 16, 8, 3);
    // Handle
    stabGfx.fillStyle(0x553311);
    stabGfx.fillRoundedRect(10, 18, 4, 8, 1);
    // Handle wrap
    stabGfx.lineStyle(1, 0x443300, 0.5);
    stabGfx.lineBetween(10, 20, 14, 20);
    stabGfx.lineBetween(10, 23, 14, 23);
    stabGfx.generateTexture('knife', 24, 28);
    stabGfx.destroy();

    // Explosion with multiple layers
    const explGfx = this.make.graphics({ x: 0, y: 0 });
    // Outer shockwave
    explGfx.fillStyle(0xff4400, 0.3);
    explGfx.fillCircle(32, 32, 32);
    // Fire ring
    explGfx.fillStyle(0xff6600, 0.6);
    explGfx.fillCircle(32, 32, 24);
    // Orange core
    explGfx.fillStyle(0xff8800, 0.8);
    explGfx.fillCircle(32, 32, 16);
    // Yellow hot center
    explGfx.fillStyle(0xffcc00, 0.9);
    explGfx.fillCircle(32, 32, 10);
    // White flash center
    explGfx.fillStyle(0xffffff, 0.7);
    explGfx.fillCircle(32, 32, 5);
    // Spark fragments
    for (let s = 0; s < 8; s++) {
      const angle = (s / 8) * Math.PI * 2;
      const sx = 32 + Math.cos(angle) * (18 + (s % 3) * 4);
      const sy = 32 + Math.sin(angle) * (18 + (s % 3) * 4);
      explGfx.fillStyle(0xffaa00, 0.6);
      explGfx.fillCircle(sx, sy, 2);
    }
    explGfx.generateTexture('explosion', 64, 64);
    explGfx.destroy();

    // ====== APPLE MONSTER ======
    const appleCanvas = document.createElement('canvas');
    appleCanvas.width = 256;
    appleCanvas.height = 256;
    const ac = appleCanvas.getContext('2d')!;
    ac.imageSmoothingEnabled = true;
    const acx = 128, acy = 140;

    // Apple body — gradient green sphere
    const appleG = ac.createRadialGradient(acx - 20, acy - 30, 10, acx, acy, 100);
    appleG.addColorStop(0, '#a8e060');
    appleG.addColorStop(0.3, '#6abf30');
    appleG.addColorStop(0.7, '#3a8a18');
    appleG.addColorStop(1, '#1a5a08');
    ac.fillStyle = appleG;
    ac.beginPath();
    // Apple shape — wider at middle, dimpled top/bottom
    ac.moveTo(acx, acy - 90);
    ac.bezierCurveTo(acx + 60, acy - 95, acx + 100, acy - 50, acx + 95, acy);
    ac.bezierCurveTo(acx + 100, acy + 50, acx + 60, acy + 90, acx, acy + 85);
    ac.bezierCurveTo(acx - 60, acy + 90, acx - 100, acy + 50, acx - 95, acy);
    ac.bezierCurveTo(acx - 100, acy - 50, acx - 60, acy - 95, acx, acy - 90);
    ac.fill();

    // Specular highlight
    const specG = ac.createRadialGradient(acx - 30, acy - 40, 0, acx - 30, acy - 40, 50);
    specG.addColorStop(0, 'rgba(255,255,255,0.4)');
    specG.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    specG.addColorStop(1, 'rgba(255,255,255,0)');
    ac.fillStyle = specG;
    ac.beginPath();
    ac.ellipse(acx - 30, acy - 40, 40, 50, -0.3, 0, Math.PI * 2);
    ac.fill();

    // Stem
    ac.strokeStyle = '#5a3a1a';
    ac.lineWidth = 6;
    ac.lineCap = 'round';
    ac.beginPath();
    ac.moveTo(acx, acy - 88);
    ac.bezierCurveTo(acx + 2, acy - 100, acx + 5, acy - 110, acx + 3, acy - 118);
    ac.stroke();
    // Leaf
    ac.fillStyle = '#4a9a20';
    ac.beginPath();
    ac.moveTo(acx + 5, acy - 105);
    ac.bezierCurveTo(acx + 25, acy - 115, acx + 40, acy - 105, acx + 30, acy - 95);
    ac.bezierCurveTo(acx + 20, acy - 98, acx + 10, acy - 100, acx + 5, acy - 105);
    ac.fill();

    // Angry eyes — white sclera
    for (const [ex, flip] of [[acx - 28, 1], [acx + 28, -1]] as [number, number][]) {
      ac.fillStyle = '#ffffff';
      ac.beginPath();
      ac.ellipse(ex, acy - 20, 18, 14, 0, 0, Math.PI * 2);
      ac.fill();
      // Iris
      ac.fillStyle = '#880000';
      ac.beginPath();
      ac.arc(ex + flip * 3, acy - 18, 9, 0, Math.PI * 2);
      ac.fill();
      // Pupil
      ac.fillStyle = '#000000';
      ac.beginPath();
      ac.arc(ex + flip * 4, acy - 18, 5, 0, Math.PI * 2);
      ac.fill();
      // Eye glint
      ac.fillStyle = 'rgba(255,255,255,0.8)';
      ac.beginPath();
      ac.arc(ex + flip * 6, acy - 22, 2.5, 0, Math.PI * 2);
      ac.fill();
      // Angry eyebrow
      ac.strokeStyle = '#1a1a1a';
      ac.lineWidth = 5;
      ac.lineCap = 'round';
      ac.beginPath();
      ac.moveTo(ex - 18 * flip, acy - 40);
      ac.lineTo(ex + 18 * flip, acy - 32);
      ac.stroke();
    }

    // Angry mouth — jagged teeth
    ac.fillStyle = '#440000';
    ac.beginPath();
    ac.ellipse(acx, acy + 25, 35, 22, 0, 0, Math.PI);
    ac.fill();
    // Teeth
    ac.fillStyle = '#eeeeee';
    for (let t = 0; t < 6; t++) {
      const tx = acx - 28 + t * 11;
      ac.beginPath();
      ac.moveTo(tx, acy + 25);
      ac.lineTo(tx + 6, acy + 25);
      ac.lineTo(tx + 3, acy + 38);
      ac.closePath();
      ac.fill();
    }

    this.textures.addCanvas('apple-monster', appleCanvas);

    // ============================================
    // === SAN ANTONIO CITY TEXTURES ===
    // ============================================

    // === ASPHALT ROAD TILE ===
    const roadGfx = this.make.graphics({ x: 0, y: 0 });
    roadGfx.fillStyle(0x3a3a3a);
    roadGfx.fillRect(0, 0, 128, 128);
    // Worn lighter patches
    roadGfx.fillStyle(0x4a4a4a, 0.4);
    roadGfx.fillEllipse(40, 60, 50, 30);
    roadGfx.fillEllipse(90, 30, 35, 25);
    // Gravel texture
    for (let i = 0; i < 30; i++) {
      const gx = Math.random() * 128;
      const gy = Math.random() * 128;
      roadGfx.fillStyle(0x505050, 0.3);
      roadGfx.fillCircle(gx, gy, 1);
    }
    // Yellow center dashed line
    roadGfx.fillStyle(0xccaa00, 0.8);
    roadGfx.fillRect(0, 62, 25, 4);
    roadGfx.fillRect(35, 62, 25, 4);
    roadGfx.fillRect(70, 62, 25, 4);
    roadGfx.fillRect(105, 62, 23, 4);
    // White edge lines
    roadGfx.fillStyle(0xdddddd, 0.6);
    roadGfx.fillRect(0, 4, 128, 2);
    roadGfx.fillRect(0, 122, 128, 2);
    // Crack details
    roadGfx.lineStyle(1, 0x2a2a2a, 0.5);
    roadGfx.lineBetween(30, 20, 45, 50);
    roadGfx.lineBetween(80, 80, 95, 110);
    roadGfx.generateTexture('ground-road', 128, 128);
    roadGfx.destroy();

    // === DRY TEXAS DIRT ===
    const dirtGfx = this.make.graphics({ x: 0, y: 0 });
    dirtGfx.fillStyle(0x9a8060);
    dirtGfx.fillRect(0, 0, 128, 128);
    // Darker earth
    dirtGfx.fillStyle(0x7a6a48, 0.4);
    dirtGfx.fillEllipse(40, 50, 50, 40);
    dirtGfx.fillEllipse(100, 90, 35, 28);
    // Lighter sandy patches
    dirtGfx.fillStyle(0xb0a070, 0.3);
    dirtGfx.fillEllipse(70, 30, 40, 25);
    dirtGfx.fillEllipse(20, 100, 30, 22);
    // Pebbles
    for (let i = 0; i < 15; i++) {
      dirtGfx.fillStyle(0x6a5a3a, 0.4);
      dirtGfx.fillCircle(Math.random() * 128, Math.random() * 128, 1.5);
    }
    // Dry grass tufts
    dirtGfx.lineStyle(1, 0x6a7a3a, 0.25);
    dirtGfx.lineBetween(25, 45, 27, 38);
    dirtGfx.lineBetween(80, 70, 82, 63);
    dirtGfx.lineBetween(50, 100, 52, 93);
    dirtGfx.generateTexture('ground-dirt', 128, 128);
    dirtGfx.destroy();

    // === SHOP BUILDING ===
    const shopGfx = this.make.graphics({ x: 0, y: 0 });
    // Shadow
    shopGfx.fillStyle(0x000000, 0.2);
    shopGfx.fillRect(6, 6, 74, 94);
    // Main walls — tan adobe
    shopGfx.fillStyle(0xd4b896);
    shopGfx.fillRect(0, 0, 74, 90);
    // Darker base
    shopGfx.fillStyle(0xb89a78, 0.6);
    shopGfx.fillRect(0, 70, 74, 20);
    // Roof edge
    shopGfx.fillStyle(0x8a4a2a);
    shopGfx.fillRect(0, 0, 74, 6);
    shopGfx.fillStyle(0x6a3a1a, 0.7);
    shopGfx.fillRect(0, 0, 74, 3);
    // Windows — 2 rows
    for (let wy = 0; wy < 2; wy++) {
      for (let wx = 0; wx < 3; wx++) {
        const winX = 8 + wx * 22;
        const winY = 14 + wy * 28;
        shopGfx.fillStyle(0x1a2a3a, 0.9);
        shopGfx.fillRect(winX, winY, 14, 16);
        // Glass reflection
        shopGfx.fillStyle(0x4488aa, 0.4);
        shopGfx.fillRect(winX + 1, winY + 1, 6, 8);
        // Frame
        shopGfx.lineStyle(1, 0x8a7a6a, 0.6);
        shopGfx.strokeRect(winX, winY, 14, 16);
        // Divider
        shopGfx.lineBetween(winX + 7, winY, winX + 7, winY + 16);
      }
    }
    // Door
    shopGfx.fillStyle(0x4a3020);
    shopGfx.fillRect(28, 68, 18, 22);
    shopGfx.fillStyle(0x5a4030, 0.5);
    shopGfx.fillRect(30, 70, 6, 18);
    // Awning
    shopGfx.fillStyle(0xcc4422, 0.7);
    shopGfx.fillRect(4, 10, 66, 5);
    shopGfx.fillStyle(0xee6644, 0.5);
    shopGfx.fillRect(4, 10, 22, 5);
    shopGfx.fillRect(48, 10, 22, 5);
    // Wall texture
    shopGfx.lineStyle(0.5, 0xc0a880, 0.15);
    for (let ly = 0; ly < 9; ly++) {
      shopGfx.lineBetween(0, ly * 10 + 8, 74, ly * 10 + 8);
    }
    shopGfx.generateTexture('building-shop', 80, 100);
    shopGfx.destroy();

    // === TALL COMMERCIAL BUILDING ===
    const tallGfx = this.make.graphics({ x: 0, y: 0 });
    // Shadow
    tallGfx.fillStyle(0x000000, 0.2);
    tallGfx.fillRect(6, 6, 84, 134);
    // Main structure — concrete
    tallGfx.fillStyle(0xc0b8a8);
    tallGfx.fillRect(0, 0, 84, 130);
    // Darker ground floor
    tallGfx.fillStyle(0x8a8070, 0.5);
    tallGfx.fillRect(0, 110, 84, 20);
    // Roof
    tallGfx.fillStyle(0x6a6a6a);
    tallGfx.fillRect(0, 0, 84, 5);
    // Rooftop equipment
    tallGfx.fillStyle(0x4a4a4a);
    tallGfx.fillRect(10, 2, 12, 4);
    tallGfx.fillRect(60, 1, 8, 5);
    // Window grid — 4 columns, 6 rows
    for (let wy = 0; wy < 6; wy++) {
      for (let wx = 0; wx < 4; wx++) {
        const winX = 6 + wx * 20;
        const winY = 10 + wy * 17;
        tallGfx.fillStyle(0x1a2a4a, 0.85);
        tallGfx.fillRect(winX, winY, 14, 11);
        // Blue glass reflection
        tallGfx.fillStyle(0x3a6a9a, 0.4);
        tallGfx.fillRect(winX + 1, winY + 1, 6, 5);
        // Frame
        tallGfx.lineStyle(0.5, 0x9a9a8a, 0.5);
        tallGfx.strokeRect(winX, winY, 14, 11);
      }
    }
    // Ground floor entrance
    tallGfx.fillStyle(0x2a2a2a);
    tallGfx.fillRect(30, 112, 24, 18);
    tallGfx.fillStyle(0x4488aa, 0.3);
    tallGfx.fillRect(32, 114, 20, 14);
    // AC units on side
    tallGfx.fillStyle(0x7a7a7a);
    tallGfx.fillRect(76, 30, 7, 6);
    tallGfx.fillRect(76, 60, 7, 6);
    tallGfx.fillRect(76, 90, 7, 6);
    tallGfx.generateTexture('building-tall', 90, 140);
    tallGfx.destroy();

    // === THE ALAMO ===
    const alamoGfx = this.make.graphics({ x: 0, y: 0 });
    // Shadow
    alamoGfx.fillStyle(0x000000, 0.15);
    alamoGfx.fillRect(8, 8, 192, 122);
    // Main facade — warm limestone
    alamoGfx.fillStyle(0xd8c8a0);
    alamoGfx.fillRect(10, 30, 180, 95);
    // Weathered patches
    alamoGfx.fillStyle(0xc0b088, 0.4);
    alamoGfx.fillEllipse(60, 70, 50, 40);
    alamoGfx.fillEllipse(140, 80, 45, 35);
    // The famous curved parapet (top)
    alamoGfx.fillStyle(0xd8c8a0);
    // Central raised section
    alamoGfx.fillRect(60, 10, 80, 25);
    // Curved top — built with overlapping arcs
    alamoGfx.fillEllipse(100, 10, 80, 24);
    // Side wings
    alamoGfx.fillRect(10, 20, 50, 15);
    alamoGfx.fillRect(140, 20, 50, 15);
    // Stone block texture
    alamoGfx.lineStyle(0.5, 0xb0a080, 0.2);
    for (let by = 0; by < 12; by++) {
      alamoGfx.lineBetween(10, 30 + by * 8, 190, 30 + by * 8);
    }
    for (let bx = 0; bx < 12; bx++) {
      alamoGfx.lineBetween(10 + bx * 16, 30, 10 + bx * 16, 125);
    }
    // Columns / pilasters
    for (const cx of [40, 70, 130, 160]) {
      alamoGfx.fillStyle(0xc8b898, 0.6);
      alamoGfx.fillRect(cx - 3, 30, 6, 95);
      alamoGfx.fillStyle(0xe0d0b0, 0.3);
      alamoGfx.fillRect(cx - 1, 32, 2, 90);
    }
    // Central arched doorway
    alamoGfx.fillStyle(0x2a1a0a, 0.9);
    alamoGfx.fillRect(85, 65, 30, 60);
    alamoGfx.fillStyle(0x2a1a0a, 0.9);
    alamoGfx.fillCircle(100, 65, 15);
    // Door wood detail
    alamoGfx.fillStyle(0x3a2a1a, 0.5);
    alamoGfx.fillRect(87, 70, 12, 55);
    // Upper arched windows
    for (const wx of [45, 75, 125, 155]) {
      alamoGfx.fillStyle(0x1a1a2a, 0.8);
      alamoGfx.fillRect(wx - 6, 38, 12, 18);
      alamoGfx.fillCircle(wx, 38, 6);
      alamoGfx.fillStyle(0x3a5a7a, 0.3);
      alamoGfx.fillRect(wx - 4, 40, 4, 10);
    }
    // Cross on top
    alamoGfx.fillStyle(0xa09070);
    alamoGfx.fillRect(98, -2, 4, 14);
    alamoGfx.fillRect(94, 2, 12, 4);
    // Age/weathering dark patches
    alamoGfx.fillStyle(0x8a7a5a, 0.15);
    alamoGfx.fillEllipse(30, 100, 30, 20);
    alamoGfx.fillEllipse(170, 60, 25, 18);
    alamoGfx.generateTexture('alamo', 200, 130);
    alamoGfx.destroy();

    // === CACTUS ===
    const cactusGfx = this.make.graphics({ x: 0, y: 0 });
    // Base mound
    cactusGfx.fillStyle(0x8a7a50, 0.4);
    cactusGfx.fillEllipse(12, 45, 18, 6);
    // Main body
    cactusGfx.fillStyle(0x2a6a2a);
    cactusGfx.fillRect(9, 10, 6, 36);
    cactusGfx.fillStyle(0x2a6a2a);
    cactusGfx.fillCircle(12, 10, 3);
    // Right arm
    cactusGfx.fillStyle(0x2a6a2a);
    cactusGfx.fillRect(15, 18, 6, 4);
    cactusGfx.fillRect(18, 10, 4, 12);
    cactusGfx.fillCircle(20, 10, 2);
    // Left arm
    cactusGfx.fillStyle(0x2a6a2a);
    cactusGfx.fillRect(3, 24, 6, 4);
    cactusGfx.fillRect(3, 16, 4, 12);
    cactusGfx.fillCircle(5, 16, 2);
    // Highlight left side
    cactusGfx.fillStyle(0x3a8a3a, 0.4);
    cactusGfx.fillRect(9, 12, 2, 30);
    cactusGfx.fillRect(3, 18, 2, 8);
    // Shadow right side
    cactusGfx.fillStyle(0x1a4a1a, 0.4);
    cactusGfx.fillRect(14, 12, 1, 30);
    // Spine lines
    cactusGfx.lineStyle(0.5, 0x5a9a5a, 0.3);
    cactusGfx.lineBetween(11, 12, 11, 42);
    cactusGfx.lineBetween(13, 14, 13, 40);
    cactusGfx.generateTexture('cactus', 24, 48);
    cactusGfx.destroy();

    // === PALM TREE ===
    const palmGfx = this.make.graphics({ x: 0, y: 0 });
    // Trunk — thin, slightly curved
    palmGfx.fillStyle(0x6a4a2a);
    palmGfx.fillRect(17, 30, 6, 58);
    // Trunk rings
    palmGfx.lineStyle(1, 0x5a3a1a, 0.4);
    for (let r = 0; r < 10; r++) {
      palmGfx.lineBetween(17, 34 + r * 5, 23, 34 + r * 5);
    }
    // Trunk highlight
    palmGfx.fillStyle(0x8a6a4a, 0.4);
    palmGfx.fillRect(17, 30, 2, 58);
    // Trunk base flare
    palmGfx.fillStyle(0x5a3a1a);
    palmGfx.fillTriangle(14, 88, 20, 80, 26, 88);
    // Fronds — fan of leaves
    const frondAngles = [-2.2, -1.5, -0.8, -0.3, 0.3, 0.8, 1.5, 2.2];
    for (const angle of frondAngles) {
      const tipX = 20 + Math.cos(angle) * 18;
      const tipY = 28 + Math.sin(angle) * (angle > 0 ? 12 : -10);
      const droop = Math.abs(angle) > 1.2;
      // Frond shape
      palmGfx.fillStyle(droop ? 0x2a5a1a : 0x3a7a2a, droop ? 0.7 : 0.9);
      palmGfx.fillTriangle(20, 30, tipX - 2, tipY, tipX + 2, tipY + 3);
      // Sunlit fronds on top
      if (angle > -1 && angle < 1) {
        palmGfx.fillStyle(0x4a9a3a, 0.35);
        palmGfx.fillTriangle(20, 30, tipX - 1, tipY, tipX + 1, tipY + 2);
      }
    }
    // Coconuts
    palmGfx.fillStyle(0x5a3a1a);
    palmGfx.fillCircle(18, 30, 2);
    palmGfx.fillCircle(22, 31, 2);
    palmGfx.generateTexture('palm-tree', 40, 90);
    palmGfx.destroy();

    // === PARKED CAR (top-down) ===
    const carGfx = this.make.graphics({ x: 0, y: 0 });
    // Shadow
    carGfx.fillStyle(0x000000, 0.2);
    carGfx.fillEllipse(24, 16, 46, 22);
    // Car body
    carGfx.fillStyle(0x4488aa);
    carGfx.fillRoundedRect(2, 4, 44, 20, 4);
    // Roof (lighter)
    carGfx.fillStyle(0x66aacc, 0.5);
    carGfx.fillRoundedRect(14, 7, 20, 14, 3);
    // Windshield
    carGfx.fillStyle(0x88bbdd, 0.7);
    carGfx.fillRect(12, 8, 8, 12);
    // Rear window
    carGfx.fillStyle(0x88bbdd, 0.6);
    carGfx.fillRect(34, 9, 6, 10);
    // Side windows
    carGfx.fillStyle(0x6699bb, 0.5);
    carGfx.fillRect(22, 5, 10, 3);
    carGfx.fillRect(22, 20, 10, 3);
    // Wheels
    carGfx.fillStyle(0x1a1a1a);
    carGfx.fillCircle(10, 4, 3);
    carGfx.fillCircle(10, 24, 3);
    carGfx.fillCircle(38, 4, 3);
    carGfx.fillCircle(38, 24, 3);
    // Headlights
    carGfx.fillStyle(0xffffcc, 0.6);
    carGfx.fillCircle(3, 8, 2);
    carGfx.fillCircle(3, 20, 2);
    // Taillights
    carGfx.fillStyle(0xff4444, 0.5);
    carGfx.fillCircle(45, 8, 2);
    carGfx.fillCircle(45, 20, 2);
    carGfx.generateTexture('car', 48, 28);
    carGfx.destroy();

    // === WOODEN FENCE ===
    const fenceGfx = this.make.graphics({ x: 0, y: 0 });
    // Horizontal rail
    fenceGfx.fillStyle(0x7a5a30);
    fenceGfx.fillRect(0, 8, 64, 4);
    fenceGfx.fillRect(0, 18, 64, 4);
    // Vertical planks
    for (let p = 0; p < 8; p++) {
      const px = p * 8;
      fenceGfx.fillStyle(0x8a6a40);
      fenceGfx.fillRect(px + 1, 2, 6, 20);
      // Wood grain
      fenceGfx.lineStyle(0.5, 0x6a4a20, 0.3);
      fenceGfx.lineBetween(px + 3, 2, px + 3, 22);
      // Top point
      fenceGfx.fillStyle(0x8a6a40);
      fenceGfx.fillTriangle(px + 1, 2, px + 4, 0, px + 7, 2);
    }
    fenceGfx.generateTexture('fence-wood', 64, 24);
    fenceGfx.destroy();

    // === RIVER TILE ===
    const riverGfx = this.make.graphics({ x: 0, y: 0 });
    // Sandy banks
    riverGfx.fillStyle(0x9a8a60, 0.5);
    riverGfx.fillRect(0, 0, 128, 64);
    // Deep water
    riverGfx.fillStyle(0x1a6080, 0.9);
    riverGfx.fillRect(4, 6, 120, 52);
    // Mid water
    riverGfx.fillStyle(0x2a7090, 0.7);
    riverGfx.fillEllipse(64, 32, 110, 42);
    // Lighter center
    riverGfx.fillStyle(0x3a8aaa, 0.5);
    riverGfx.fillEllipse(64, 30, 80, 30);
    // Sky reflection
    riverGfx.fillStyle(0x6ab8d8, 0.2);
    riverGfx.fillEllipse(50, 26, 40, 16);
    // Ripple lines
    riverGfx.lineStyle(1, 0x8ac8e8, 0.15);
    for (let r = 0; r < 5; r++) {
      riverGfx.lineBetween(10 + r * 8, 20 + r * 4, 50 + r * 12, 18 + r * 3);
    }
    // Sun glint
    riverGfx.fillStyle(0xffffff, 0.15);
    riverGfx.fillEllipse(45, 24, 12, 5);
    riverGfx.generateTexture('river-tile', 128, 64);
    riverGfx.destroy();
  }

  private render3DCharacters(chars: { name: string; shirt: number; shirtHi: number; pants: number; skin: number; skinHi: number; skinDk: number; hair: number; hairHi: number; hat: number; irisCol: string; lipTint: number; browThick: number; gender: string }[]): void {
    // Set up offscreen Three.js renderer
    const S = 512;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(S, S);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    // Camera — portrait framing
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.3, 3.2);
    camera.lookAt(0, 1.0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0x667788, 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(3, 5, 4);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
    fill.position.set(-2, 3, -1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xaabbdd, 0.3);
    rim.position.set(0, 2, -3);
    scene.add(rim);

    // Ground disc for shadow
    const groundGeo = new THREE.CircleGeometry(2, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];

      // Clear previous character from scene
      const toRemove: THREE.Object3D[] = [];
      scene.traverse((obj) => { if ((obj as any)._charPart) toRemove.push(obj); });
      toRemove.forEach(obj => { obj.parent?.remove(obj); });

      // Build 3D character
      const charGroup = this.build3DCharacter(c);
      (charGroup as any)._charPart = true;
      charGroup.traverse((child) => { (child as any)._charPart = true; });
      scene.add(charGroup);

      // Slight pose — turned a bit
      charGroup.rotation.y = 0.25;

      // Render portrait
      renderer.render(scene, camera);

      // Copy to canvas for Phaser texture
      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(renderer.domElement, 0, 0);

      this.textures.addCanvas(`char-${i}`, canvas);

      // Walk cycle frames — render character in different poses
      const FCOUNT = 16;
      const FS = 96;
      const smallRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      smallRenderer.setSize(FS, FS);
      smallRenderer.setClearColor(0x000000, 0);

      const smallCam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      smallCam.position.set(0, 1.2, 3.5);
      smallCam.lookAt(0, 0.9, 0);

      for (let frame = 0; frame < FCOUNT; frame++) {
        const isIdle = frame === 0;
        const phase = ((frame - 1) / (FCOUNT - 1)) * Math.PI * 2;
        const sinP = isIdle ? 0 : Math.sin(phase);

        // Animate legs
        charGroup.rotation.y = 0.0;
        const leftThigh = charGroup.getObjectByName('leftThigh');
        const rightThigh = charGroup.getObjectByName('rightThigh');
        const leftShin = charGroup.getObjectByName('leftShin');
        const rightShin = charGroup.getObjectByName('rightShin');
        const leftUpperArm = charGroup.getObjectByName('leftUpperArm');
        const rightUpperArm = charGroup.getObjectByName('rightUpperArm');
        const torso = charGroup.getObjectByName('torso');

        if (leftThigh) leftThigh.rotation.x = sinP * 0.5;
        if (rightThigh) rightThigh.rotation.x = -sinP * 0.5;
        if (leftShin) leftShin.rotation.x = isIdle ? 0 : Math.max(0, -sinP) * 0.4;
        if (rightShin) rightShin.rotation.x = isIdle ? 0 : Math.max(0, sinP) * 0.4;
        if (leftUpperArm) leftUpperArm.rotation.x = -sinP * 0.4;
        if (rightUpperArm) rightUpperArm.rotation.x = sinP * 0.4;
        if (torso) torso.rotation.y = sinP * 0.05;

        smallRenderer.render(scene, smallCam);

        const fc = document.createElement('canvas');
        fc.width = FS;
        fc.height = FS;
        const fctx = fc.getContext('2d')!;
        fctx.drawImage(smallRenderer.domElement, 0, 0);
        this.textures.addCanvas(`char-${i}-f${frame}`, fc);
      }

      // Reset pose
      const leftThigh = charGroup.getObjectByName('leftThigh');
      const rightThigh = charGroup.getObjectByName('rightThigh');
      const leftShin = charGroup.getObjectByName('leftShin');
      const rightShin = charGroup.getObjectByName('rightShin');
      const leftUpperArm = charGroup.getObjectByName('leftUpperArm');
      const rightUpperArm = charGroup.getObjectByName('rightUpperArm');
      if (leftThigh) leftThigh.rotation.x = 0;
      if (rightThigh) rightThigh.rotation.x = 0;
      if (leftShin) leftShin.rotation.x = 0;
      if (rightShin) rightShin.rotation.x = 0;
      if (leftUpperArm) leftUpperArm.rotation.x = 0;
      if (rightUpperArm) rightUpperArm.rotation.x = 0;

      smallRenderer.dispose();

      // Animations
      this.anims.create({
        key: `char-${i}-idle`,
        frames: [{ key: `char-${i}-f0` }],
        frameRate: 1,
        repeat: -1,
      });
      const runFrames: { key: string }[] = [];
      for (let f = 1; f < FCOUNT; f++) runFrames.push({ key: `char-${i}-f${f}` });
      this.anims.create({
        key: `char-${i}-run`,
        frames: runFrames,
        frameRate: 20,
        repeat: -1,
      });
    }

    renderer.dispose();
  }

  private build3DCharacter(c: { shirt: number; pants: number; skin: number; hair: number; irisCol: string; hat: number; gender: string }): THREE.Group {
    const shirtMat = new THREE.MeshStandardMaterial({ color: c.shirt });
    const skinMat = new THREE.MeshStandardMaterial({ color: c.skin });
    const pantsMat = new THREE.MeshStandardMaterial({ color: c.pants });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const hairMat = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.9 });

    const root = new THREE.Group();

    // Hips
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 }));
    hips.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0xc8a848, metalness: 0.6 }));
    buckle.position.z = 0.15;
    hips.add(buckle);

    // Torso
    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0.05;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtMat);
    chest.position.y = 0.3;
    chest.castShadow = true;
    torso.add(chest);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat);
    neck.position.y = 0.6;
    torso.add(neck);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.72;
    torso.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
    head.scale.set(1, 1.1, 0.95);
    head.castShadow = true;
    headGroup.add(head);

    // Eyes
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const eyeColorNum = parseInt(c.irisCol.replace('#', ''), 16);
    const irisMat = new THREE.MeshStandardMaterial({ color: eyeColorNum });
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
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), skinMat);
    nose.position.set(0, -0.01, 0.19);
    headGroup.add(nose);

    // Mouth
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xcc5555 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.01), mouthMat);
    mouth.position.set(0, -0.07, 0.18);
    headGroup.add(mouth);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), skinMat);
      ear.position.set(side * 0.2, 0.02, 0);
      ear.scale.set(0.4, 1, 0.7);
      headGroup.add(ear);
    }

    // Hair or cap
    if (c.hat === 0) {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        hairMat
      );
      hair.position.y = 0.04;
      headGroup.add(hair);
      // Girls get longer hair
      if (c.gender === 'girl') {
        const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.35, 0.12), hairMat);
        longHair.position.set(0, -0.12, -0.06);
        headGroup.add(longHair);
      }
    } else {
      const capMat = new THREE.MeshStandardMaterial({ color: c.hat === 1 ? 0x7a5500 : 0x4a5a2a });
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
        capMat
      );
      cap.position.y = 0.04;
      headGroup.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.015, 10, 1, false, -Math.PI * 0.5, Math.PI), capMat);
      brim.position.set(0, 0.1, 0.18);
      brim.rotation.x = -0.3;
      headGroup.add(brim);
    }

    // Arms
    const leftUpperArm = new THREE.Group();
    leftUpperArm.name = 'leftUpperArm';
    leftUpperArm.position.set(-0.3, 0.48, 0);
    torso.add(leftUpperArm);
    leftUpperArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
    leftUpperArm.children[0].position.y = -0.14;
    const leftForearm = new THREE.Group();
    leftForearm.position.y = -0.28;
    leftUpperArm.add(leftForearm);
    leftForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
    leftForearm.children[0].position.y = -0.12;
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
    lHand.position.y = -0.27;
    leftForearm.add(lHand);

    const rightUpperArm = new THREE.Group();
    rightUpperArm.name = 'rightUpperArm';
    rightUpperArm.position.set(0.3, 0.48, 0);
    torso.add(rightUpperArm);
    rightUpperArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
    rightUpperArm.children[0].position.y = -0.14;
    const rightForearm = new THREE.Group();
    rightForearm.position.y = -0.28;
    rightUpperArm.add(rightForearm);
    rightForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
    rightForearm.children[0].position.y = -0.12;
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
    rHand.position.y = -0.27;
    rightForearm.add(rHand);

    // Legs
    const leftThigh = new THREE.Group();
    leftThigh.name = 'leftThigh';
    leftThigh.position.set(-0.12, 0, 0);
    hips.add(leftThigh);
    leftThigh.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat));
    leftThigh.children[0].position.y = -0.2;
    const leftShin = new THREE.Group();
    leftShin.name = 'leftShin';
    leftShin.position.y = -0.38;
    leftThigh.add(leftShin);
    leftShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat));
    leftShin.children[0].position.y = -0.16;
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoeMat);
    lShoe.position.set(0, -0.34, 0.04);
    leftShin.add(lShoe);

    const rightThigh = new THREE.Group();
    rightThigh.name = 'rightThigh';
    rightThigh.position.set(0.12, 0, 0);
    hips.add(rightThigh);
    rightThigh.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat));
    rightThigh.children[0].position.y = -0.2;
    const rightShin = new THREE.Group();
    rightShin.name = 'rightShin';
    rightShin.position.y = -0.38;
    rightThigh.add(rightShin);
    rightShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat));
    rightShin.children[0].position.y = -0.16;
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), shoeMat);
    rShoe.position.set(0, -0.34, 0.04);
    rightShin.add(rShoe);

    return root;
  }
}
