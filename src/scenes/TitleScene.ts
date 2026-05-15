import Phaser from 'phaser';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getCoins } from '../utils/coinStore';
import { CHAR_VISUALS } from './BattleScene';

export class TitleScene extends Phaser.Scene {
  private playerRenderer?: THREE.WebGLRenderer;
  private playerScene?: THREE.Scene;
  private playerCam?: THREE.PerspectiveCamera;
  private playerCanvas?: HTMLCanvasElement;
  private playerImg?: Phaser.GameObjects.Image;
  private playerLimbs?: {
    leftArm: THREE.Group; rightArm: THREE.Group;
    leftThigh: THREE.Group; rightThigh: THREE.Group;
    leftShin: THREE.Group; rightShin: THREE.Group;
    torso: THREE.Group; root: THREE.Group;
  };
  private runTime = 0;
  private gpAButtonPrev = false;
  private onPlayPressed?: () => void;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    // Pre-load real biome photos (grass / sand / snow) so each panel can use the matching one.
    // Once all 3 finish (or fail), render the panels.
    const baseUrl = (import.meta.env?.BASE_URL ?? '/');
    const files: { key: 'grass' | 'sand' | 'snow' | 'sand_normal' | 'snow_normal' | 'trex_skin'; src: string }[] = [
      { key: 'grass',       src: baseUrl + 'textures/grass.jpg' },
      { key: 'sand',        src: baseUrl + 'textures/sand.jpg' },
      { key: 'snow',        src: baseUrl + 'textures/snow.jpg?v=2' },
      { key: 'sand_normal', src: baseUrl + 'textures/sand_normal.jpg' },
      { key: 'snow_normal', src: baseUrl + 'textures/snow_normal.jpg?v=2' },
      { key: 'trex_skin',   src: baseUrl + 'textures/trex_skin.jpg' },
    ];
    // +1 for the T-Rex GLB model + 1 for the AR rifle GLB model
    let pending = files.length + 2;
    let rendered = false;
    const done = () => {
      if (rendered) return;
      rendered = true;
      this.renderAllPanels();
    };
    new GLTFLoader().load(baseUrl + 'models/trex.glb',
      (gltf) => { this.trexModel = gltf.scene; if (--pending <= 0) done(); },
      undefined,
      () => { if (--pending <= 0) done(); },
    );
    new GLTFLoader().load(baseUrl + 'models/ar.glb',
      (gltf) => { this.arModel = gltf.scene; if (--pending <= 0) done(); },
      undefined,
      () => { if (--pending <= 0) done(); },
    );
    for (const f of files) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (f.key === 'grass') this.grassImage = img;
        else if (f.key === 'sand') this.sandImage = img;
        else if (f.key === 'snow') this.snowImage = img;
        else if (f.key === 'sand_normal') this.sandNormalImage = img;
        else if (f.key === 'snow_normal') this.snowNormalImage = img;
        else if (f.key === 'trex_skin') this.trexSkinImage = img;
        if (--pending <= 0) done();
      };
      img.onerror = () => { if (--pending <= 0) done(); };
      img.src = f.src;
    }
  }

  private renderAllPanels(): void {
    const panelW = Math.floor(GAME_WIDTH / 4);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });

    // Render each world panel
    const worldConfigs = [
      { ground: 0x4a7a3a, sky: 0x5588cc, fog: 0x99bbdd, label: 'RANDOMSTUFF' },
      { ground: 0x2d5a1e, sky: 0x5588cc, fog: 0x99bbdd, label: 'FOREST' },
      { ground: 0xd4a843, sky: 0x66aadd, fog: 0xddcc99, label: 'DESERT' },
      { ground: 0xe8e8f0, sky: 0x8899bb, fog: 0xccddee, label: 'SNOW' },
    ];

    // Render each panel and combine into one background
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = GAME_WIDTH;
    bgCanvas.height = GAME_HEIGHT;
    const bgCtx = bgCanvas.getContext('2d')!;

    for (let i = 0; i < 4; i++) {
      const texKey = `world-panel-${i}`;
      if (this.textures.exists(texKey)) this.textures.remove(texKey);
      this.renderWorldPanel(renderer, panelW, GAME_HEIGHT, worldConfigs[i], texKey);
      this.add.image(panelW * i + panelW / 2, GAME_HEIGHT / 2, texKey)
        .setDisplaySize(panelW, GAME_HEIGHT);
      // Draw onto combined background canvas
      const panelCanvas = this.textures.get(texKey).getSourceImage() as HTMLCanvasElement;
      bgCtx.drawImage(panelCanvas, panelW * i, 0, panelW, GAME_HEIGHT);
    }

    renderer.dispose();

    // Replace forest-bg with the combined 4-world background
    if (this.textures.exists('forest-bg')) this.textures.remove('forest-bg');
    this.textures.addCanvas('forest-bg', bgCanvas);

    // Set up live animated player character
    this.setupLivePlayer();

    // White divider lines
    const lines = this.add.graphics();
    lines.lineStyle(3, 0xffffff, 0.9);
    for (let i = 1; i < 4; i++) {
      lines.lineBetween(panelW * i, 0, panelW * i, GAME_HEIGHT);
    }

    // Light overlay for readability
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.15);

    // World labels
    const labelColors = ['#ffffff', '#aaffaa', '#ffddaa', '#ccddff'];
    for (let i = 0; i < 4; i++) {
      this.add.text(panelW * i + panelW / 2, GAME_HEIGHT - 20, worldConfigs[i].label, {
        fontSize: '11px',
        fontFamily: 'Arial Black, sans-serif',
        color: labelColors[i],
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5);
    }

    // Player character image — updated every frame by the live renderer
    const charKey = 'title-player';
    if (this.textures.exists(charKey)) this.textures.remove(charKey);
    this.playerCanvas = document.createElement('canvas');
    this.playerCanvas.width = 240;
    this.playerCanvas.height = 400;
    this.textures.addCanvas(charKey, this.playerCanvas);
    this.playerImg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, charKey)
      .setDisplaySize(120, 195).setDepth(10);


    // === BIG TITLE — Fortnite style ===
    const titleGlow = this.add.text(GAME_WIDTH / 2, 55, 'FIGHTING WARS', {
      fontSize: '52px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#4488ff',
      stroke: '#0022aa',
      strokeThickness: 12,
    }).setOrigin(0.5).setAlpha(0.4);

    const title = this.add.text(GAME_WIDTH / 2, 55, 'FIGHTING WARS', {
      fontSize: '52px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#ffffff',
      stroke: '#1a3a8a',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: titleGlow,
      alpha: 0.6,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // === PLAY BUTTON ===
    const btnX = GAME_WIDTH / 2;
    const btnY = GAME_HEIGHT - 55;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x000000, 0.3);
    btnBg.fillRoundedRect(btnX - 82, btnY - 17, 164, 38, 8);
    btnBg.fillStyle(0xffcc00);
    btnBg.fillRoundedRect(btnX - 80, btnY - 18, 160, 36, 6);
    btnBg.fillStyle(0xffdd44, 0.6);
    btnBg.fillRoundedRect(btnX - 76, btnY - 16, 152, 16, 4);

    const playText = this.add.text(btnX, btnY, 'PLAY', {
      fontSize: '22px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);

    // Coin display
    const coins = getCoins();
    const coinBg = this.add.graphics();
    coinBg.fillStyle(0x000000, 0.5);
    coinBg.fillRoundedRect(GAME_WIDTH - 130, 8, 120, 26, 6);
    this.add.text(GAME_WIDTH - 70, 21, `${coins}`, {
      fontSize: '14px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffdd00',
    }).setOrigin(0.5);
    const coinIcon = this.add.graphics();
    coinIcon.fillStyle(0xffcc00);
    coinIcon.fillCircle(GAME_WIDTH - 115, 21, 8);
    coinIcon.fillStyle(0xffdd44);
    coinIcon.fillCircle(GAME_WIDTH - 115, 20, 6);
    coinIcon.fillStyle(0x000000, 0.3);
    coinIcon.fillRect(GAME_WIDTH - 117, 19, 4, 4);

    // Season info
    const seasonBg = this.add.graphics();
    seasonBg.fillStyle(0x000000, 0.5);
    seasonBg.fillRoundedRect(10, 8, 140, 26, 6);
    this.add.text(80, 21, 'SEASON 1', {
      fontSize: '13px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Play button hit zone
    const playHit = this.add.rectangle(btnX, btnY, 170, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);

    playHit.on('pointerover', () => { playText.setScale(1.05); });
    playHit.on('pointerout', () => { playText.setScale(1); });

    const triggerPlay = () => {
      if (!playHit.input) return;
      playHit.removeInteractive();
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
    };
    this.onPlayPressed = triggerPlay;
    playHit.once('pointerdown', triggerPlay);
    // Keyboard Enter/Space also starts
    this.input.keyboard?.on('keydown-ENTER', triggerPlay);
    this.input.keyboard?.on('keydown-SPACE', triggerPlay);

    this.cameras.main.fadeIn(600, 0, 0, 0);
  }


  private grassImage: HTMLImageElement | null = null;
  private sandImage: HTMLImageElement | null = null;
  private snowImage: HTMLImageElement | null = null;
  private sandNormalImage: HTMLImageElement | null = null;
  private snowNormalImage: HTMLImageElement | null = null;
  private trexSkinImage: HTMLImageElement | null = null;
  private trexModel: THREE.Group | null = null;
  private arModel: THREE.Group | null = null;

  private renderWorldPanel(
    renderer: THREE.WebGLRenderer,
    w: number, h: number,
    config: { ground: number; sky: number; fog: number; label: string },
    texKey: string,
  ): void {
    renderer.setSize(w, h);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.sky);
    scene.fog = new THREE.Fog(config.fog, 20, 80);

    const cam = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    cam.position.set(0, 3, 12);
    cam.lookAt(0, -0.5, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5, 10, 5);
    scene.add(sun);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-3, 5, -5);
    scene.add(backLight);

    // Procedural ground texture — same as BattleScene
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 256; groundCanvas.height = 256;
    const gCtx = groundCanvas.getContext('2d')!;
    if (config.label === 'RANDOMSTUFF') {
      gCtx.fillStyle = '#3d6e22'; gCtx.fillRect(0, 0, 256, 256);
      const gv = ['#4a7a28', '#336018', '#52872e', '#2e5a15', '#3a6820', '#5c9030'];
      for (let i = 0; i < 150; i++) { gCtx.fillStyle = gv[Math.floor(Math.random() * gv.length)]; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      const dv = ['#6b5230', '#7a5e38', '#5a4020', '#8a6a40'];
      for (let i = 0; i < 30; i++) { gCtx.globalAlpha = 0.5 + Math.random() * 0.5; gCtx.fillStyle = dv[Math.floor(Math.random() * dv.length)]; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 2 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      gCtx.globalAlpha = 1;
    } else if (config.label === 'FOREST') {
      gCtx.fillStyle = '#1a3a0e'; gCtx.fillRect(0, 0, 256, 256);
      const fv = ['#1e4412', '#2a5518', '#163810', '#224a14', '#0f2a08', '#2e6020'];
      for (let i = 0; i < 200; i++) { gCtx.fillStyle = fv[Math.floor(Math.random() * fv.length)]; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 12, 2 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      for (let i = 0; i < 50; i++) { gCtx.globalAlpha = 0.4 + Math.random() * 0.4; gCtx.fillStyle = Math.random() > 0.5 ? '#5a3a1a' : '#3a5a20'; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      gCtx.globalAlpha = 1;
    } else if (config.label === 'DESERT') {
      gCtx.fillStyle = '#c8a050'; gCtx.fillRect(0, 0, 256, 256);
      const sv = ['#d4aa58', '#ba9040', '#e0b868', '#a88038', '#ccaa55', '#ddc070'];
      for (let i = 0; i < 150; i++) { gCtx.fillStyle = sv[Math.floor(Math.random() * sv.length)]; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 15, 2 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      for (let i = 0; i < 20; i++) { gCtx.globalAlpha = 0.3 + Math.random() * 0.4; gCtx.fillStyle = '#8a7050'; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      gCtx.globalAlpha = 1;
    } else {
      // Snow panel — pure snow + ice tones, no dirt blotches.
      gCtx.fillStyle = '#e8e8f0'; gCtx.fillRect(0, 0, 256, 256);
      const snv = ['#dde0ea', '#f0f0f8', '#ccd0dd', '#e0e4ee', '#d0d8e8', '#f4f4fa'];
      for (let i = 0; i < 150; i++) { gCtx.fillStyle = snv[Math.floor(Math.random() * snv.length)]; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 12, 2 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      for (let i = 0; i < 10; i++) { gCtx.globalAlpha = 0.2 + Math.random() * 0.3; gCtx.fillStyle = '#aaccee'; gCtx.beginPath(); gCtx.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 2 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); gCtx.fill(); }
      gCtx.globalAlpha = 1;
    }
    let groundTexture: THREE.Texture;
    let realTile = 8;
    let normalImg: HTMLImageElement | null = null;
    let compositeCanvas: HTMLCanvasElement | null = null;

    if (config.label === 'RANDOMSTUFF' || config.label === 'FOREST') {
      realTile = 12;
      if (this.grassImage) {
        const realTex = new THREE.Texture(this.grassImage);
        realTex.wrapS = THREE.RepeatWrapping; realTex.wrapT = THREE.RepeatWrapping;
        realTex.repeat.set(realTile, realTile);
        realTex.colorSpace = THREE.SRGBColorSpace;
        realTex.needsUpdate = true;
        groundTexture = realTex;
      } else {
        const canvasTex = new THREE.CanvasTexture(groundCanvas);
        canvasTex.wrapS = THREE.RepeatWrapping; canvasTex.wrapT = THREE.RepeatWrapping;
        canvasTex.repeat.set(12, 12);
        groundTexture = canvasTex;
      }
    } else if (config.label === 'DESERT') {
      realTile = 6;
      normalImg = this.sandNormalImage;
      if (this.sandImage) {
        const realTex = new THREE.Texture(this.sandImage);
        realTex.wrapS = THREE.RepeatWrapping; realTex.wrapT = THREE.RepeatWrapping;
        realTex.repeat.set(realTile, realTile);
        realTex.colorSpace = THREE.SRGBColorSpace;
        realTex.needsUpdate = true;
        groundTexture = realTex;
      } else {
        const canvasTex = new THREE.CanvasTexture(groundCanvas);
        canvasTex.wrapS = THREE.RepeatWrapping; canvasTex.wrapT = THREE.RepeatWrapping;
        canvasTex.repeat.set(12, 12);
        groundTexture = canvasTex;
      }
    } else if (config.label === 'SNOW') {
      realTile = 5;
      normalImg = this.snowNormalImage;
      if (this.snowImage) {
        const realTex = new THREE.Texture(this.snowImage);
        realTex.wrapS = THREE.RepeatWrapping; realTex.wrapT = THREE.RepeatWrapping;
        realTex.repeat.set(realTile, realTile);
        realTex.colorSpace = THREE.SRGBColorSpace;
        realTex.needsUpdate = true;
        groundTexture = realTex;
      } else {
        const canvasTex = new THREE.CanvasTexture(groundCanvas);
        canvasTex.wrapS = THREE.RepeatWrapping; canvasTex.wrapT = THREE.RepeatWrapping;
        canvasTex.repeat.set(12, 12);
        groundTexture = canvasTex;
      }
    } else {
      const canvasTex = new THREE.CanvasTexture(groundCanvas);
      canvasTex.wrapS = THREE.RepeatWrapping; canvasTex.wrapT = THREE.RepeatWrapping;
      canvasTex.repeat.set(12, 12);
      groundTexture = canvasTex;
    }
    void compositeCanvas; // silence unused
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.95, metalness: 0 });
    if (normalImg) {
      const nrm = new THREE.Texture(normalImg);
      nrm.wrapS = THREE.RepeatWrapping;
      nrm.wrapT = THREE.RepeatWrapping;
      nrm.repeat.set(realTile, realTile);
      nrm.needsUpdate = true;
      groundMat.normalMap = nrm;
      groundMat.normalScale = new THREE.Vector2(1.2, 1.2);
    }
    groundMat.side = THREE.DoubleSide;
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const isSnow = config.label === 'SNOW';
    const isDesert = config.label === 'DESERT';
    const isForest = config.label === 'FOREST';
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xeeeef4, roughness: 0.9 });

    // Trees (all worlds except desert). Snow world keeps green pines — they look like
    // classic Christmas trees with snow caps on top.
    if (!isDesert) {
      const leafColor = isSnow ? 0x1a4a1a : isForest ? 0x1a3a0a : 0x2d5a1e;
      const leafMat = new THREE.MeshStandardMaterial({ color: leafColor });
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
      const treeCount = isForest ? 25 : 12;
      for (let i = 0; i < treeCount; i++) {
        let tx = (Math.random() - 0.5) * 16;
        // In forest, keep trees further from camera (no trees past z=6)
        let tz = isForest ? Math.random() * 8 - 2 : Math.random() * 10 - 2;
        // Keep trees away from featured objects
        if (config.label === 'RANDOMSTUFF') {
          while (Math.abs(tx) < 4 && Math.abs(tz - 4) < 4) {
            tx = (Math.random() - 0.5) * 16;
            tz = Math.random() * 10 - 2;
          }
        }
        if (isSnow) {
          // Keep trees away from the T-Rex centered at (0, 0, 0).
          let safety = 0;
          while (Math.abs(tx) < 4 && Math.abs(tz) < 4 && safety < 30) {
            tx = (Math.random() - 0.5) * 16;
            tz = Math.random() * 10 - 2;
            safety++;
          }
        }
        if (isForest) {
          while (Math.abs(tx) < 3 && Math.abs(tz - 7) < 3) {
            tx = (Math.random() - 0.5) * 16;
            tz = Math.random() * 8 - 2;
          }
        }
        const g = new THREE.Group();
        const trunkH = 1.5 + Math.random() * 2;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, trunkH, 5), trunkMat);
        trunk.position.y = trunkH / 2;
        g.add(trunk);
        const isPine = Math.random() > 0.4;
        if (isPine) {
          for (let l = 0; l < 3; l++) {
            const r = 1.2 - l * 0.3;
            const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.2, 6), leafMat);
            cone.position.y = trunkH * 0.5 + l * 0.8;
            g.add(cone);
            if (isSnow) {
              const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, 0.3, 6), snowMat);
              cap.position.y = trunkH * 0.5 + l * 0.8 + 0.5;
              g.add(cap);
            }
          }
        } else {
          const r = 0.8 + Math.random() * 0.5;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), leafMat);
          leaf.position.y = trunkH + r * 0.5;
          leaf.scale.y = 0.7;
          g.add(leaf);
          if (isSnow) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
            cap.position.y = trunkH + r * 0.5 + r * 0.3;
            cap.scale.y = 0.3;
            g.add(cap);
          }
        }
        g.position.set(tx, 0, tz);
        scene.add(g);
      }
    }

    // Desert — cacti, rocks
    if (isDesert) {
      const cactusMat = new THREE.MeshStandardMaterial({ color: 0x44882a, roughness: 0.8 });
      for (let i = 0; i < 8; i++) {
        let cx = (Math.random() - 0.5) * 12;
        let cz = Math.random() * 10 - 2;
        // Keep cacti away from the dirt bike at (0, 0, 3)
        while (Math.abs(cx) < 3 && Math.abs(cz - 3) < 3) {
          cx = (Math.random() - 0.5) * 12;
          cz = Math.random() * 10 - 2;
        }
        const g = new THREE.Group();
        const h = 1.5 + Math.random() * 2;
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, h, 6), cactusMat));
        g.children[0].position.y = h / 2;
        const armH = 0.6 + Math.random() * 0.6;
        const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, armH, 5), cactusMat);
        arm1.position.set(0.35, h * 0.5, 0); arm1.rotation.z = -0.8;
        g.add(arm1);
        if (Math.random() > 0.4) {
          const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, armH * 0.8, 5), cactusMat);
          arm2.position.set(-0.35, h * 0.4, 0); arm2.rotation.z = 0.8;
          g.add(arm2);
        }
        g.position.set(cx, 0, cz);
        scene.add(g);
      }
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x998866, roughness: 0.9 });
      for (let i = 0; i < 6; i++) {
        const rock = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 5, 4), rockMat);
        rock.scale.y = 0.5 + Math.random() * 0.3;
        rock.position.set((Math.random() - 0.5) * 10, 0.15, Math.random() * 8 - 1);
        scene.add(rock);
      }

      // Dirt bike — same model as createDirtBike() in BattleScene
      {
        const bikeColor = 0xcc2200;
        const frameMat2 = new THREE.MeshStandardMaterial({ color: bikeColor, roughness: 0.3, metalness: 0.6 });
        const blackMt = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const chromeMt = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });
        const tireMt = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
        const seatMt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const bike = new THREE.Group();
        // Front wheel
        const fwg = new THREE.Group(); fwg.position.set(0, 0.4, 1.1);
        const fTire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), tireMt);
        fTire.rotation.z = Math.PI / 2; fwg.add(fTire);
        const fRim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), chromeMt);
        fRim.rotation.z = Math.PI / 2; fwg.add(fRim);
        const fHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), chromeMt);
        fHub.rotation.z = Math.PI / 2; fwg.add(fHub);
        bike.add(fwg);
        // Rear wheel
        const rwg = new THREE.Group(); rwg.position.set(0, 0.4, -0.7);
        const rTire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 12), tireMt);
        rTire.rotation.z = Math.PI / 2; rwg.add(rTire);
        const rRim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12), chromeMt);
        rRim.rotation.z = Math.PI / 2; rwg.add(rRim);
        const rHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), chromeMt);
        rHub.rotation.z = Math.PI / 2; rwg.add(rHub);
        bike.add(rwg);
        // Frame
        const frameBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.9), frameMat2);
        frameBar.position.set(0, 0.7, 0.2); frameBar.rotation.x = 0.15; bike.add(frameBar);
        // Fork
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.08), chromeMt);
        fork.position.set(0, 0.7, 1.0); fork.rotation.x = -0.25; bike.add(fork);
        // Swingarm
        const swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), chromeMt);
        swingarm.position.set(0, 0.45, -0.3); bike.add(swingarm);
        // Handlebars
        const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), chromeMt);
        handlebar.position.set(0, 1.15, 0.9); bike.add(handlebar);
        for (const s of [-1, 1]) {
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), blackMt);
          grip.position.set(s * 0.35, 1.15, 0.9); bike.add(grip);
        }
        // Gas tank
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), frameMat2);
        tank.position.set(0, 0.95, 0.45); bike.add(tank);
        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.55), seatMt);
        seat.position.set(0, 0.9, -0.05); bike.add(seat);
        const seatTail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.25), seatMt);
        seatTail.position.set(0, 0.95, -0.35); seatTail.rotation.x = 0.3; bike.add(seatTail);
        // Engine
        const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.35), blackMt);
        engine.position.set(0, 0.5, 0.2); bike.add(engine);
        const cylinder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2),
          new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 }));
        cylinder.position.set(0.18, 0.55, 0.2); bike.add(cylinder);
        // Exhaust
        const exhaust1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), chromeMt);
        exhaust1.position.set(0.18, 0.35, -0.2); bike.add(exhaust1);
        const exhaustEnd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), blackMt);
        exhaustEnd.position.set(0.18, 0.35, -0.6); bike.add(exhaustEnd);
        // Fenders
        const fFender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), frameMat2);
        fFender.position.set(0, 0.85, 1.1); bike.add(fFender);
        const rFender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.4), frameMat2);
        rFender.position.set(0, 0.82, -0.65); bike.add(rFender);
        // Number plate
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.03),
          new THREE.MeshStandardMaterial({ color: 0xffffff }));
        plate.position.set(0, 1.25, 1.05); plate.rotation.x = -0.2; bike.add(plate);
        const numStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.035), frameMat2);
        numStripe.position.set(0, 1.24, 1.06); numStripe.rotation.x = -0.2; bike.add(numStripe);
        // Foot pegs
        for (const s of [-1, 1]) {
          const peg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.06), chromeMt);
          peg.position.set(s * 0.22, 0.35, 0.05); bike.add(peg);
        }
        bike.position.set(0, 0, 3);
        bike.rotation.y = 0.4;
        bike.scale.set(2.5, 2.5, 2.5);
        // Rider on dirt bike
        const bikeRider = this.createRider();
        bikeRider.position.set(0, 0.4, -0.05);
        bikeRider.scale.set(0.45, 0.45, 0.45);
        bike.add(bikeRider);
        scene.add(bike);
      }

    }

    // Snow world — evil snowman (matches BattleScene evil model)
    if (isSnow) {
      const sm = new THREE.Group();
      const evilSnowMat = new THREE.MeshStandardMaterial({ color: 0x8a8a95, roughness: 0.4 });
      const darkSnowMat = new THREE.MeshStandardMaterial({ color: 0x606068, roughness: 0.5 });
      const bloodMat = new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.6 });
      const iceMat = new THREE.MeshStandardMaterial({ color: 0x99bbff, transparent: true, opacity: 0.85 });
      const glowRedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });

      // Bottom ball
      const bot = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), evilSnowMat);
      bot.position.y = 1; bot.scale.y = 0.85; sm.add(bot);
      // Middle ball
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), darkSnowMat);
      mid.position.y = 2.3; sm.add(mid);
      // Head
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), evilSnowMat);
      hd.position.y = 3.2; sm.add(hd);

      // Blood drips
      for (let bd = 0; bd < 6; bd++) {
        const drip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2 + Math.random() * 0.3, 0.04), bloodMat);
        const bAngle = Math.random() * Math.PI * 2;
        drip.position.set(Math.sin(bAngle) * 0.7, 1.8 + Math.random() * 0.8, Math.cos(bAngle) * 0.7);
        sm.add(drip);
      }

      // Demonic horns
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), iceMat);
        horn.position.set(s * 0.35, 3.7, -0.1); horn.rotation.z = s * -0.4; horn.rotation.x = -0.2; sm.add(horn);
        const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
        hornTip.position.set(s * 0.48, 3.95, -0.15); hornTip.rotation.z = s * -0.5; sm.add(hornTip);
      }

      // Sharp icicle nose
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.0, 4), iceMat);
      nose.position.set(0, 3.15, 0.6); nose.rotation.x = Math.PI / 2; sm.add(nose);

      // Huge glowing red eyes with dark sockets
      for (const s of [-1, 1]) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), darkMat);
        socket.position.set(s * 0.2, 3.3, 0.45); sm.add(socket);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glowRedMat);
        eye.position.set(s * 0.2, 3.32, 0.48); sm.add(eye);
        const innerGlow = new THREE.PointLight(0xff0000, 0.5, 3);
        innerGlow.position.set(s * 0.2, 3.32, 0.5); sm.add(innerGlow);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), darkMat);
        brow.position.set(s * 0.2, 3.5, 0.47); brow.rotation.z = s * 0.5; sm.add(brow);
      }

      // Jagged mouth with glowing red inside
      const mouthHole = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0x220000 }));
      mouthHole.scale.set(1.2, 0.5, 0.4);
      mouthHole.position.set(0, 2.95, 0.5); sm.add(mouthHole);
      const mouthGlow = new THREE.PointLight(0xff2200, 0.8, 2);
      mouthGlow.position.set(0, 2.95, 0.4); sm.add(mouthGlow);
      // Top teeth
      for (let t = 0; t < 7; t++) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22 + Math.random() * 0.1, 4), iceMat);
        fang.position.set((t - 3) * 0.07, 3.05, 0.53); fang.rotation.x = Math.PI; sm.add(fang);
      }
      // Bottom teeth
      for (let t = 0; t < 7; t++) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.18 + Math.random() * 0.08, 4), iceMat);
        fang.position.set((t - 3) * 0.07, 2.87, 0.53); sm.add(fang);
      }
      // Vampire fangs
      for (const s of [-1, 1]) {
        const bigFang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.35, 4),
          new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.9 }));
        bigFang.position.set(s * 0.2, 2.78, 0.53); bigFang.rotation.x = Math.PI; sm.add(bigFang);
      }

      // Claw arms
      const stickMat = new THREE.MeshStandardMaterial({ color: 0x2a1808 });
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 5), stickMat);
        arm.position.set(s * 1.1, 2.4, 0); arm.rotation.z = s * -0.8; sm.add(arm);
        for (let c = 0; c < 4; c++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.5, 4), iceMat);
          claw.position.set(s * (1.8 + c * 0.08), 2.8 - c * 0.08, (c - 1.5) * 0.08);
          claw.rotation.z = s * -0.3; claw.rotation.x = 0.2; sm.add(claw);
        }
      }

      // Evil top hat with skull
      const hatMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
      const hat1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), hatMat);
      hat1.position.y = 3.75; hat1.rotation.z = 0.15; sm.add(hat1);
      const hat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.9, 8), hatMat);
      hat2.position.y = 4.2; hat2.rotation.z = 0.15; sm.add(hat2);
      const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 8),
        new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
      hatBand.position.y = 3.85; hatBand.rotation.z = 0.15; sm.add(hatBand);
      const skullMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.3 });
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), skullMat);
      skull.position.set(0, 3.85, 0.36); skull.scale.set(1, 1.2, 0.5); sm.add(skull);
      for (const s of [-1, 1]) {
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), darkMat);
        hole.position.set(s * 0.04, 3.87, 0.38); sm.add(hole);
      }

      // Cracks with red glow
      const crackMat = new THREE.MeshBasicMaterial({ color: 0x441111 });
      for (let cr = 0; cr < 8; cr++) {
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.5 + Math.random() * 0.4, 0.025), crackMat);
        const angle = Math.random() * Math.PI * 2;
        const yy = 1.0 + Math.random() * 1.8;
        crack.position.set(Math.sin(angle) * (yy > 2 ? 0.55 : 0.85), yy, Math.cos(angle) * (yy > 2 ? 0.55 : 0.85));
        crack.rotation.z = (Math.random() - 0.5) * 0.6; sm.add(crack);
      }

      // Ice shards
      for (let sp = 0; sp < 5; sp++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + Math.random() * 0.3, 4), iceMat);
        const spAngle = Math.random() * Math.PI * 2;
        const spY = 1.2 + Math.random() * 1.5;
        const spR = spY > 2.3 ? 0.65 : 0.9;
        shard.position.set(Math.sin(spAngle) * spR, spY, Math.cos(spAngle) * spR);
        shard.rotation.z = Math.sin(spAngle) * 0.5; shard.rotation.x = Math.cos(spAngle) * 0.5;
        sm.add(shard);
      }

      // Small rock buttons on chest
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
      const rockMatDk = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95 });
      const buttonY = [1.85, 2.25, 2.65];
      const buttonZ = [0.78, 0.82, 0.78];
      for (let cb = 0; cb < 3; cb++) {
        const rock = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), cb % 2 === 0 ? rockMat : rockMatDk);
        rock.scale.set(1.1, 0.9, 1.0);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.position.set(0, buttonY[cb], buttonZ[cb]); sm.add(rock);
      }

      sm.position.set(1.5, 0, 6);
      sm.scale.set(0.7, 0.7, 0.7);
      scene.add(sm);

      // Polar bear next to snowman — same model as createAnimalRide('bear') in BattleScene
      {
        const bearColor = 0xf0f0f0, bellyColor = 0xffffff;
        const bearMat = new THREE.MeshStandardMaterial({ color: bearColor, roughness: 0.8 });
        const bellyMt = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.85 });
        const darkMt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
        const pb = new THREE.Group();
        const bodyGrp = new THREE.Group();
        bodyGrp.position.y = 1.2; pb.add(bodyGrp);
        const bW = 1.2, bH = 1.0, bL = 2.2;
        bodyGrp.add(new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bL), bearMat));
        const bellyM = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.8, bH * 0.3, bL * 0.7), bellyMt);
        bellyM.position.y = -bH * 0.35; bodyGrp.add(bellyM);
        // Shoulder hump
        const hump = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.7, 0.3, 0.6), bearMat);
        hump.position.set(0, bH * 0.55, bL * 0.2); bodyGrp.add(hump);
        // Legs with pivots
        const legH = 0.55, legW = 0.24;
        for (const side of [-1, 1]) {
          for (const fb of [-1, 1]) {
            const thighPivot = new THREE.Group();
            thighPivot.position.set(side * bW * 0.35, -bH * 0.5, fb * bL * 0.35);
            bodyGrp.add(thighPivot);
            const thigh = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW * 1.2), bearMat);
            thigh.position.y = -legH * 0.5; thighPivot.add(thigh);
            const shinPivot = new THREE.Group();
            shinPivot.position.y = -legH; thighPivot.add(shinPivot);
            const shin = new THREE.Mesh(new THREE.BoxGeometry(legW * 0.8, legH * 0.8, legW), bearMat);
            shin.position.y = -legH * 0.4; shinPivot.add(shin);
            const hf = new THREE.Mesh(new THREE.BoxGeometry(legW * 1.1, 0.1, legW * 1.3), darkMt);
            hf.position.y = -legH * 0.8; shinPivot.add(hf);
          }
        }
        // Neck
        const neckBase = new THREE.Group();
        neckBase.position.set(0, bH * 0.3, bL * 0.45);
        neckBase.rotation.x = -0.15;
        bodyGrp.add(neckBase);
        const neckH = 0.35, nkW = 0.5;
        const nk = new THREE.Mesh(new THREE.BoxGeometry(nkW, neckH, nkW * 0.8), bearMat);
        nk.position.y = neckH * 0.5; neckBase.add(nk);
        // Head
        const neckMid = new THREE.Group();
        neckMid.position.y = neckH; neckBase.add(neckMid);
        const hdW = 0.55, hdH = 0.45, hdL = 0.45;
        const headM = new THREE.Mesh(new THREE.BoxGeometry(hdW, hdH, hdL), bearMat);
        headM.position.z = hdL * 0.3; neckMid.add(headM);
        // Muzzle — same 0xc8a070 as BattleScene bear
        const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.8 });
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(hdW * 0.45, 10, 8), muzzleMat);
        muzzle.scale.set(1, 0.8, 1.1);
        muzzle.position.set(0, -hdH * 0.15, hdL * 0.35); neckMid.add(muzzle);
        const bearNose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), darkMt);
        bearNose.position.set(0, hdH * 0.0, hdL * 0.35 + hdW * 0.45); neckMid.add(bearNose);
        // Jaw
        const jawPiv = new THREE.Group();
        jawPiv.position.set(0, -hdH * 0.35, hdL * 0.35); neckMid.add(jawPiv);
        const snW = hdW * 0.7, snL = 0.25;
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.9, 0.08, snL * 0.8), muzzleMat);
        jawPiv.add(jaw);
        // Eyes
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
          eye.position.set(s * hdW * 0.48, hdH * 0.1, hdL * 0.35); neckMid.add(eye);
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4),
            new THREE.MeshBasicMaterial({ color: 0x111100 }));
          pupil.position.set(s * hdW * 0.5, hdH * 0.1, hdL * 0.35 + 0.025); neckMid.add(pupil);
        }
        // Ears
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), bearMat);
          ear.position.set(s * hdW * 0.4, hdH * 0.5 + 0.04, hdL * 0.1); neckMid.add(ear);
        }
        // Short stubby tail
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), bearMat);
        tail.position.set(0, 0, -bL * 0.48); bodyGrp.add(tail);
        // Position next to snowman
        pb.position.set(-1.5, 0, 5);
        pb.rotation.y = 0.3;
        pb.scale.set(1.2, 1.2, 1.2);
        // Rider on polar bear
        const pbRider = this.createRider();
        pbRider.position.set(0, 1.2, 0.4);
        pbRider.scale.set(0.7, 0.7, 0.7);
        pb.add(pbRider);
        scene.add(pb);
      }

      // Snowflakes
      const snowGeo = new THREE.BufferGeometry();
      const sPos = new Float32Array(500 * 3);
      for (let i = 0; i < 500; i++) {
        sPos[i * 3] = (Math.random() - 0.5) * 20;
        sPos[i * 3 + 1] = Math.random() * 10;
        sPos[i * 3 + 2] = (Math.random() - 0.5) * 15;
      }
      snowGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0.9 }));
      scene.add(snowPts);
    }

    // Forest bear — same model as createAnimalRide('bear', 0x5a3a1a, 0x7a5a3a)
    if (isForest) {
      const bearColor = 0x5a3a1a, bellyColor = 0x7a5a3a;
      const bearMat2 = new THREE.MeshStandardMaterial({ color: bearColor, roughness: 0.8 });
      const bellyMt2 = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.85 });
      const darkMt3 = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
      const fb = new THREE.Group();
      const bodyGrp = new THREE.Group();
      bodyGrp.position.y = 1.2; fb.add(bodyGrp);
      const bW = 1.2, bH = 1.0, bL = 2.2;
      bodyGrp.add(new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bL), bearMat2));
      const bellyM2 = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.8, bH * 0.3, bL * 0.7), bellyMt2);
      bellyM2.position.y = -bH * 0.35; bodyGrp.add(bellyM2);
      const hump2 = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.7, 0.3, 0.6), bearMat2);
      hump2.position.set(0, bH * 0.55, bL * 0.2); bodyGrp.add(hump2);
      const legH2 = 0.55, legW2 = 0.24;
      for (const side of [-1, 1]) {
        for (const fbb of [-1, 1]) {
          const thighPivot = new THREE.Group();
          thighPivot.position.set(side * bW * 0.35, -bH * 0.5, fbb * bL * 0.35);
          bodyGrp.add(thighPivot);
          const thigh = new THREE.Mesh(new THREE.BoxGeometry(legW2, legH2, legW2 * 1.2), bearMat2);
          thigh.position.y = -legH2 * 0.5; thighPivot.add(thigh);
          const shinPivot = new THREE.Group();
          shinPivot.position.y = -legH2; thighPivot.add(shinPivot);
          const shin = new THREE.Mesh(new THREE.BoxGeometry(legW2 * 0.8, legH2 * 0.8, legW2), bearMat2);
          shin.position.y = -legH2 * 0.4; shinPivot.add(shin);
          const hf = new THREE.Mesh(new THREE.BoxGeometry(legW2 * 1.1, 0.1, legW2 * 1.3), darkMt3);
          hf.position.y = -legH2 * 0.8; shinPivot.add(hf);
        }
      }
      const neckBase2 = new THREE.Group();
      neckBase2.position.set(0, bH * 0.3, bL * 0.45);
      neckBase2.rotation.x = -0.15;
      bodyGrp.add(neckBase2);
      const neckH2 = 0.35, nkW2 = 0.5;
      const nk2 = new THREE.Mesh(new THREE.BoxGeometry(nkW2, neckH2, nkW2 * 0.8), bearMat2);
      nk2.position.y = neckH2 * 0.5; neckBase2.add(nk2);
      const neckMid2 = new THREE.Group();
      neckMid2.position.y = neckH2; neckBase2.add(neckMid2);
      const hdW2 = 0.55, hdH2 = 0.45, hdL2 = 0.45;
      const headM2 = new THREE.Mesh(new THREE.BoxGeometry(hdW2, hdH2, hdL2), bearMat2);
      headM2.position.z = hdL2 * 0.3; neckMid2.add(headM2);
      const muzzleMat2 = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.8 });
      const muzzle2 = new THREE.Mesh(new THREE.SphereGeometry(hdW2 * 0.45, 10, 8), muzzleMat2);
      muzzle2.scale.set(1, 0.8, 1.1);
      muzzle2.position.set(0, -hdH2 * 0.15, hdL2 * 0.35); neckMid2.add(muzzle2);
      const bearNose2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), darkMt3);
      bearNose2.position.set(0, hdH2 * 0.0, hdL2 * 0.35 + hdW2 * 0.45); neckMid2.add(bearNose2);
      const jawPiv2 = new THREE.Group();
      jawPiv2.position.set(0, -hdH2 * 0.35, hdL2 * 0.35); neckMid2.add(jawPiv2);
      const snW2 = hdW2 * 0.7, snL2 = 0.25;
      const jaw2 = new THREE.Mesh(new THREE.BoxGeometry(snW2 * 0.9, 0.08, snL2 * 0.8), muzzleMat2);
      jawPiv2.add(jaw2);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
        eye.position.set(s * hdW2 * 0.48, hdH2 * 0.1, hdL2 * 0.35); neckMid2.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4),
          new THREE.MeshBasicMaterial({ color: 0x111100 }));
        pupil.position.set(s * hdW2 * 0.5, hdH2 * 0.1, hdL2 * 0.35 + 0.025); neckMid2.add(pupil);
      }
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), bearMat2);
        ear.position.set(s * hdW2 * 0.4, hdH2 * 0.5 + 0.04, hdL2 * 0.1); neckMid2.add(ear);
      }
      const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), bearMat2);
      tail2.position.set(0, 0, -bL * 0.48); bodyGrp.add(tail2);
      fb.position.set(0, 0, 7);
      fb.rotation.y = 0.3;
      fb.scale.set(1.2, 1.2, 1.2);
      // Rider on bear
      const bearRider = this.createRider();
      bearRider.position.set(0, 1.2, 0.4);
      bearRider.scale.set(0.7, 0.7, 0.7);
      fb.add(bearRider);
      scene.add(fb);
    }

    // Grass tufts
    if (config.label === 'RANDOMSTUFF' || isForest) {
      const grassColors = isForest ? [0x1a4a0a, 0x2a5a18, 0x1a3a0a] : [0x3a8a2a, 0x4a9a3a, 0x2a7a1a];
      for (let i = 0; i < 40; i++) {
        const gc = grassColors[Math.floor(Math.random() * grassColors.length)];
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3 + Math.random() * 0.2, 3),
          new THREE.MeshStandardMaterial({ color: gc, roughness: 0.9 }));
        blade.position.set((Math.random() - 0.5) * 12, 0.1, Math.random() * 10 - 2);
        scene.add(blade);
      }
    }

    // Randomstuff — rocks (no road)
    if (config.label === 'RANDOMSTUFF') {
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x777766, roughness: 0.9 });
      for (let i = 0; i < 5; i++) {
        const rock = new THREE.Mesh(new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 5, 4), rockMat);
        rock.scale.y = 0.5;
        rock.position.set((Math.random() - 0.5) * 10, 0.1, Math.random() * 8 - 1);
        scene.add(rock);
      }

      // T-Rex — use real GLB model if loaded, fallback to procedural model otherwise
      if (this.trexModel) {
        // SkeletonUtils.clone() so the rig is properly cloned (the regular .clone() shares bones
        // and produces messed-up sizes/poses).
        const trex = cloneSkinned(this.trexModel) as THREE.Object3D;
        // Direct scale — set how big the T-Rex is on the front cover panel.
        const trexScale = 0.3;
        trex.scale.setScalar(trexScale);
        trex.position.set(0, 0, 0);
        trex.rotation.y = -0.4; // flipped 180° again
        scene.add(trex);
        // Add a bot riding on top.
        const trexRider = this.createRider();
        trexRider.scale.setScalar(0.7);
        trexRider.position.set(0, 2.8, 0);
        trexRider.rotation.y = -0.4;
        scene.add(trexRider);
      } else {
        const bodyCol = 0x4a3a28, lightCol = 0x6a5a3a;
        const bellyCol = lightCol + 0x201810;
        const scaleCol = bodyCol - 0x101010;
        const clawCol = 0x1a1a10;
        // Real iguana-skin photo for the body — preloaded so it's ready before the panel snapshot.
        let trexSkin: THREE.Texture | null = null;
        if (this.trexSkinImage) {
          trexSkin = new THREE.Texture(this.trexSkinImage);
          trexSkin.wrapS = trexSkin.wrapT = THREE.RepeatWrapping;
          trexSkin.repeat.set(3, 3);
          trexSkin.colorSpace = THREE.SRGBColorSpace;
          trexSkin.needsUpdate = true;
        }
        const dm = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, map: trexSkin || undefined });
        const sm2 = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 });
        const trex = new THREE.Group();
        // Body
        const bodyGrp = new THREE.Group();
        bodyGrp.position.y = 2.4; trex.add(bodyGrp);
        bodyGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 3.0), dm(bodyCol + 0x101008)));
        const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 2.6), dm(bodyCol));
        bodyTop.position.y = 0.8; bodyGrp.add(bodyTop);
        for (const s of [-1, 1]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 2.4), dm(bodyCol + 0x101008));
          side.position.set(s * 0.85, 0.1, 0); bodyGrp.add(side);
          const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.8), dm(bodyCol));
          shoulder.position.set(s * 0.75, 0.5, 0.8); bodyGrp.add(shoulder);
        }
        const bellyM3 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.4), dm(bellyCol));
        bellyM3.position.y = -0.7; bodyGrp.add(bellyM3);
        for (let si = -4; si <= 5; si++) {
          const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), dm(scaleCol));
          spine.position.set(0, 1.0, si * 0.28); bodyGrp.add(spine);
        }
        // Neck
        const neckB = new THREE.Group();
        neckB.position.set(0, 0.3, 1.5); bodyGrp.add(neckB);
        neckB.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), dm(bodyCol + 0x101008)));
        const neckM = new THREE.Group();
        neckM.position.set(0, 0.4, 0.4); neckB.add(neckM);
        neckM.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), dm(lightCol)));
        const dewlap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.5), dm(bellyCol));
        dewlap.position.set(0, -0.45, 0.1); neckB.add(dewlap);
        // Head
        const headGrp = new THREE.Group();
        headGrp.position.set(0, 0.6, 0.5); neckM.add(headGrp);
        headGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), dm(bodyCol + 0x101008)));
        const skullM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), dm(bodyCol));
        skullM.position.z = 0.4; headGrp.add(skullM);
        const snout2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), dm(bodyCol + 0x101008));
        snout2.position.z = 0.8; headGrp.add(snout2);
        const snoutTip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.3), dm(lightCol));
        snoutTip.position.z = 1.15; headGrp.add(snoutTip);
        for (const s of [-1, 1]) {
          const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.5), dm(scaleCol));
          brow.position.set(s * 0.4, 0.4, 0.2); headGrp.add(brow);
        }
        // Eyes
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), sm2(0xeeeedd));
          eye.position.set(s * 0.48, 0.22, 0.32); headGrp.add(eye);
          const iris = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), sm2(0xddcc44));
          iris.position.set(s * 0.48, 0.22, 0.42); headGrp.add(iris);
          const pup = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.01), sm2(0x111100));
          pup.position.set(s * 0.48, 0.22, 0.425); headGrp.add(pup);
        }
        // Nostrils
        for (const s of [-1, 1]) {
          const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), dm(bodyCol));
          nostril.position.set(s * 0.16, 0.1, 1.28); headGrp.add(nostril);
        }
        // Jaw
        const jawP = new THREE.Group();
        jawP.position.set(0, -0.3, -0.1); headGrp.add(jawP);
        const jawMain = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.2), dm(lightCol));
        jawMain.position.set(0, -0.1, 0.5); jawP.add(jawMain);
        const jawTip2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), dm(bodyCol + 0x101008));
        jawTip2.position.set(0, -0.1, 1.15); jawP.add(jawTip2);
        // Teeth
        const teethMat = sm2(0xeeeedd);
        const topSizes = [0.06, 0.1, 0.14, 0.18, 0.2, 0.18, 0.2, 0.18, 0.14, 0.1, 0.06];
        for (let ti = 0; ti < topSizes.length; ti++) {
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, topSizes[ti], 5), teethMat);
          tooth.position.set(-0.3 + ti * 0.06, -0.42, 0.3 + Math.sin(ti * 0.6) * 0.35);
          tooth.rotation.x = Math.PI; headGrp.add(tooth);
        }
        for (let ti = 0; ti < 9; ti++) {
          const h2 = 0.06 + Math.sin(ti * 0.8) * 0.06;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, h2, 5), teethMat);
          tooth.position.set(-0.24 + ti * 0.06, 0.08, 0.3 + Math.sin(ti * 0.6) * 0.3);
          jawP.add(tooth);
        }
        // Tail
        let tailParent: THREE.Object3D = bodyGrp;
        for (let ti = 0; ti < 8; ti++) {
          const sc = 1 - ti * 0.1;
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, ti === 0 ? -1.5 : -0.55);
          tailParent.add(pivot);
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.55 * sc, 0.45 * sc, 0.6), dm(ti % 2 === 0 ? bodyCol + 0x101008 : bodyCol));
          pivot.add(seg);
          tailParent = pivot;
        }
        // Legs
        for (const side of [-1, 1]) {
          const hipB = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), dm(bodyCol + 0x101008));
          hipB.position.set(side * 0.7, 2.0, -0.2); trex.add(hipB);
          const thighP = new THREE.Group();
          thighP.position.set(side * 0.7, 1.8, -0.2); trex.add(thighP);
          const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.65), dm(bodyCol + 0x101008));
          thigh.position.y = -0.65; thighP.add(thigh);
          const shinP = new THREE.Group();
          shinP.position.y = -1.3; thighP.add(shinP);
          const shin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.4), dm(bodyCol));
          shin.position.y = -0.55; shinP.add(shin);
          const footP = new THREE.Group();
          footP.position.y = -1.1; shinP.add(footP);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.7), dm(bodyCol));
          foot.position.set(0, -0.08, 0.15); footP.add(foot);
          for (let c = -1; c <= 1; c++) {
            const toe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), dm(bodyCol + 0x101008));
            toe.position.set(c * 0.14, -0.08, 0.5); footP.add(toe);
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), sm2(clawCol));
            claw.position.set(c * 0.14, -0.1, 0.72); claw.rotation.x = Math.PI / 2 + 0.2; footP.add(claw);
          }
        }
        // Real tiny T-Rex arms — comically small, like the actual dino
        for (const side of [-1, 1]) {
          const armP = new THREE.Group();
          armP.position.set(side * 0.55, 2.95, 1.1); trex.add(armP);
          const upArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.08), dm(lightCol));
          upArm.position.y = -0.09; armP.add(upArm);
          const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.06), dm(bodyCol + 0x101008));
          forearm.position.set(0, -0.24, 0.03); armP.add(forearm);
          for (const f of [-1, 1]) {
            const finger = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), dm(bodyCol));
            finger.position.set(f * 0.025, -0.33, 0.03); armP.add(finger);
            const fClaw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 3), sm2(clawCol));
            fClaw.position.set(f * 0.025, -0.38, 0.03); fClaw.rotation.x = Math.PI; armP.add(fClaw);
          }
          armP.rotation.z = side * 0.5; armP.rotation.x = -0.3;
        }
        // Back ridges
        for (let ri = -3; ri <= 4; ri++) {
          const h2 = 0.15 + Math.sin((ri + 3) * 0.4) * 0.1;
          const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.07, h2, 4), dm(scaleCol));
          ridge.position.set(0, 3.35, -0.3 + ri * 0.35); trex.add(ridge);
        }
        trex.position.set(0, 0, 4);
        trex.rotation.y = 0.4;
        trex.scale.set(1.0, 1.0, 1.0);
        // Rider on T-Rex
        const trexRider = this.createRider();
        trexRider.position.set(0, 2.5, -0.2);
        trexRider.scale.set(0.8, 0.8, 0.8);
        trex.add(trexRider);
        scene.add(trex);
      }
    }

    // Forest — mushrooms, logs
    if (isForest) {
      const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.95 });
      for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 2, 6), logMat);
        log.rotation.z = Math.PI / 2;
        log.position.set((Math.random() - 0.5) * 10, 0.15, Math.random() * 8 - 1);
        log.rotation.y = Math.random() * Math.PI;
        scene.add(log);
      }
      const mushroomCapMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });
      const mushroomStemMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.7 });
      for (let i = 0; i < 5; i++) {
        const mg = new THREE.Group();
        mg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 5), mushroomStemMat));
        mg.children[0].position.y = 0.08;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), mushroomCapMat);
        cap.position.y = 0.15; mg.add(cap);
        mg.position.set((Math.random() - 0.5) * 10, 0, Math.random() * 8 - 1);
        scene.add(mg);
      }
    }

    // Per-world character palettes so each panel has different-looking people
    type Pal = { shirt: number; pants: number; skin: number; hair: number };
    const palettes: Record<string, { dead: Pal; shooter: Pal; victim: Pal }> = {
      RANDOMSTUFF: {
        dead:    { shirt: 0x6a3a3a, pants: 0x222244, skin: 0xc89060, hair: 0x553311 },
        shooter: { shirt: 0x2a2a55, pants: 0x101018, skin: 0xc89060, hair: 0x0e0e0e },
        victim:  { shirt: 0xcc4422, pants: 0x4a2a1a, skin: 0xf0c8a0, hair: 0x553311 },
      },
      FOREST: {
        dead:    { shirt: 0x3a5a2a, pants: 0x2a1a08, skin: 0xd4a878, hair: 0x222222 },
        shooter: { shirt: 0x556633, pants: 0x2a3a1a, skin: 0xd4a878, hair: 0x553311 },
        victim:  { shirt: 0xff8800, pants: 0x222244, skin: 0xc49a6c, hair: 0xaa3322 },
      },
      DESERT: {
        dead:    { shirt: 0xc8a050, pants: 0x6a4a2a, skin: 0xf0c8a0, hair: 0xaa6622 },
        shooter: { shirt: 0x8a6a30, pants: 0x4a3a1a, skin: 0xf0c8a0, hair: 0xddccaa },
        victim:  { shirt: 0x22aa44, pants: 0x553322, skin: 0xc89060, hair: 0x0e0e0e },
      },
      SNOW: {
        dead:    { shirt: 0x4488cc, pants: 0x222266, skin: 0xe8c8a0, hair: 0xcccccc },
        shooter: { shirt: 0xeeeeee, pants: 0x223344, skin: 0xe8c8a0, hair: 0x222222 },
        victim:  { shirt: 0x6644cc, pants: 0x111122, skin: 0xc89060, hair: 0xff4422 },
      },
    };
    const pal = palettes[config.label] ?? palettes.RANDOMSTUFF;

    // Shooting bot pair in front of the centerpieces (closer to camera).
    // Bot at local (0,0,0), victim at local (+2.8, 0, 0) — scaled below.
    const shootPair = this.createShootingPair({ shooter: pal.shooter, victim: pal.victim });
    shootPair.position.set(-0.5, 0, 8.5);
    shootPair.scale.set(0.6, 0.6, 0.6);
    scene.add(shootPair);

    // Dead person between the two bots — body laid across the line of fire.
    // Midpoint between shooter and victim. Bigger + closer to camera so he's clearly visible.
    const dead = this.createDeadPerson(pal.dead);
    dead.position.set(0.34, 0.3, 10);
    dead.rotation.y = -Math.PI / 2;
    dead.scale.set(1.0, 1.0, 1.0);
    scene.add(dead);

    // Snow panel: snowman pelting the two bots with snowballs
    if (config.label === 'SNOW') {
      const snowman = this.createSnowman();
      snowman.position.set(-3.8, 0, 8.2);
      snowman.rotation.y = Math.PI / 2 + 0.3; // face the bots (roughly toward +X)
      snowman.scale.set(0.55, 0.55, 0.55);
      scene.add(snowman);

      // Three snowballs mid-flight arcing from the snowman toward the bots
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
      const arcStart = new THREE.Vector3(-3.2, 1.5, 8.3);
      const arcEnd = new THREE.Vector3(-0.5, 1.2, 8.5);
      for (const tFrac of [0.25, 0.55, 0.82]) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), snowMat);
        ball.position.lerpVectors(arcStart, arcEnd, tFrac);
        // Arc it upward in the middle of the flight
        ball.position.y += Math.sin(tFrac * Math.PI) * 0.6;
        scene.add(ball);
      }
    }

    // Initial render
    renderer.render(scene, cam);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    this.textures.addCanvas(texKey, canvas);

    // Dispose
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
  }

  private riderIndex = 0;
  /** Build a simple seated player rider (static pose) with unique colors */
  private createRider(): THREE.Group {
    const colors = [
      { shirt: 0x2288ff, skin: 0xf0c8a0, pants: 0x1a1a3a, hair: 0x553311 },
      { shirt: 0xcc2222, skin: 0xd4a878, pants: 0x2a2a2a, hair: 0x0e0e0e },
      { shirt: 0x22cc44, skin: 0xf0c8a0, pants: 0x334455, hair: 0x883311 },
      { shirt: 0xff8800, skin: 0xc89060, pants: 0x222244, hair: 0x1a1a1a },
    ];
    const c = colors[this.riderIndex % colors.length];
    this.riderIndex++;
    const shirtM = new THREE.MeshStandardMaterial({ color: c.shirt, roughness: 0.8 });
    const skinM = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.6 });
    const pantsM = new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.85 });
    const hairM = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.8 });
    const shoeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

    const rider = new THREE.Group();
    // Hips
    const hips = new THREE.Group(); hips.position.y = 0.95; rider.add(hips);
    hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 })));
    // Torso
    const torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtM);
    chest.position.y = 0.3; torso.add(chest);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinM);
    neck.position.y = 0.6; torso.add(neck);
    // Head
    const headGrp = new THREE.Group();
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinM);
    headM.scale.set(1, 1.15, 1); headGrp.add(headM);
    const jawM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skinM);
    jawM.position.set(0, -0.1, 0.02); jawM.scale.set(1, 0.7, 0.9); headGrp.add(jawM);
    // Eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
      eye.position.set(s * 0.08, 0.05, 0.18); headGrp.add(eye);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.02, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111 }));
      pupil.position.set(s * 0.08, 0.05, 0.222); headGrp.add(pupil);
    }
    // Hair
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    hairTop.position.y = 0.04; headGrp.add(hairTop);
    headGrp.position.y = 0.72; torso.add(headGrp);
    // Arms — slightly forward (holding on)
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.3, 0.48, 0); torso.add(arm);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtM);
      upper.position.y = -0.14; arm.add(upper);
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinM);
      forearm.position.set(0, -0.35, 0.05); arm.add(forearm);
      arm.rotation.x = -0.5;
    }
    // Legs — straddling for riding
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.12, 0, 0); hips.add(thigh);
      thigh.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsM));
      (thigh.children[0] as THREE.Mesh).position.y = -0.2;
      thigh.rotation.x = -1.1; // bent forward
      thigh.rotation.z = s * -0.4; // spread outward to straddle
      const shin = new THREE.Group(); shin.position.y = -0.38; thigh.add(shin);
      shin.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsM));
      (shin.children[0] as THREE.Mesh).position.y = -0.16;
      shin.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeM));
      (shin.children[1] as THREE.Mesh).position.set(0, -0.35, 0.04);
      shin.rotation.x = 1.2; // bent back, feet down
    }
    return rider;
  }

  /** Same person model as in-game NPCs, then rotated onto its back with X eyes (matches killNpc). */
  private createDeadPerson(cols?: { shirt: number; pants: number; skin: number; hair: number }): THREE.Group {
    const c = cols ?? { shirt: 0x6a3a3a, pants: 0x222244, skin: 0xc89060, hair: 0x553311 };
    const skinM = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.6 });
    const shirtM = new THREE.MeshStandardMaterial({ color: c.shirt, roughness: 0.85 });
    const pantsM = new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.9 });
    const shoeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    const hairM = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.8 });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // Build a standing person (same proportions as createShootingPair's buildPerson)
    const p = new THREE.Group();
    // Legs
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), pantsM);
      leg.position.set(s * 0.12, 0.4, 0);
      p.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.28), shoeM);
      shoe.position.set(s * 0.12, 0.05, 0.04);
      p.add(shoe);
    }
    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtM);
    torso.position.y = 1.05;
    p.add(torso);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinM);
    neck.position.y = 1.4;
    p.add(neck);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinM);
    head.scale.set(1, 1.15, 1);
    head.position.y = 1.6;
    p.add(head);
    // Hair
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairM,
    );
    hair.position.y = 1.64;
    p.add(hair);
    // X eyes drawn on the face (+Z) — face will rotate to point up
    for (const s of [-1, 1]) {
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), eyeM);
      bar1.position.set(s * 0.08, 1.62, 0.21);
      bar1.rotation.z = Math.PI / 4;
      p.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), eyeM);
      bar2.position.set(s * 0.08, 1.62, 0.21);
      bar2.rotation.z = -Math.PI / 4;
      p.add(bar2);
    }
    // Arms hanging at sides
    for (const s of [-1, 1]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtM);
      upper.position.set(s * 0.3, 1.18, 0);
      p.add(upper);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinM);
      fore.position.set(s * 0.3, 0.9, 0);
      p.add(fore);
    }

    // Lay on back: rotate -90° about X (matches killNpc), then lift slightly off the ground
    const outer = new THREE.Group();
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.2;
    outer.add(p);
    return outer;
  }

  /** Classic snowman mid-throw: right stick-arm cocked back with a snowball ready. Faces +Z. */
  private createSnowman(): THREE.Group {
    const g = new THREE.Group();
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const coalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const carrotMat = new THREE.MeshStandardMaterial({ color: 0xff7722, roughness: 0.8 });
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.95 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    // Three stacked snow balls
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), snowMat);
    bottom.position.y = 0.55; g.add(bottom);
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), snowMat);
    mid.position.y = 1.35; g.add(mid);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), snowMat);
    head.position.y = 2.02; g.add(head);

    // Eyes (coal)
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), coalMat);
      eye.position.set(s * 0.11, 2.1, 0.25); g.add(eye);
    }
    // Carrot nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 8), carrotMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 2.0, 0.34); g.add(nose);
    // Smile (coal dots)
    for (let i = -2; i <= 2; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), coalMat);
      d.position.set(i * 0.05, 1.9 - Math.abs(i) * 0.01, 0.27); g.add(d);
    }
    // Top hat
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), hatMat);
    hatBrim.position.y = 2.28; g.add(hatBrim);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 14), hatMat);
    hatTop.position.y = 2.46; g.add(hatTop);

    // Buttons down the middle
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), coalMat);
      btn.position.set(0, 1.55 - i * 0.22, 0.4); g.add(btn);
    }

    // Throwing arm (right) — cocked back, ready to whip the snowball forward
    const throwArm = new THREE.Group();
    throwArm.position.set(0.4, 1.5, 0);
    throwArm.rotation.z = -0.6;
    throwArm.rotation.x = 1.4; // wound back behind the body
    g.add(throwArm);
    const throwStick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), stickMat);
    throwStick.position.y = -0.35;
    throwArm.add(throwStick);
    // Snowball in the throwing hand
    const heldBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), snowMat);
    heldBall.position.set(0, -0.72, 0);
    throwArm.add(heldBall);
    // Tiny twig "fingers" at the end of the stick
    for (const a of [-0.4, 0, 0.4]) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 4), stickMat);
      finger.position.set(Math.sin(a) * 0.05, -0.66, Math.cos(a) * 0.05);
      finger.rotation.z = a;
      throwArm.add(finger);
    }

    // Other arm (left) — hanging/pointing forward at target
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.4, 1.5, 0);
    leftArm.rotation.z = 0.3;
    leftArm.rotation.x = -1.1; // pointing forward
    g.add(leftArm);
    const leftStick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), stickMat);
    leftStick.position.y = -0.35;
    leftArm.add(leftStick);

    return g;
  }

  /** A bot shooting another person. Bot at local origin facing +X, victim at +X with hit splat. */
  private createShootingPair(opts?: {
    shooter: { shirt: number; pants: number; skin: number; hair: number };
    victim: { shirt: number; pants: number; skin: number; hair: number };
  }): THREE.Group {
    const shooterCols = opts?.shooter ?? { shirt: 0x2a2a55, pants: 0x101018, skin: 0xc89060, hair: 0x0e0e0e };
    const victimCols = opts?.victim ?? { shirt: 0xcc4422, pants: 0x4a2a1a, skin: 0xf0c8a0, hair: 0x553311 };
    const group = new THREE.Group();

    // Exact in-game body layout: hips(0.95) → torso(y=0.05) → chest/neck/head/arms all nested inside torso.
    // Arms parented to torso at (±0.3, 0.48, 0) so shoulder world y = 1.48, same as in-game createPlayerModel.
    const buildPerson = (cols: { shirt: number; pants: number; skin: number; hair: number }) => {
      const shirtM = new THREE.MeshStandardMaterial({ color: cols.shirt, roughness: 0.85 });
      const pantsM = new THREE.MeshStandardMaterial({ color: cols.pants, roughness: 0.9 });
      const skinM = new THREE.MeshStandardMaterial({ color: cols.skin, roughness: 0.6 });
      const hairM = new THREE.MeshStandardMaterial({ color: cols.hair, roughness: 0.8 });
      const shoeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

      const root = new THREE.Group();

      // Hips
      const hips = new THREE.Group();
      hips.position.y = 0.95;
      root.add(hips);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 }));
      hips.add(belt);

      // Torso
      const torso = new THREE.Group();
      torso.position.y = 0.05;
      hips.add(torso);
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtM);
      chest.position.y = 0.3;
      torso.add(chest);

      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinM);
      neck.position.y = 0.6;
      torso.add(neck);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinM);
      head.scale.set(1, 1.15, 1);
      head.position.y = 0.72;
      torso.add(head);

      // Hair
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairM,
      );
      hair.position.y = 0.76;
      torso.add(hair);

      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }),
        );
        eye.position.set(s * 0.08, 0.74, 0.18);
        torso.add(eye);
        const pupil = new THREE.Mesh(
          new THREE.CircleGeometry(0.02, 8),
          new THREE.MeshBasicMaterial({ color: 0x111111 }),
        );
        pupil.position.set(s * 0.08, 0.74, 0.221);
        torso.add(pupil);
      }

      // Legs (inside hips, same as in-game)
      for (const s of [-1, 1]) {
        const thigh = new THREE.Group();
        thigh.position.set(s * 0.12, 0, 0);
        hips.add(thigh);
        const thighBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsM);
        thighBox.position.y = -0.2;
        thigh.add(thighBox);
        const shin = new THREE.Group();
        shin.position.y = -0.38;
        thigh.add(shin);
        const shinBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsM);
        shinBox.position.y = -0.16;
        shin.add(shinBox);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeM);
        shoe.position.set(0, -0.35, 0.04);
        shin.add(shoe);
      }

      return { group: root, shirtM, skinM, torso };
    };

    // Arms + weapon — IDENTICAL to in-game createPlayerModel (BattleScene.ts lines 4561-4592):
    // same construction, same materials, same sizes, same positions. Only addition is the
    // aiming-pose rotations (from in-game aim pose: upper arm x=-1.6 z=±0.3, forearm x=-1.9).
    const buildArmedFighter = (cols: { shirt: number; pants: number; skin: number; hair: number }) => {
      const f = buildPerson(cols);
      const shirtMat = f.shirtM;
      const skinMat = f.skinM;
      const torso = f.torso;

      // Left arm — identical to in-game
      const leftUpperArm = new THREE.Group();
      leftUpperArm.position.set(-0.3, 0.48, 0);
      torso.add(leftUpperArm);
      leftUpperArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
      (leftUpperArm.children[0] as THREE.Mesh).position.y = -0.14;
      const leftForearm = new THREE.Group();
      leftForearm.position.y = -0.28;
      leftUpperArm.add(leftForearm);
      leftForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
      (leftForearm.children[0] as THREE.Mesh).position.y = -0.12;
      const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
      lHand.position.y = -0.27;
      leftForearm.add(lHand);

      // Right arm — identical to in-game
      const rightUpperArm = new THREE.Group();
      rightUpperArm.position.set(0.3, 0.48, 0);
      torso.add(rightUpperArm);
      rightUpperArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
      (rightUpperArm.children[0] as THREE.Mesh).position.y = -0.14;
      const rightForearm = new THREE.Group();
      rightForearm.position.y = -0.28;
      rightUpperArm.add(rightForearm);
      rightForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
      (rightForearm.children[0] as THREE.Mesh).position.y = -0.12;
      const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
      rHand.position.y = -0.27;
      rightForearm.add(rHand);

      // Hold the rifle horizontally across the chest, like a real soldier in the photos:
      // stock at the right shoulder, barrel out forward in the bot's facing direction.
      const gunGroup = new THREE.Group();
      gunGroup.position.set(0.15, 0.35, 0.45);
      gunGroup.rotation.y = Math.PI; // face the other way
      if (this.arModel) {
        const ar = this.arModel.clone(true);
        const bb = new THREE.Box3().setFromObject(ar);
        const size = new THREE.Vector3();
        bb.getSize(size);
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const fit = 1.5 / longest;
        ar.scale.setScalar(fit);
        const cx = (bb.min.x + bb.max.x) / 2 * fit;
        const cy = (bb.min.y + bb.max.y) / 2 * fit;
        const cz = (bb.min.z + bb.max.z) / 2 * fit;
        ar.position.set(-cx, -cy, -cz);
        gunGroup.add(ar);
      } else {
        const gMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
        const gBody = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
        const recv = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.3), gBody);
        gunGroup.add(recv);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.35, 6), gMetal);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.32;
        gunGroup.add(barrel);
      }
      torso.add(gunGroup);

      // Real rifle-aiming pose — like a soldier holding a rifle:
      //   Right arm: upper arm at side, forearm bent forward across body to grip the receiver.
      //   Left arm: raised forward and across to support the barrel/foregrip.
      rightUpperArm.rotation.x = -0.4;
      rightUpperArm.rotation.z = -0.15;
      rightForearm.rotation.x = -1.5;
      leftUpperArm.rotation.x = -0.8;
      leftUpperArm.rotation.z = 0.4;
      leftForearm.rotation.x = -1.3;

      // No muzzle flash — nobody is shooting on the cover

      return f;
    };

    // FIGHTER A (left, facing +X)
    const bot = buildArmedFighter(shooterCols);
    bot.group.rotation.y = Math.PI / 2;
    group.add(bot.group);

    // FIGHTER B (right, facing -X — shooting back at A)
    const opp = buildArmedFighter(victimCols);
    opp.group.position.set(2.8, 0, 0);
    opp.group.rotation.y = -Math.PI / 2;
    group.add(opp.group);

    return group;
  }

  private setupLivePlayer(): void {
    const w = 240, h = 400;
    this.playerRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.playerRenderer.setSize(w, h);
    this.playerRenderer.setClearColor(0x000000, 0);

    this.playerScene = new THREE.Scene();
    this.playerCam = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
    this.playerCam.position.set(0.3, 1.1, 3.2);
    this.playerCam.lookAt(0, 0.85, 0);

    this.playerScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    this.playerScene.add(dir);

    // Jake — always show Jake on the front cover
    const vis = { shirt: 0x1a1a2e, skin: 0xc49a6c, pants: 0x101018, hair: 0x0e0e0e, eye: 0x4a5a3a };
    const shirtMat = new THREE.MeshStandardMaterial({ color: vis.shirt, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: vis.skin, roughness: 0.6 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: vis.pants, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: vis.hair, roughness: 0.8 });

    const root = new THREE.Group();

    // Hips
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 })));

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.05;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtMat);
    chest.position.y = 0.3;
    torso.add(chest);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat);
    neck.position.y = 0.6;
    torso.add(neck);

    // Head
    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    headMesh.scale.set(1, 1.15, 1);
    headGroup.add(headMesh);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), skinMat);
    jaw.position.set(0, -0.1, 0.02); jaw.scale.set(1, 0.7, 0.9);
    headGroup.add(jaw);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
      cheek.position.set(s * 0.12, -0.02, 0.1);
      headGroup.add(cheek);
    }
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
    const irisMat = new THREE.MeshStandardMaterial({ color: vis.eye, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
    for (const s of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a6a5a, roughness: 0.8 }));
      socket.position.set(s * 0.08, 0.05, 0.17); socket.scale.set(1.2, 0.8, 0.5);
      headGroup.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), whiteMat);
      eye.position.set(s * 0.08, 0.05, 0.18);
      headGroup.add(eye);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), irisMat);
      iris.position.set(s * 0.08, 0.05, 0.221);
      headGroup.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.015, 10), pupilMat);
      pupil.position.set(s * 0.08, 0.05, 0.222);
      headGroup.add(pupil);
      const highlight = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      highlight.position.set(s * 0.08 + 0.015, 0.06, 0.223);
      headGroup.add(highlight);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.02), hairMat);
      brow.position.set(s * 0.08, 0.1, 0.18); brow.rotation.z = s * -0.15;
      headGroup.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), skinMat);
    nose.position.set(0, 0, 0.21); nose.scale.set(1, 0.8, 1.2);
    headGroup.add(nose);
    for (const s of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), skinMat);
      nostril.position.set(s * 0.015, -0.015, 0.22);
      headGroup.add(nostril);
    }
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.006, 6, 10, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xbb5555, roughness: 0.5 }));
    mouth.position.set(0, -0.065, 0.19); mouth.rotation.x = Math.PI; mouth.rotation.z = Math.PI;
    headGroup.add(mouth);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinMat);
      ear.position.set(s * 0.22, 0.02, 0); ear.scale.set(0.35, 1, 0.7);
      headGroup.add(ear);
    }
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairTop.position.y = 0.04;
    headGroup.add(hairTop);
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 12, 0, Math.PI * 2, 0.3, Math.PI * 0.4), hairMat);
    hairBack.position.set(0, 0.02, -0.02);
    headGroup.add(hairBack);
    headGroup.position.y = 0.72;
    torso.add(headGroup);

    // Arms
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.3, 0.48, 0);
    torso.add(leftArm);
    leftArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
    leftArm.children[0].position.y = -0.14;
    const lForearm = new THREE.Group();
    lForearm.position.y = -0.28; lForearm.rotation.x = -0.4;
    leftArm.add(lForearm);
    lForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
    lForearm.children[0].position.y = -0.12;

    const rightArm = new THREE.Group();
    rightArm.position.set(0.3, 0.48, 0);
    torso.add(rightArm);
    rightArm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat));
    rightArm.children[0].position.y = -0.14;
    const rForearm = new THREE.Group();
    rForearm.position.y = -0.28; rForearm.rotation.x = -0.6;
    rightArm.add(rForearm);
    rForearm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat));
    rForearm.children[0].position.y = -0.12;

    // Legs
    const leftThigh = new THREE.Group();
    leftThigh.position.set(-0.12, 0, 0);
    hips.add(leftThigh);
    leftThigh.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat));
    leftThigh.children[0].position.y = -0.2;
    const leftShin = new THREE.Group();
    leftShin.position.y = -0.38;
    leftThigh.add(leftShin);
    leftShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat));
    leftShin.children[0].position.y = -0.16;
    leftShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat));
    leftShin.children[1].position.set(0, -0.35, 0.04);

    const rightThigh = new THREE.Group();
    rightThigh.position.set(0.12, 0, 0);
    hips.add(rightThigh);
    rightThigh.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat));
    rightThigh.children[0].position.y = -0.2;
    const rightShin = new THREE.Group();
    rightShin.position.y = -0.38;
    rightThigh.add(rightShin);
    rightShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat));
    rightShin.children[0].position.y = -0.16;
    rightShin.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat));
    rightShin.children[1].position.set(0, -0.35, 0.04);

    torso.rotation.x = -0.15;
    root.rotation.y = -0.3;

    this.playerScene.add(root);

    // Store limb references for animation
    this.playerLimbs = { leftArm, rightArm, leftThigh, rightThigh, leftShin, rightShin, torso, root };
    this.runTime = 0;
  }

  update(_time: number, delta: number): void {
    // Gamepad: press A (or Start) to Play
    const pads = navigator.getGamepads?.();
    if (pads) {
      for (const gp of pads) {
        if (!gp) continue;
        const aPressed = !!gp.buttons[0]?.pressed || !!gp.buttons[9]?.pressed;
        if (aPressed && !this.gpAButtonPrev) this.onPlayPressed?.();
        this.gpAButtonPrev = aPressed;
        break;
      }
    }
    if (!this.playerRenderer || !this.playerScene || !this.playerCam || !this.playerCanvas || !this.playerImg || !this.playerLimbs) return;

    const dt = delta / 1000;
    this.runTime += dt * 8;
    const t = this.runTime;
    const limbs = this.playerLimbs;

    limbs.leftArm.rotation.x = Math.sin(t) * 0.8;
    limbs.rightArm.rotation.x = -Math.sin(t) * 0.8;
    limbs.leftThigh.rotation.x = -Math.sin(t) * 0.7;
    limbs.rightThigh.rotation.x = Math.sin(t) * 0.7;
    limbs.leftShin.rotation.x = Math.max(0, Math.sin(t)) * 0.8;
    limbs.rightShin.rotation.x = Math.max(0, -Math.sin(t)) * 0.8;
    limbs.root.position.y = Math.abs(Math.sin(t * 2)) * 0.03;
    limbs.torso.rotation.y = Math.sin(t) * 0.05;

    this.playerRenderer.render(this.playerScene, this.playerCam);
    const ctx = this.playerCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.playerCanvas.width, this.playerCanvas.height);
    ctx.drawImage(this.playerRenderer.domElement, 0, 0);
    this.playerImg.setTexture('title-player');
  }

  shutdown(): void {
    if (this.playerRenderer) {
      this.playerRenderer.dispose();
      this.playerRenderer = undefined;
    }
  }
}
