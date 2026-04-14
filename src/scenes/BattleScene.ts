import Phaser from 'phaser';
import * as THREE from 'three';
import { WEAPONS } from '../config/game.config';
import { NetworkManager } from '../network/NetworkManager';
import { GameMessage, PlayerInfo } from '../network/MessageTypes';
import { addCoins, getCoins } from '../utils/coinStore';
import { ARMOR_ITEMS, getEquippedArmor } from './ArmorShopScene';

// 3D character colors — matches character select
const CHAR_COLORS = [
  0x44aaff, 0xff4400, 0x4444aa, 0xff4400, 0x44aaff,
  0x44cc44, 0xcccccc, 0xaa7722, 0xff00ff, 0x556b2f,
  0xffffff, 0x6a006a, 0xffdd00, 0x333333, 0x2288ee,
  0x555555, 0xff6677, 0x8888aa, 0x4a6a3a, 0xff4400,
  0xaaccee, 0xbb2020,
];

// Per-character visual colors: shirt, skin, pants, hair, eyeColor
export const CHAR_VISUALS: { shirt: number; skin: number; pants: number; hair: number; eye: number }[] = [
  // Boys
  { shirt: 0x1a1a2e, skin: 0xc49a6c, pants: 0x101018, hair: 0x0e0e0e, eye: 0x4a5a3a },  // Jake
  { shirt: 0xcc3300, skin: 0x8a5a3a, pants: 0x551800, hair: 0x1a1008, eye: 0x5a3a1a },  // Marcus
  { shirt: 0x2266cc, skin: 0xe0c0a0, pants: 0x0e2244, hair: 0x4a3020, eye: 0x4a7aaa },  // Tyler
  { shirt: 0x1e7a1e, skin: 0x6a4428, pants: 0x0e3a0e, hair: 0x0e0e0e, eye: 0x3a5a2a },  // DeShawn
  { shirt: 0xc0c0c0, skin: 0xf0dcc8, pants: 0x707070, hair: 0xd8d0c8, eye: 0x8a9aaa },  // Ethan
  { shirt: 0x7a5500, skin: 0xba8860, pants: 0x4a3300, hair: 0x2a1a0a, eye: 0x6a5a3a },  // Carlos
  { shirt: 0xaa00aa, skin: 0xd4aa78, pants: 0x550055, hair: 0x0e0e0e, eye: 0x5a4a6a },  // Ryan
  { shirt: 0x4a5a2a, skin: 0x7a5438, pants: 0x2a3a1a, hair: 0x0a0a0a, eye: 0x4a3a2a },  // Tyrone
  { shirt: 0xf8f8f8, skin: 0xc49a6c, pants: 0x1a1a1a, hair: 0x6a4a2a, eye: 0x5a7a4a },  // Noah
  { shirt: 0x1e0e1e, skin: 0xa87a58, pants: 0x100010, hair: 0x0a0a0a, eye: 0x2a2a3a },  // Andre
  // Girls
  { shirt: 0xd4a000, skin: 0xe0c0a0, pants: 0x7a5a00, hair: 0x4a3020, eye: 0x6a6a3a },  // Mia
  { shirt: 0x181818, skin: 0xd8c0b0, pants: 0x0a0a0a, hair: 0x0a0a0a, eye: 0x3a4a3a },  // Luna
  { shirt: 0x0060b8, skin: 0xc49a6c, pants: 0x002a50, hair: 0xe8b800, eye: 0x3a7aaa },  // Zoe
  { shirt: 0x2a2a2a, skin: 0x7a5438, pants: 0x181818, hair: 0x0a0a0a, eye: 0x3a3a2a },  // Aaliyah
  { shirt: 0xe86080, skin: 0xe0c0a0, pants: 0xaa3050, hair: 0x7a3818, eye: 0x5a7a5a },  // Bella
  { shirt: 0x5a5a6a, skin: 0xba8860, pants: 0x3a3a4a, hair: 0x1a1a1a, eye: 0x4a5a5a },  // Ivy
  { shirt: 0x4a6030, skin: 0xc49a6c, pants: 0x304020, hair: 0x2a1a0a, eye: 0x4a6a3a },  // Jade
  { shirt: 0xe84400, skin: 0x8a5a3a, pants: 0x8a2200, hair: 0xcc2200, eye: 0x5a4a2a },  // Scarlett
  { shirt: 0x98b8d8, skin: 0xe0c0a0, pants: 0x6888a8, hair: 0xe0dcd8, eye: 0x4a8aaa },  // Aria
  { shirt: 0x7a0000, skin: 0xba8860, pants: 0x440000, hair: 0x0a0a0a, eye: 0x4a3a2a },  // Roxy
];

export class BattleScene extends Phaser.Scene {
  private threeRenderer!: THREE.WebGLRenderer;
  private scene3d!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock!: THREE.Clock;
  private animFrameId: number = 0;

  // Player
  private moveDir = { x: 0, z: 0 };
  private lookAngle = 0;
  private lookPitch = 0;
  private playerPos = new THREE.Vector3(0, 0, 0);
  private fountainParts: { waters: THREE.Mesh[]; spout: THREE.Mesh | null; spray: THREE.Mesh | null; jets: THREE.Mesh[]; foams: THREE.Mesh[]; droplets: { mesh: THREE.Mesh; vel: THREE.Vector3; startY: number; endY: number; cx: number; cz: number }[] } = { waters: [], spout: null, spray: null, jets: [], foams: [], droplets: [] };
  private playerModel!: THREE.Group;
  private playerPhase = 0;
  private playerSpeed = 0;
  private playerHP = 100;
  private playerMaxHP = 100;
  private coinsEarned = 0;
  private carBtn: HTMLDivElement | null = null;
  private playerGun = 'None';
  private playerHealthBar!: THREE.Sprite;
  private playerHealthCtx!: CanvasRenderingContext2D;
  private playerHealthTex!: THREE.CanvasTexture;

  // Pickups
  private gunPickups: { group: THREE.Group; name: string; color: number; picked: boolean }[] = [];
  private cheesePickups: { group: THREE.Group; picked: boolean }[] = [];
  private hudDiv!: HTMLDivElement;
  private hpText!: HTMLDivElement;
  private gunText!: HTMLDivElement;
  private aliveText!: HTMLDivElement;
  private pickupMsg!: HTMLDivElement;

  // Bullets — owner: -1=player, 0+=npc index
  private bullets: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; damage: number; owner: number }[] = [];
  private shootCooldown = 0;

  // Collision circles: { x, z, r }
  private colliders: { x: number; z: number; r: number }[] = [];
  private roadSegments: { x1: number; z1: number; x2: number; z2: number }[] = [];

  private getTerrainHeight(_wx: number, _wz: number): number {
    return 0;
  }
  // Skeletal joints for player
  private pHips!: THREE.Group;
  private pTorso!: THREE.Group;
  private pHead!: THREE.Group;
  private pLeftUpperArm!: THREE.Group; private pLeftForearm!: THREE.Group;
  private pRightUpperArm!: THREE.Group; private pRightForearm!: THREE.Group;
  private pLeftThigh!: THREE.Group; private pLeftShin!: THREE.Group;
  private pRightThigh!: THREE.Group; private pRightShin!: THREE.Group;

  // NPCs with skeletal parts for animation
  private npcs: {
    mesh: THREE.Group;
    vx: number; vz: number; timer: number;
    // Joint pivots for Fortnite-style animation
    hips: THREE.Group;
    torso: THREE.Group;
    head: THREE.Group;
    leftUpperArm: THREE.Group; leftForearm: THREE.Group;
    rightUpperArm: THREE.Group; rightForearm: THREE.Group;
    leftThigh: THREE.Group; leftShin: THREE.Group;
    rightThigh: THREE.Group; rightShin: THREE.Group;
    phase: number; // animation phase accumulator
    speed: number; // current speed for blend
    hp: number; // health
    dead: boolean;
    healthBar: THREE.Sprite;
    healthCtx: CanvasRenderingContext2D;
    healthTex: THREE.CanvasTexture;
  }[] = [];

  // Cars
  private cars: { mesh: THREE.Group; vx: number; vz: number; speed: number; driver: 'none' | 'player' | number; legPivots?: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[]; armPivots?: THREE.Group[]; tailPivots?: THREE.Group[]; jawPivot?: THREE.Group; neckBase?: THREE.Group; neckMid?: THREE.Group; bodyGroup?: THREE.Group; runPhase?: number }[] = [];
  private playerInCar: number = -1; // index of car player is driving, -1 = on foot

  // T-Rex eat animation
  private trexEatAnim: {
    active: boolean;
    timer: number;
    phase: 'jump' | 'chomp' | 'swallow';
    trexIndex: number;
    startY: number;
    damage: number;
  } = { active: false, timer: 0, phase: 'jump', trexIndex: -1, startY: 0, damage: 40 };

  // Bear Boss
  private boss!: THREE.Group;
  private bossHP = 30;
  private bossMaxHP = 30;
  private bossPhase = 0;
  private bossAttackTimer = 0;
  private bossRoarTimer = 0;
  private bossDead = false;
  private bossSpawned = false;
  private bossHealthBar!: THREE.Sprite;
  private bossHealthCtx!: CanvasRenderingContext2D;
  private bossHealthTex!: THREE.CanvasTexture;

  // Audio
  private audioCtx!: AudioContext;
  private sfx: Record<string, AudioBuffer> = {};
  private footstepTimer = 0;

  // Touch controls
  private leftTouch: { id: number; startX: number; startY: number } | null = null;
  private rightTouch: { id: number; lastX: number; lastY: number } | null = null;

  // Selected character info from character select
  private selectedCharKey = 'char-0';
  private selectedCharName = 'Jake';

  // ── Multiplayer ──
  private isMultiplayer = false;
  private network!: NetworkManager;
  private multiplayerPlayers: PlayerInfo[] = [];
  private remotePlayers: Map<string, {
    model: THREE.Group;
    targetX: number; targetY: number; targetZ: number;
    targetRotY: number;
    speed: number;
    hp: number;
    dead: boolean;
    healthBar: THREE.Sprite;
    healthCtx: CanvasRenderingContext2D;
    healthTex: THREE.CanvasTexture;
    // Skeleton joints for animation
    hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
    leftUpperArm: THREE.Group; leftForearm: THREE.Group;
    rightUpperArm: THREE.Group; rightForearm: THREE.Group;
    leftThigh: THREE.Group; leftShin: THREE.Group;
    rightThigh: THREE.Group; rightShin: THREE.Group;
    phase: number;
    nameSprite: THREE.Sprite;
  }> = new Map();
  private networkSendTimer = 0;
  private messageHandler: ((msg: GameMessage, senderId: string) => void) | null = null;

  constructor() {
    super({ key: 'BattleScene' });
  }

  private gameMode = 'players-first';
  private introCamera = true; // start facing the player, transition to behind on first move
  private introCameraTimer = 0;

  init(data: { characterKey?: string; characterName?: string; mode?: string; opponent?: string; multiplayerPlayers?: PlayerInfo[] }): void {
    if (data.characterKey) this.selectedCharKey = data.characterKey;
    if (data.characterName) this.selectedCharName = data.characterName;
    if (data.mode) this.gameMode = data.mode;
    this.isMultiplayer = data.opponent === 'players';
    this.multiplayerPlayers = data.multiplayerPlayers || [];
  }

  create(): void {
    // Bake sound effects
    this.bakeSounds();

    // Reset state for new game — load equipped armor for bonus HP
    const equippedArmorIds = getEquippedArmor();
    let armorBonus = 0;
    for (const id of equippedArmorIds) {
      const item = ARMOR_ITEMS.find(a => a.id === id);
      if (item) armorBonus += item.protection;
    }
    this.playerMaxHP = 100 + armorBonus;
    this.playerHP = this.playerMaxHP;
    this.playerGun = 'None';
    this.playerPos.set(0, 0, 0);
    this.lookAngle = 0;
    this.lookPitch = 0;
    this.bullets = [];
    this.npcs = [];
    this.colliders = [];
    this.gunPickups = [];
    this.cheesePickups = [];
    this.shootCooldown = 0;
    this.bossHP = 30;
    this.bossDead = false;
    this.bossSpawned = false;
    this.bossAttackTimer = 0;
    this.bossRoarTimer = 0;
    this.bossPhase = 0;
    this.coinsEarned = 0;

    // Hide Phaser canvas
    const phaserCanvas = this.game.canvas;
    phaserCanvas.style.display = 'none';

    // Three.js renderer
    this.threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.threeRenderer.setSize(window.innerWidth, window.innerHeight);
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.threeRenderer.shadowMap.enabled = true;
    this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1.1;
    document.getElementById('game-container')!.appendChild(this.threeRenderer.domElement);
    this.threeRenderer.domElement.style.position = 'fixed';
    this.threeRenderer.domElement.style.top = '0';
    this.threeRenderer.domElement.style.left = '0';
    this.threeRenderer.domElement.style.zIndex = '999';

    // Scene
    this.scene3d = new THREE.Scene();
    this.scene3d.fog = new THREE.FogExp2(0x9ab8d0, 0.0012);

    // Realistic sky gradient — canvas texture on a sphere
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, '#1a3a6a');     // deep blue at top
    skyGrad.addColorStop(0.25, '#3a6aaa');  // mid blue
    skyGrad.addColorStop(0.5, '#6a9acc');   // lighter
    skyGrad.addColorStop(0.7, '#a8c8e8');   // pale near horizon
    skyGrad.addColorStop(0.85, '#d8e8f0');  // hazy white
    skyGrad.addColorStop(0.95, '#f0e8d0');  // warm horizon glow
    skyGrad.addColorStop(1, '#e8d0a0');     // golden edge
    skyCtx.fillStyle = skyGrad;
    skyCtx.fillRect(0, 0, 512, 512);

    // Subtle sun glow — radial gradient bright spot upper-right
    const sunGlow = skyCtx.createRadialGradient(380, 80, 5, 380, 80, 90);
    sunGlow.addColorStop(0, 'rgba(255, 255, 200, 0.55)');
    sunGlow.addColorStop(0.3, 'rgba(255, 240, 150, 0.25)');
    sunGlow.addColorStop(1, 'rgba(255, 220, 100, 0.0)');
    skyCtx.fillStyle = sunGlow;
    skyCtx.fillRect(0, 0, 512, 512);

    // Painted clouds — white/light-gray ellipses across upper portion
    const cloudDefs = [
      { x: 60,  y: 80,  rx: 55, ry: 18, opacity: 0.18 },
      { x: 160, y: 55,  rx: 70, ry: 22, opacity: 0.30 },
      { x: 290, y: 70,  rx: 85, ry: 26, opacity: 0.22 },
      { x: 420, y: 45,  rx: 60, ry: 18, opacity: 0.25 },
      { x: 470, y: 100, rx: 50, ry: 16, opacity: 0.15 },
      { x: 100, y: 120, rx: 45, ry: 14, opacity: 0.13 },
      { x: 240, y: 105, rx: 65, ry: 20, opacity: 0.20 },
      { x: 370, y: 130, rx: 55, ry: 17, opacity: 0.17 },
      { x: 500, y: 60,  rx: 40, ry: 13, opacity: 0.12 },
      { x: 30,  y: 150, rx: 50, ry: 15, opacity: 0.10 },
    ];
    for (const c of cloudDefs) {
      skyCtx.save();
      skyCtx.globalAlpha = c.opacity;
      skyCtx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#e8eef4';
      skyCtx.beginPath();
      skyCtx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      skyCtx.fill();
      // Second overlapping puff for depth
      skyCtx.globalAlpha = c.opacity * 0.6;
      skyCtx.beginPath();
      skyCtx.ellipse(c.x + c.rx * 0.4, c.y - c.ry * 0.3, c.rx * 0.65, c.ry * 0.8, 0, 0, Math.PI * 2);
      skyCtx.fill();
      skyCtx.restore();
    }

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyGeo = new THREE.SphereGeometry(800, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    this.scene3d.add(new THREE.Mesh(skyGeo, skyMat));

    // Camera — third person
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2500);
    this.camera.position.set(0, 3, 6);

    this.clock = new THREE.Clock();

    // === REALISTIC LIGHTING ===
    // Soft ambient fill
    const ambient = new THREE.AmbientLight(0x667788, 0.35);
    this.scene3d.add(ambient);

    // Main sun — warm golden light
    const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1200;
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.02;
    this.scene3d.add(sun);

    // Subtle warm ground-bounce light
    const groundBounce = new THREE.PointLight(0xaa8844, 0.15);
    groundBounce.position.set(0, 1, 0);
    this.scene3d.add(groundBounce);

    // Fill light from opposite side — cool blue
    const fill = new THREE.DirectionalLight(0x8899cc, 0.3);
    fill.position.set(-30, 40, -20);
    this.scene3d.add(fill);

    // Sky/ground hemisphere
    const hemi = new THREE.HemisphereLight(0x88aacc, 0x3a5a20, 0.5);
    this.scene3d.add(hemi);

    // === GROUND — flat square ===
    // Build a procedural canvas texture for the ground
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 1024;
    groundCanvas.height = 1024;
    const gCtx = groundCanvas.getContext('2d')!;

    // Base fill — mid green
    gCtx.fillStyle = '#3d6e22';
    gCtx.fillRect(0, 0, 1024, 1024);

    // Varied green blobs to break up the base colour
    const greenVariants = ['#4a7a28', '#336018', '#52872e', '#2e5a15', '#3a6820', '#5c9030'];
    for (let i = 0; i < 600; i++) {
      const gx = Math.random() * 1024;
      const gy = Math.random() * 1024;
      const gr = 8 + Math.random() * 40;
      gCtx.fillStyle = greenVariants[Math.floor(Math.random() * greenVariants.length)];
      gCtx.beginPath();
      gCtx.ellipse(gx, gy, gr, gr * (0.5 + Math.random() * 0.8), Math.random() * Math.PI, 0, Math.PI * 2);
      gCtx.fill();
    }

    // Brown dirt blotches
    const dirtVariants = ['#6b5230', '#7a5e38', '#5a4020', '#8a6a40'];
    for (let i = 0; i < 120; i++) {
      const dx = Math.random() * 1024;
      const dy = Math.random() * 1024;
      const dr = 6 + Math.random() * 30;
      gCtx.globalAlpha = 0.5 + Math.random() * 0.5;
      gCtx.fillStyle = dirtVariants[Math.floor(Math.random() * dirtVariants.length)];
      gCtx.beginPath();
      gCtx.ellipse(dx, dy, dr, dr * (0.4 + Math.random() * 0.9), Math.random() * Math.PI, 0, Math.PI * 2);
      gCtx.fill();
    }

    // Sandy / pale spots
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * 1024;
      const sy = Math.random() * 1024;
      const sr = 4 + Math.random() * 18;
      gCtx.globalAlpha = 0.3 + Math.random() * 0.4;
      gCtx.fillStyle = '#c8a86a';
      gCtx.beginPath();
      gCtx.ellipse(sx, sy, sr, sr * (0.4 + Math.random() * 0.8), Math.random() * Math.PI, 0, Math.PI * 2);
      gCtx.fill();
    }

    // Small grass tufts — tiny green strokes
    gCtx.globalAlpha = 1;
    for (let i = 0; i < 800; i++) {
      const tx = Math.random() * 1024;
      const ty = Math.random() * 1024;
      const tlen = 3 + Math.random() * 8;
      gCtx.strokeStyle = Math.random() > 0.5 ? '#2a5a10' : '#5a9030';
      gCtx.lineWidth = 1;
      gCtx.beginPath();
      gCtx.moveTo(tx, ty);
      gCtx.lineTo(tx + (Math.random() - 0.5) * 4, ty - tlen);
      gCtx.stroke();
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(12, 12);

    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.95,
      metalness: 0,
    });
    groundMat.side = THREE.DoubleSide;
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene3d.add(ground);

    // Dirt patches — 80 patches with varied sizes and tones
    const dirtPatchColors = [0x6a5a3a, 0x7a6040, 0x5a4828, 0x8a6a44, 0xc8a86a];
    for (let i = 0; i < 20; i++) {
      const colorIndex = Math.floor(Math.random() * dirtPatchColors.length);
      const patchMat = new THREE.MeshStandardMaterial({
        color: dirtPatchColors[colorIndex],
        roughness: 1,
        metalness: 0,
      });
      const patchRadius = 1 + Math.random() * 4; // 1–5 range
      const patch = new THREE.Mesh(new THREE.CircleGeometry(patchRadius, 10), patchMat);
      patch.rotation.x = -Math.PI / 2;
      const px = (Math.random() - 0.5) * 800;
      const pz = (Math.random() - 0.5) * 800;
      patch.position.set(px, this.getTerrainHeight(px, pz) + 0.02, pz);
      this.scene3d.add(patch);
    }

    // Small pebbles scattered near roads / ground (≈200 tiny rocks)
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x888070, roughness: 0.9, metalness: 0.05 });
    for (let i = 0; i < 40; i++) {
      const pebbleSize = 0.05 + Math.random() * 0.10;
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(pebbleSize, 0), pebbleMat);
      const rx = (Math.random() - 0.5) * 900;
      const rz = (Math.random() - 0.5) * 900;
      pebble.position.set(rx, this.getTerrainHeight(rx, rz) + pebbleSize * 0.5, rz);
      pebble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      pebble.castShadow = true;
      pebble.receiveShadow = true;
      this.scene3d.add(pebble);
    }

    // === ROADS (must be first so other objects avoid them) ===
    this.createRoads();

    // === TREES (more, wilder) ===
    this.createTrees();

    // === EIFFEL TOWER at center ===
    this.createEiffelTower();

    // === ROCKS ===
    this.createRocks();

    // === RIVER ===
    this.createRiver();

    // === BUSHES ===
    this.createBushes();

    // === FALLEN LOGS ===
    this.createLogs();

    // === TALL GRASS PATCHES ===
    this.createGrass();

    // === MOUNTAINS at edges ===
    this.createMountains();

    // === PIZZA ===
    this.createCheese();

    // === GUNS on the ground ===
    this.createGuns();

    // === CARS ===
    this.createCars();

    // === 3D NPCs scattered around ===
    this.createNPCs(this.isMultiplayer ? 20 : 50);

    // === MULTIPLAYER: setup network + remote players ===
    if (this.isMultiplayer) {
      this.setupMultiplayer();
    }

    // === PLAYER CHARACTER (third person) ===
    this.createPlayerModel();

    // === SKY === (bear boss created when all NPCs die)
    this.createClouds();

    // === TOUCH CONTROLS ===
    this.setupTouchControls();

    // === KEYBOARD CONTROLS ===
    this.setupKeyboard();

    // === HUD OVERLAY ===
    this.createHUD();

    // Handle resize
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.threeRenderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Show map screen — player picks landing spot
    this.showMapScreen(() => {
      this.startGameLoop();
    });
  }

  private showMapScreen(onLand: () => void): void {
    // Create fullscreen map overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;';

    const title = document.createElement('div');
    title.textContent = 'CHOOSE YOUR LANDING SPOT';
    title.style.cssText = 'color:#fff;font-family:sans-serif;font-size:28px;font-weight:bold;margin-bottom:15px;text-shadow:0 0 10px #0af;letter-spacing:3px;';
    overlay.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Tap or click anywhere on the map';
    subtitle.style.cssText = 'color:#aaa;font-family:sans-serif;font-size:16px;margin-bottom:15px;';
    overlay.appendChild(subtitle);

    // Map canvas
    const mapSize = Math.min(window.innerWidth - 40, window.innerHeight - 140, 600);
    const canvas = document.createElement('canvas');
    canvas.width = mapSize;
    canvas.height = mapSize;
    canvas.style.cssText = `border:3px solid #0af;border-radius:8px;cursor:crosshair;box-shadow:0 0 20px rgba(0,170,255,0.3);`;
    overlay.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    const worldSize = 1000; // world goes from -500 to 500
    const scale = mapSize / worldSize;
    const toMap = (wx: number, wz: number) => ({
      x: (wx + worldSize / 2) * scale,
      y: (wz + worldSize / 2) * scale,
    });

    // Draw ground background
    ctx.fillStyle = '#3a6a20';
    ctx.fillRect(0, 0, mapSize, mapSize);

    // Draw roads
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 8 * scale;
    for (const r of this.roadSegments) {
      const a = toMap(r.x1, r.z1);
      const b = toMap(r.x2, r.z2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Road center lines
    ctx.strokeStyle = '#aa0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    for (const r of this.roadSegments) {
      const a = toMap(r.x1, r.z1);
      const b = toMap(r.x2, r.z2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw river/water
    ctx.fillStyle = '#2266aa';
    // Approximate river path as a thick line
    ctx.strokeStyle = '#2266aa';
    ctx.lineWidth = 12 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(toMap(-400, -500).x, toMap(-400, -500).y);
    ctx.quadraticCurveTo(toMap(-200, 0).x, toMap(-200, 0).y, toMap(-350, 500).x, toMap(-350, 500).y);
    ctx.stroke();

    // Draw mountains (big gray circles)
    for (const c of this.colliders) {
      if (c.r > 8) { // mountains are big colliders
        const p = toMap(c.x, c.z);
        ctx.fillStyle = '#5a6a5a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, c.r * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a5a4a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Draw trees as small green dots
    ctx.fillStyle = '#1a4a0a';
    for (const c of this.colliders) {
      if (c.r >= 0.3 && c.r <= 1.5) {
        const p = toMap(c.x, c.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, c.r * scale * 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw T-Rexes as small brown dots
    ctx.fillStyle = '#8B4513';
    for (const car of this.cars) {
      const p = toMap(car.mesh.position.x, car.mesh.position.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw gun pickups as tiny yellow dots
    ctx.fillStyle = '#ddaa00';
    for (const g of this.gunPickups) {
      if (!g.picked) {
        const p = toMap(g.group.position.x, g.group.position.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw pizza as tiny orange dots
    ctx.fillStyle = '#ff8800';
    for (const ch of this.cheesePickups) {
      if (!ch.picked) {
        const p = toMap(ch.group.position.x, ch.group.position.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw NPCs as small blue dots
    ctx.fillStyle = '#4488ff';
    for (const npc of this.npcs) {
      if (!npc.dead) {
        const p = toMap(npc.mesh.position.x, npc.mesh.position.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw bear boss
    if (!this.bossDead && this.bossSpawned && this.boss) {
      const bp = toMap(this.boss.position.x, this.boss.position.z);
      ctx.fillStyle = '#4a2a0a';
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BEAR', bp.x, bp.y + 3);
    }

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'color:#ccc;font-family:sans-serif;font-size:12px;margin-top:10px;display:flex;gap:15px;flex-wrap:wrap;justify-content:center;';
    legend.innerHTML = [
      '<span style="color:#1a4a0a">● Trees</span>',
      '<span style="color:#5a6a5a">● Mountains</span>',
      '<span style="color:#2266aa">● River</span>',
      '<span style="color:#444">● Roads</span>',
      '<span style="color:#ddaa00">● Guns</span>',
      '<span style="color:#ff8800">● Pizza</span>',
      '<span style="color:#4488ff">● Bots</span>',
      '<span style="color:#8B4513">● T-Rex</span>',
      '<span style="color:#4a2a0a">● Bear Boss</span>',
    ].join('');
    overlay.appendChild(legend);

    document.body.appendChild(overlay);

    // Crosshair marker that follows mouse/touch
    let markerX = mapSize / 2;
    let markerY = mapSize / 2;

    const drawMarker = () => {
      // Redraw map (save original)
      const imgData = ctx.getImageData(0, 0, mapSize, mapSize);
      ctx.putImageData(imgData, 0, 0);
      // Draw crosshair
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX - 12, markerY);
      ctx.lineTo(markerX + 12, markerY);
      ctx.moveTo(markerX, markerY - 12);
      ctx.lineTo(markerX, markerY + 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
      ctx.stroke();
    };

    // Save clean map
    const cleanMap = ctx.getImageData(0, 0, mapSize, mapSize);

    const updateMarker = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect();
      markerX = ex - rect.left;
      markerY = ey - rect.top;
      ctx.putImageData(cleanMap, 0, 0);
      drawMarker();
    };

    canvas.addEventListener('mousemove', (e) => updateMarker(e.clientX, e.clientY));
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      updateMarker(t.clientX, t.clientY);
    }, { passive: false });

    const land = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ex - rect.left;
      const my = ey - rect.top;
      // Convert map coords back to world coords
      const wx = (mx / scale) - worldSize / 2;
      const wz = (my / scale) - worldSize / 2;
      // Clamp to world bounds
      const cx = Math.max(-450, Math.min(450, wx));
      const cz = Math.max(-450, Math.min(450, wz));
      overlay.remove();
      // Place player directly at chosen spot — no T-Rex ride
      this.playerPos.set(cx, this.getTerrainHeight(cx, cz), cz);
      this.playerModel.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      onLand();
    };

    canvas.addEventListener('click', (e) => land(e.clientX, e.clientY));
    canvas.addEventListener('touchend', (e) => {
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        land(t.clientX, t.clientY);
      }
    });
  }

  private startTRexRide(targetX: number, targetZ: number, onLand: () => void): void {
    // Build realistic T-Rex model
    const trex = new THREE.Group();

    // Realistic dinosaur colors — mottled brown/olive like JP T-Rex
    const bodyDark = 0x4a3a28;
    const bodyMid = 0x5a4a30;
    const bodyLight = 0x6a5a3a;
    const bellyCol = 0x8a7a58;
    const scaleCol = 0x3a2a1a;
    const clawCol = 0x1a1a10;
    const teethCol = 0xeeeedd;
    const eyeCol = 0xddcc44;
    const pupilCol = 0x111100;
    const tongueCol = 0x884444;
    const gumCol = 0x663333;

    // Generate procedural scaly skin texture
    const makeSkinTex = (base: number, variation = 0.15) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const cx = c.getContext('2d')!;
      const r = (base >> 16) & 0xff, g = (base >> 8) & 0xff, b = base & 0xff;
      // Base color
      cx.fillStyle = `rgb(${r},${g},${b})`;
      cx.fillRect(0, 0, 64, 64);
      // Scale pattern — diamond shapes
      for (let sy = 0; sy < 64; sy += 4) {
        for (let sx = 0; sx < 64; sx += 4) {
          const off = ((sy / 4) % 2) * 2;
          const v = (Math.random() - 0.5) * variation;
          const sr = Math.max(0, Math.min(255, r + r * v));
          const sg = Math.max(0, Math.min(255, g + g * v));
          const sb = Math.max(0, Math.min(255, b + b * v));
          cx.fillStyle = `rgb(${sr|0},${sg|0},${sb|0})`;
          cx.fillRect(sx + off, sy, 3, 3);
          // Dark grid lines between scales
          cx.fillStyle = `rgba(0,0,0,0.15)`;
          cx.fillRect(sx + off + 3, sy, 1, 3);
          cx.fillRect(sx + off, sy + 3, 4, 1);
        }
      }
      // Random scratches/scars
      cx.strokeStyle = 'rgba(0,0,0,0.12)';
      cx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        cx.beginPath();
        cx.moveTo(Math.random() * 64, Math.random() * 64);
        cx.lineTo(Math.random() * 64, Math.random() * 64);
        cx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      return tex;
    };

    const mat = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({
      color: c, roughness: r, map: makeSkinTex(c),
    });
    // Smooth material for non-skin parts (teeth, eyes, claws)
    const smoothMat = (c: number, r = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

    // === BODY — rounded barrel shape using multiple overlapping boxes ===
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 2.4;
    trex.add(bodyGroup);

    // Main torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 3.0), mat(bodyMid));
    body.castShadow = true;
    bodyGroup.add(body);
    // Rounded top
    const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 2.6), mat(bodyDark));
    bodyTop.position.y = 0.8;
    bodyGroup.add(bodyTop);
    // Rounded sides with taper
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 2.4), mat(bodyMid));
      side.position.set(s * 0.85, 0.1, 0);
      bodyGroup.add(side);
      // Shoulder bulk
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.8), mat(bodyDark));
      shoulder.position.set(s * 0.75, 0.5, 0.8);
      bodyGroup.add(shoulder);
    }
    // Belly — lighter underside with wrinkle folds
    const bellyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.4), mat(bellyCol));
    bellyMesh.position.y = -0.7;
    bodyGroup.add(bellyMesh);
    // Belly wrinkle lines
    for (let i = -3; i <= 3; i++) {
      const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.06), mat(scaleCol));
      wrinkle.position.set(0, -0.5, i * 0.3);
      bodyGroup.add(wrinkle);
    }
    // Ribcage bumps — visible ribs under skin
    for (let i = -3; i <= 3; i++) {
      for (const s of [-1, 1]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.12), mat(bodyDark));
        rib.position.set(s * 0.82, -0.15 + Math.abs(i) * 0.04, i * 0.35);
        rib.rotation.z = s * 0.15;
        bodyGroup.add(rib);
      }
    }
    // Scale texture bumps along the back — rows of raised scales
    for (let i = -5; i <= 5; i++) {
      for (let j = -2; j <= 2; j++) {
        const bump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), mat(scaleCol));
        bump.position.set(j * 0.25, 0.95, i * 0.25);
        bodyGroup.add(bump);
      }
    }
    // Spine ridge — prominent bumps down the center
    for (let i = -4; i <= 5; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), mat(scaleCol));
      spine.position.set(0, 1.0, i * 0.28);
      bodyGroup.add(spine);
    }
    // Skin folds at joints — where body meets legs
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.15), mat(scaleCol));
        fold.position.set(s * 0.6, -0.55 - i * 0.08, -0.3 + i * 0.1);
        fold.rotation.z = s * 0.2;
        bodyGroup.add(fold);
      }
    }


    // === NECK — multiple segments for realistic curve ===
    const neckBase = new THREE.Group();
    neckBase.position.set(0, 0.3, 1.5);
    bodyGroup.add(neckBase);
    const neck1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), mat(bodyMid));
    neckBase.add(neck1);
    const neckMid = new THREE.Group();
    neckMid.position.set(0, 0.4, 0.4);
    neckBase.add(neckMid);
    const neck2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), mat(bodyLight));
    neckMid.add(neck2);
    // Neck wrinkles/folds — more of them for realism
    for (let i = 0; i < 5; i++) {
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.5), mat(scaleCol));
      fold.position.set(0, -0.3 + i * 0.15, 0);
      neckMid.add(fold);
    }
    // Neck muscle/tendon lines
    for (const s of [-1, 1]) {
      const tendon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.08), mat(bodyDark));
      tendon.position.set(s * 0.3, 0, 0.15);
      neckMid.add(tendon);
    }
    // Dewlap/throat pouch
    const dewlap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.5), mat(bellyCol));
    dewlap.position.set(0, -0.45, 0.1);
    neckBase.add(dewlap);
    const neck = neckBase; // for animation reference

    // === HEAD — detailed skull ===
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.6, 0.5);
    neckMid.add(headGroup);

    // Upper skull — tapered snout
    const skullBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), mat(bodyMid));
    skullBack.position.z = -0.1;
    headGroup.add(skullBack);
    const skullMid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), mat(bodyDark));
    skullMid.position.z = 0.4;
    headGroup.add(skullMid);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), mat(bodyMid));
    snout.position.z = 0.8;
    headGroup.add(snout);
    const snoutTip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.3), mat(bodyLight));
    snoutTip.position.z = 1.15;
    headGroup.add(snoutTip);
    // Brow ridges — thick and prominent
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.5), mat(scaleCol));
      brow.position.set(s * 0.4, 0.4, 0.2);
      headGroup.add(brow);
      // Extra brow bump
      const browBump = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), mat(bodyDark));
      browBump.position.set(s * 0.35, 0.48, 0.3);
      headGroup.add(browBump);
    }
    // Skull bumps/texture — more of them
    for (let i = 0; i < 10; i++) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), mat(scaleCol));
      bump.position.set((Math.random() - 0.5) * 0.9, 0.42, -0.3 + i * 0.18);
      headGroup.add(bump);
    }
    // Wrinkles on snout
    for (let i = 0; i < 4; i++) {
      const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.5 - i * 0.06, 0.02, 0.04), mat(scaleCol));
      wrinkle.position.set(0, 0.25 - i * 0.03, 0.5 + i * 0.18);
      headGroup.add(wrinkle);
    }
    // Battle scars — lines across the face
    const scarMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });
    const scar1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), scarMat);
    scar1.position.set(0.3, 0.15, 0.5);
    scar1.rotation.z = 0.3;
    headGroup.add(scar1);
    const scar2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), scarMat);
    scar2.position.set(-0.2, 0.1, 0.7);
    scar2.rotation.z = -0.2;
    headGroup.add(scar2);
    // Cheek/jaw muscle bulge
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.35), mat(bodyMid));
      cheek.position.set(s * 0.52, -0.05, 0.15);
      headGroup.add(cheek);
    }

    // Jaw (lower) — hinged
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.3, -0.1);
    headGroup.add(jawPivot);
    const jawMain = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.2), mat(bodyLight));
    jawMain.position.set(0, -0.1, 0.5);
    jawPivot.add(jawMain);
    const jawTip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), mat(bodyMid));
    jawTip.position.set(0, -0.1, 1.15);
    jawPivot.add(jawTip);
    // Gums
    const gumTop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.9), mat(gumCol));
    gumTop.position.set(0, -0.38, 0.6);
    headGroup.add(gumTop);
    const gumBot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.8), mat(gumCol));
    gumBot.position.set(0, 0.05, 0.5);
    jawPivot.add(gumBot);
    // Tongue
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.5), mat(tongueCol));
    tongue.position.set(0, 0.02, 0.4);
    jawPivot.add(tongue);

    // Teeth — top row (various sizes, banana-curved like real T-Rex)
    const topTeethSizes = [0.06, 0.1, 0.14, 0.18, 0.2, 0.18, 0.2, 0.18, 0.14, 0.1, 0.06];
    for (let i = 0; i < topTeethSizes.length; i++) {
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, topTeethSizes[i], 5),
        smoothMat(teethCol, 0.2)
      );
      tooth.position.set(-0.3 + i * 0.06, -0.42, 0.3 + Math.sin(i * 0.6) * 0.35);
      tooth.rotation.x = Math.PI;
      tooth.rotation.z = (i - 5) * 0.04;
      // Slight backward curve
      tooth.rotation.y = (i - 5) * 0.02;
      headGroup.add(tooth);
    }
    // Bottom teeth — slightly smaller
    for (let i = 0; i < 9; i++) {
      const h = 0.06 + Math.sin(i * 0.8) * 0.06;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, h, 5), smoothMat(teethCol, 0.2));
      tooth.position.set(-0.24 + i * 0.06, 0.08, 0.3 + Math.sin(i * 0.6) * 0.3);
      jawPivot.add(tooth);
    }
    // Saliva strands between teeth (thin white cylinders)
    for (let i = 0; i < 3; i++) {
      const strand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.15, 3),
        smoothMat(0xddddcc, 0.1)
      );
      strand.position.set(-0.1 + i * 0.1, -0.2, 0.5 + i * 0.1);
      headGroup.add(strand);
    }

    // Eyes — with iris detail, eyelids, veins
    for (const s of [-1, 1]) {
      // Deep eye socket
      const socket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.14), mat(scaleCol));
      socket.position.set(s * 0.48, 0.2, 0.24);
      headGroup.add(socket);
      // Eyeball
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), smoothMat(0xeeeedd, 0.15));
      eye.position.set(s * 0.48, 0.22, 0.32);
      headGroup.add(eye);
      // Bloodshot veins on eyeball
      for (let v = 0; v < 3; v++) {
        const vein = new THREE.Mesh(
          new THREE.CylinderGeometry(0.002, 0.002, 0.08, 3),
          smoothMat(0xaa3333, 0.2)
        );
        vein.position.set(s * 0.48 + Math.cos(v * 2) * 0.04, 0.22 + Math.sin(v * 2) * 0.04, 0.315);
        vein.rotation.z = v * 1.1;
        headGroup.add(vein);
      }
      // Iris — golden amber
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), smoothMat(eyeCol, 0.2));
      iris.position.set(s * 0.48, 0.22, 0.42);
      headGroup.add(iris);
      // Slit pupil — vertical
      const pup = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.01), smoothMat(pupilCol));
      pup.position.set(s * 0.48, 0.22, 0.425);
      headGroup.add(pup);
      // Upper eyelid (half-closed, menacing)
      const eyelid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), mat(bodyDark));
      eyelid.position.set(s * 0.48, 0.29, 0.34);
      eyelid.rotation.x = 0.2;
      headGroup.add(eyelid);
      // Under-eye wrinkles
      for (let w = 0; w < 2; w++) {
        const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.04), mat(scaleCol));
        wrinkle.position.set(s * 0.48, 0.12 - w * 0.04, 0.32);
        headGroup.add(wrinkle);
      }
    }

    // Nostrils — larger, more defined
    for (const s of [-1, 1]) {
      const nostrilOuter = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat(bodyDark));
      nostrilOuter.position.set(s * 0.16, 0.1, 1.28);
      headGroup.add(nostrilOuter);
      const nostrilInner = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), smoothMat(0x0a0a05));
      nostrilInner.position.set(s * 0.16, 0.1, 1.32);
      headGroup.add(nostrilInner);
    }

    // === TAIL — chain of pivoting segments ===
    const tailPivots: THREE.Group[] = [];
    let tailParent: THREE.Object3D = bodyGroup;
    let tailZ = -1.5;
    const tailSegs = 8;
    for (let i = 0; i < tailSegs; i++) {
      const s = 1 - i * 0.1;
      const pivot = new THREE.Group();
      if (i === 0) {
        pivot.position.set(0, 0, tailZ);
        tailParent.add(pivot);
      } else {
        pivot.position.set(0, 0, -0.55);
        tailParent.add(pivot);
      }
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.55 * s, 0.45 * s, 0.6),
        mat(i % 2 === 0 ? bodyMid : bodyDark)
      );
      seg.castShadow = true;
      pivot.add(seg);
      // Scale bumps on tail
      if (i < 5) {
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.2 * s, 4), mat(scaleCol));
        ridge.position.y = 0.25 * s;
        pivot.add(ridge);
      }
      tailPivots.push(pivot);
      tailParent = pivot;
    }
    // Tail tip
    const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), mat(bodyDark));
    tailTip.position.set(0, 0, -0.3);
    tailTip.rotation.x = Math.PI / 2;
    tailParent.add(tailTip);

    // === LEGS — jointed with muscle detail ===
    const legPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; footPivot: THREE.Group; side: number }[] = [];
    for (const side of [-1, 1]) {
      // Hip joint
      const hipBulge = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), mat(bodyMid));
      hipBulge.position.set(side * 0.7, 2.0, -0.2);
      trex.add(hipBulge);

      const thighPivot = new THREE.Group();
      thighPivot.position.set(side * 0.7, 1.8, -0.2);
      trex.add(thighPivot);
      // Thick muscular thigh
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.65), mat(bodyMid));
      thigh.position.y = -0.65;
      thigh.castShadow = true;
      thighPivot.add(thigh);
      // Thigh muscle bulge
      const thighMuscle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), mat(bodyLight));
      thighMuscle.position.set(side * 0.1, -0.3, 0.1);
      thighPivot.add(thighMuscle);

      // Knee joint
      const kneeBulge = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), mat(bodyDark));
      kneeBulge.position.y = -1.3;
      thighPivot.add(kneeBulge);

      const shinPivot = new THREE.Group();
      shinPivot.position.y = -1.3;
      thighPivot.add(shinPivot);
      // Shin — thinner
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.4), mat(bodyDark));
      shin.position.y = -0.55;
      shinPivot.add(shin);
      // Calf muscle
      const calf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.35), mat(bodyMid));
      calf.position.set(0, -0.25, -0.1);
      shinPivot.add(calf);

      // Ankle
      const ankleBulge = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 5), mat(bodyDark));
      ankleBulge.position.y = -1.1;
      shinPivot.add(ankleBulge);

      const footPivot = new THREE.Group();
      footPivot.position.y = -1.1;
      shinPivot.add(footPivot);
      // Foot pad
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.7), mat(bodyDark));
      foot.position.set(0, -0.08, 0.15);
      footPivot.add(foot);
      // 3 toes with claws — knuckle detail
      for (let c = -1; c <= 1; c++) {
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), mat(bodyMid));
        toe.position.set(c * 0.14, -0.08, 0.5);
        footPivot.add(toe);
        // Knuckle bump
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), mat(bodyDark));
        knuckle.position.set(c * 0.14, -0.02, 0.4);
        footPivot.add(knuckle);
        // Claw — curved, shiny keratin
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), smoothMat(clawCol, 0.3));
        claw.position.set(c * 0.14, -0.1, 0.72);
        claw.rotation.x = Math.PI / 2 + 0.2; // slight curve
        footPivot.add(claw);
      }
      // Back toe/dewclaw
      const dewclaw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), smoothMat(clawCol, 0.3));
      dewclaw.position.set(0, -0.05, -0.2);
      dewclaw.rotation.x = -Math.PI / 2;
      footPivot.add(dewclaw);
      // Skin wrinkles around ankle
      for (let w = 0; w < 3; w++) {
        const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.08), mat(scaleCol));
        wrinkle.position.set(0, 0.05 + w * 0.06, 0);
        footPivot.add(wrinkle);
      }

      legPivots.push({ thighPivot, shinPivot, footPivot, side });
    }

    // === TINY ARMS with clawed fingers ===
    const armPivots: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.65, 2.8, 1.3);
      trex.add(armPivot);
      // Upper arm
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), mat(bodyLight));
      upperArm.position.y = -0.18;
      armPivot.add(upperArm);
      // Forearm
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), mat(bodyMid));
      forearm.position.set(0, -0.45, 0.05);
      armPivot.add(forearm);
      // 2-fingered hand (T-Rex had 2 fingers!)
      for (const f of [-1, 1]) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), mat(bodyDark));
        finger.position.set(f * 0.04, -0.6, 0.05);
        armPivot.add(finger);
        const fClaw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 3), smoothMat(clawCol, 0.3));
        fClaw.position.set(f * 0.04, -0.68, 0.05);
        fClaw.rotation.x = Math.PI;
        armPivot.add(fClaw);
      }
      armPivot.rotation.z = side * 0.5;
      armPivot.rotation.x = -0.3;
      armPivots.push(armPivot);
    }

    // === BACK RIDGES — dorsal bumps ===
    for (let i = -3; i <= 4; i++) {
      const h = 0.15 + Math.sin((i + 3) * 0.4) * 0.1;
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 4), mat(scaleCol));
      ridge.position.set(0, 3.35, -0.3 + i * 0.35);
      trex.add(ridge);
    }

    // Scale for presence
    trex.scale.set(3, 3, 3);

    // Start position — edge of map, facing toward landing spot
    const angle = Math.atan2(targetX, targetZ);
    const startDist = 500;
    const startX = targetX - Math.sin(angle) * startDist;
    const startZ = targetZ - Math.cos(angle) * startDist;

    trex.position.set(startX, 0, startZ);
    trex.rotation.y = angle;
    this.scene3d.add(trex);

    // Place player model on the T-Rex's back — sitting pose
    this.playerModel.visible = true;
    this.playerPos.set(startX, 0, startZ);

    // Pose player: sitting with legs dangling
    this.pLeftThigh.rotation.x = -1.4;   // legs forward (sitting)
    this.pRightThigh.rotation.x = -1.4;
    this.pLeftShin.rotation.x = 1.2;     // shins hang down
    this.pRightShin.rotation.x = 1.2;
    this.pTorso.rotation.x = -0.1;       // lean back slightly, relaxed
    // Arms resting at sides
    this.pLeftUpperArm.rotation.x = -0.3;
    this.pLeftUpperArm.rotation.z = 0.3;
    this.pRightUpperArm.rotation.x = -0.3;
    this.pRightUpperArm.rotation.z = -0.3;

    // HUD overlay for the ride
    const rideHud = document.createElement('div');
    rideHud.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
    const rideText = document.createElement('div');
    rideText.textContent = 'RIDING TO BATTLE...';
    rideText.style.cssText = 'position:absolute;top:30px;left:50%;transform:translateX(-50%);color:#fff;font-family:sans-serif;font-size:24px;font-weight:bold;text-shadow:0 0 15px #f80,2px 2px 4px #000;letter-spacing:4px;';
    rideHud.appendChild(rideText);
    document.body.appendChild(rideHud);

    // Look-around controls — just move mouse or swipe to look, no click needed
    let camYaw = 0;
    let camPitch = 0;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const touchOverlay = document.createElement('div');
    touchOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;touch-action:none;cursor:none;';
    document.body.appendChild(touchOverlay);

    // Mouse — position on screen maps directly to camera angle (no clicking needed)
    const onMouseMove = (e: MouseEvent) => {
      // Map mouse X position to yaw: full 360 degree orbit
      camYaw = ((e.clientX / screenW) - 0.5) * Math.PI * 4;
      // Map mouse Y position to pitch: top = look up, bottom = look down
      camPitch = ((e.clientY / screenH) - 0.5) * 2.0;
      camPitch = Math.max(-1.2, Math.min(1.5, camPitch));
    };
    window.addEventListener('mousemove', onMouseMove);

    // Touch — swipe to adjust look angle
    let lastTouchX = -1, lastTouchY = -1;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0 && lastTouchX >= 0) {
        camYaw += (e.touches[0].clientX - lastTouchX) * 0.015;
        camPitch += (e.touches[0].clientY - lastTouchY) * 0.01;
        camPitch = Math.max(-1.2, Math.min(1.5, camPitch));
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    };
    const onTouchEnd = (e: TouchEvent) => { e.preventDefault(); lastTouchX = -1; };
    touchOverlay.addEventListener('touchstart', onTouchStart, { passive: false });
    touchOverlay.addEventListener('touchmove', onTouchMove, { passive: false });
    touchOverlay.addEventListener('touchend', onTouchEnd, { passive: false });

    const cleanupLookControls = () => {
      window.removeEventListener('mousemove', onMouseMove);
      touchOverlay.remove();
    };

    // Animate the ride
    const rideSpeed = 20; // world units per second (slower ride)
    const totalDist = Math.sqrt((targetX - startX) ** 2 + (targetZ - startZ) ** 2);
    const rideDuration = totalDist / rideSpeed;
    let rideTime = 0;
    const rideClock = new THREE.Clock();
    let legPhase = 0;

    const animateRide = () => {
      const dt = Math.min(rideClock.getDelta(), 0.05);
      rideTime += dt;
      const t = Math.min(rideTime / rideDuration, 1);

      // Ease: start slow, cruise, slow at end
      const eased = t < 0.15 ? t * t / 0.15
        : t > 0.85 ? 1 - (1 - t) * (1 - t) / 0.15
        : t;

      // Position
      const px = startX + (targetX - startX) * eased;
      const pz = startZ + (targetZ - startZ) * eased;
      trex.position.set(px, 0, pz);

      // Running cycle phase
      legPhase += dt * 7;
      const runCycle = legPhase;

      // Body bounce — up/down with each stride
      const bounce = Math.abs(Math.sin(runCycle)) * 0.2;
      bodyGroup.position.y = 2.4 + bounce;

      // Body rocks side to side with weight transfer
      bodyGroup.rotation.z = Math.sin(runCycle) * 0.04;
      bodyGroup.rotation.x = Math.sin(runCycle * 2) * 0.02; // slight forward lean bob

      // Neck sways with body momentum
      neckBase.rotation.x = Math.sin(runCycle) * 0.08;
      neckMid.rotation.x = Math.sin(runCycle + 0.3) * 0.06;

      // Head bobs — looks forward, slight nod with each step
      headGroup.rotation.x = Math.sin(runCycle) * 0.1;
      headGroup.rotation.y = Math.sin(runCycle * 0.5) * 0.03;

      // Jaw bounces open slightly on heavy footfalls
      jawPivot.rotation.x = Math.abs(Math.sin(runCycle)) * 0.08;

      // Leg running animation — opposite legs alternate
      for (let i = 0; i < legPivots.length; i++) {
        const leg = legPivots[i];
        const phase = runCycle + (i === 0 ? 0 : Math.PI);
        // Thigh swings forward and back
        leg.thighPivot.rotation.x = Math.sin(phase) * 0.7;
        // Shin bends back more when leg is behind (like a real knee)
        leg.shinPivot.rotation.x = Math.max(0, -Math.sin(phase)) * 0.8 + 0.2;
        // Foot compensates to stay flat-ish
        leg.footPivot.rotation.x = -leg.thighPivot.rotation.x * 0.3 - leg.shinPivot.rotation.x * 0.4;
      }

      // Tiny arms bounce with steps
      for (let i = 0; i < armPivots.length; i++) {
        const phase = runCycle + (i === 0 ? Math.PI : 0);
        armPivots[i].rotation.x = -0.3 + Math.sin(phase) * 0.3;
      }

      // Tail — wave propagates down chain of pivots
      for (let i = 0; i < tailPivots.length; i++) {
        const delay = i * 0.4;
        tailPivots[i].rotation.y = Math.sin(runCycle + delay) * (0.12 + i * 0.02);
        tailPivots[i].rotation.x = Math.sin(runCycle * 0.5 + delay) * 0.03;
      }

      // Ground shake effect — slight camera offset
      const shake = t < 0.9 ? Math.sin(rideTime * 12) * 0.05 : 0;

      // Player rides on top — sitting
      this.playerPos.set(px, 0, pz);
      const seatBounce = Math.abs(Math.sin(runCycle)) * 0.15;
      this.playerModel.position.set(px, 9.5 + seatBounce, pz);
      this.playerModel.rotation.y = angle + Math.PI;

      // Legs dangle/swing slightly while sitting — lazy kick
      this.pLeftShin.rotation.x = 1.2 + Math.sin(rideTime * 1.5) * 0.25;
      this.pRightShin.rotation.x = 1.2 + Math.sin(rideTime * 1.5 + 2) * 0.25;
      // Feet flex
      this.pLeftThigh.rotation.x = -1.4 + Math.sin(rideTime * 0.8) * 0.05;
      this.pRightThigh.rotation.x = -1.4 + Math.sin(rideTime * 0.8 + 1.5) * 0.05;

      // Camera orbits around the T-Rex based on drag input — higher up to see rider
      const camDist = 18;
      const camHeight = 14 + camPitch * 6;
      const totalAngle = angle + Math.PI + camYaw; // behind the T-Rex + user offset
      const camX = px + Math.sin(totalAngle) * camDist;
      const camZ = pz + Math.cos(totalAngle) * camDist;
      this.camera.position.set(camX + shake, camHeight, camZ);
      this.camera.lookAt(px, 8, pz);

      // Dust particles on the ground
      if (Math.random() < 0.4) {
        const dustGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.4, 4, 4);
        const dustMat = new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0.5 });
        const dust = new THREE.Mesh(dustGeo, dustMat);
        dust.position.set(
          px + (Math.random() - 0.5) * 3,
          Math.random() * 0.5,
          pz - Math.cos(angle) * 2 + (Math.random() - 0.5) * 2
        );
        this.scene3d.add(dust);
        // Fade and remove dust
        const dustStart = rideTime;
        const fadeDust = () => {
          const age = rideTime - dustStart;
          if (age > 0.8 || t >= 1) {
            this.scene3d.remove(dust);
            dustGeo.dispose();
            dustMat.dispose();
          } else {
            dust.position.y += 0.02;
            dustMat.opacity = 0.5 * (1 - age / 0.8);
          }
        };
        (dust as any)._fade = fadeDust;
      }

      // Fade dust particles
      this.scene3d.children.forEach((child: any) => {
        if (child._fade) child._fade();
      });

      this.threeRenderer.render(this.scene3d, this.camera);

      if (t >= 1) {
        // Arrived! T-Rex roars and disappears
        rideText.textContent = 'GO!';
        rideText.style.color = '#ff4400';
        rideText.style.fontSize = '48px';

        // Remove T-Rex with a quick fade
        setTimeout(() => {
          cleanupLookControls();
          this.scene3d.remove(trex);
          rideHud.remove();
          // Reset player pose
          this.pLeftThigh.rotation.set(0, 0, 0);
          this.pRightThigh.rotation.set(0, 0, 0);
          this.pLeftShin.rotation.set(0, 0, 0);
          this.pRightShin.rotation.set(0, 0, 0);
          this.pTorso.rotation.set(0, 0, 0);
          this.pLeftUpperArm.rotation.set(0, 0, 0);
          this.pLeftForearm.rotation.set(0, 0, 0);
          this.pRightUpperArm.rotation.set(0, 0, 0);
          this.pRightForearm.rotation.set(0, 0, 0);
          this.pHead.rotation.set(0, 0, 0);
          // Set player at landing spot
          this.playerPos.set(targetX, this.getTerrainHeight(targetX, targetZ), targetZ);
          this.playerModel.position.set(targetX, this.getTerrainHeight(targetX, targetZ), targetZ);
          onLand();
        }, 600);
        return;
      }

      requestAnimationFrame(animateRide);
    };

    rideClock.getDelta(); // prime the clock
    requestAnimationFrame(animateRide);
  }

  private startGameLoop(): void {
    this.clock = new THREE.Clock();
    // Animation loop
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.updatePlayer(dt);
      this.updateNPCs(dt);
      this.updateBullets(dt);
      this.updateCars(dt);
      this.updateTRexEatAnim(dt);
      this.updateBearBoss(dt);
      if (this.isMultiplayer) this.updateMultiplayer(dt);
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      this.checkPickups();
      // Update health bars
      this.updateHealthBar(this.playerHealthCtx, this.playerHealthTex, this.playerHP, this.playerMaxHP);
      for (const npc of this.npcs) {
        if (!npc.dead) {
          this.updateHealthBar(npc.healthCtx, npc.healthTex, npc.hp, 2);
          // Make health bar face camera
          npc.healthBar.lookAt(this.camera.position);
        }
      }
      this.playerHealthBar.lookAt(this.camera.position);
      // Spawn boss/NPCs based on game mode
      const aliveCount = this.npcs.filter(n => !n.dead).length;
      if (this.aliveText) {
        this.aliveText.textContent = this.bossSpawned && !this.bossDead ? 'BOSS FIGHT!' : `Alive: ${aliveCount}`;
      }
      // Win when all NPCs are dead
      if (aliveCount === 0) {
        this.showVictory();
      }
      if (!this.bossDead && this.bossSpawned && this.bossHealthBar) {
        this.updateHealthBar(this.bossHealthCtx, this.bossHealthTex, this.bossHP, this.bossMaxHP);
        this.bossHealthBar.lookAt(this.camera.position);
      }
      // Animate fountain water
      const ft = this.clock.elapsedTime;
      const fp = this.fountainParts;
      // Water surfaces ripple up and down
      for (let i = 0; i < fp.waters.length; i++) {
        const w = fp.waters[i];
        const baseY = [1.15, 1.95, 8.25][i] ?? 1.15;
        w.position.y = baseY + Math.sin(ft * 2 + i) * 0.04;
        w.rotation.y = ft * 0.3 + i;
      }
      // Main spout pulses height
      if (fp.spout) {
        const pulse = 1 + Math.sin(ft * 3) * 0.15;
        fp.spout.scale.y = pulse;
        fp.spout.position.y = 13.3 + (pulse - 1) * 5;
      }
      // Spray wobbles
      if (fp.spray) {
        fp.spray.position.y = 19 + Math.sin(ft * 3) * 1.5;
        fp.spray.scale.set(1 + Math.sin(ft * 4) * 0.2, 1, 1 + Math.cos(ft * 4) * 0.2);
        fp.spray.rotation.y = ft * 2;
      }
      // Outer jets pulse at different phases
      for (let j = 0; j < fp.jets.length; j++) {
        const jet = fp.jets[j];
        const phase = ft * 2.5 + j * 0.8;
        const h = 1 + Math.sin(phase) * 0.4;
        jet.scale.y = h;
        jet.position.y = 2.7 + (h - 1) * 1.5;
      }
      // Falling water droplets
      for (const d of fp.droplets) {
        const fallDist = d.startY - d.endY;
        const progress = Math.max(0, (d.startY - d.mesh.position.y) / fallDist);
        const speed = 8 + progress * 12;
        d.mesh.position.y -= dt * speed;
        d.mesh.position.x += d.vel.x * dt;
        d.mesh.position.z += d.vel.z * dt;
        d.mesh.scale.y = 1 + progress * 3;
        d.mesh.scale.x = 1 - progress * 0.4;
        d.mesh.scale.z = 1 - progress * 0.4;
        if (d.mesh.position.y <= d.endY) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 2.5;
          d.mesh.position.set(d.cx + Math.sin(a) * r, d.startY + Math.random() * 2, d.cz + Math.cos(a) * r);
          d.mesh.scale.set(1, 1, 1);
        }
      }

      this.threeRenderer.render(this.scene3d, this.camera);
    };
    animate();
  }

  private createEiffelTower(): void {
    // Silver metallic Eiffel Tower
    const ironMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.85, roughness: 0.2, emissive: 0x111111, emissiveIntensity: 0.05 });
    const darkIron = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.15, emissive: 0x0a0a0a, emissiveIntensity: 0.05 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb5a99a, roughness: 0.95 });
    const tower = new THREE.Group();

    // Total height ~100. Proportions inspired by the real tower:
    // Base spread 15 each side (30 across), first floor y=25, second floor y=48, top y=68, spire to 100
    const totalLegH = 68; // legs run from ground to top platform
    const baseSpread = 15; // half-width at ground level

    // Exponential-curve profile: spread(t) where t=0 is ground, t=1 is top of legs
    // Real Eiffel uses an exponential; we approximate: spread = baseSpread * e^(-2.8*t)
    const spreadAt = (t: number) => baseSpread * Math.exp(-2.8 * t);

    // Helper: orient a cylinder between two 3D points
    const makeCylSegment = (
      p0: THREE.Vector3, p1: THREE.Vector3,
      radiusBottom: number, radiusTop: number, mat: THREE.Material
    ): THREE.Mesh => {
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const len = dir.length();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, len, 10), mat);
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      cyl.position.copy(mid);
      // Orient: cylinder default axis is Y-up
      const up = new THREE.Vector3(0, 1, 0);
      const d = dir.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(up, d);
      cyl.quaternion.copy(quat);
      cyl.castShadow = true;
      return cyl;
    };

    // === FOUR CURVED LEGS ===
    const legSegs = 20;
    const legCorners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    // Store points along each leg for connecting braces later
    const legPoints: THREE.Vector3[][] = [[], [], [], []];

    for (let ci = 0; ci < 4; ci++) {
      const [sx, sz] = legCorners[ci];
      for (let s = 0; s <= legSegs; s++) {
        const t = s / legSegs;
        const y = t * totalLegH;
        const sp = spreadAt(t);
        legPoints[ci].push(new THREE.Vector3(sx * sp, y, sz * sp));
      }
      // Draw cylinder segments along the curve
      for (let s = 0; s < legSegs; s++) {
        const t = s / legSegs;
        const rBot = 1.8 * (1 - t * 0.7);
        const rTop = 1.8 * (1 - (t + 1 / legSegs) * 0.7);
        tower.add(makeCylSegment(legPoints[ci][s], legPoints[ci][s + 1], rBot, rTop, ironMat));
      }
    }

    // === SMOOTH ARCHES between adjacent legs ===
    // Arches span between each pair of adjacent legs at base, peaking ~20 units high
    const archHeight = 20;
    const archSegs = 16;
    for (let face = 0; face < 4; face++) {
      const c0 = legCorners[face];
      const c1 = legCorners[(face + 1) % 4];
      for (let i = 0; i < archSegs; i++) {
        const a0 = (i / archSegs) * Math.PI;
        const a1 = ((i + 1) / archSegs) * Math.PI;
        // Parametric position along arch
        const frac0 = i / archSegs;
        const frac1 = (i + 1) / archSegs;
        const sp0 = spreadAt(0);
        const x0 = c0[0] * sp0 + (c1[0] * sp0 - c0[0] * sp0) * frac0;
        const z0 = c0[1] * sp0 + (c1[1] * sp0 - c0[1] * sp0) * frac0;
        const x1 = c0[0] * sp0 + (c1[0] * sp0 - c0[0] * sp0) * frac1;
        const z1 = c0[1] * sp0 + (c1[1] * sp0 - c0[1] * sp0) * frac1;
        const y0 = Math.sin(a0) * archHeight;
        const y1 = Math.sin(a1) * archHeight;
        const p0 = new THREE.Vector3(x0, y0, z0);
        const p1 = new THREE.Vector3(x1, y1, z1);
        tower.add(makeCylSegment(p0, p1, 0.6, 0.6, darkIron));
      }
    }

    // === HORIZONTAL RING BRACES at key levels ===
    const braceLevels = [5, 10, 15, 20, 25, 32, 40, 48, 55, 62];
    for (const by of braceLevels) {
      const t = by / totalLegH;
      const sp = spreadAt(t);
      // Connect adjacent legs with cylinders
      for (let face = 0; face < 4; face++) {
        const c0 = legCorners[face];
        const c1 = legCorners[(face + 1) % 4];
        const p0 = new THREE.Vector3(c0[0] * sp, by, c0[1] * sp);
        const p1 = new THREE.Vector3(c1[0] * sp, by, c1[1] * sp);
        tower.add(makeCylSegment(p0, p1, 0.3, 0.3, darkIron));
      }
    }

    // === FIRST FLOOR PLATFORM (y=25) ===
    const p1y = 25;
    const p1sp = spreadAt(p1y / totalLegH);
    const p1Size = p1sp * 2 + 3;
    const platform1 = new THREE.Mesh(new THREE.CylinderGeometry(p1Size / 2 + 1, p1Size / 2 + 1, 1.0, 4), darkIron);
    platform1.position.y = p1y;
    platform1.rotation.y = Math.PI / 4;
    tower.add(platform1);
    // Railing posts
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const r = p1Size / 2 + 0.5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6), darkIron);
      post.position.set(Math.cos(angle) * r, p1y + 1.5, Math.sin(angle) * r);
      tower.add(post);
    }
    // Top rail ring (torus)
    const rail1 = new THREE.Mesh(new THREE.TorusGeometry(p1Size / 2 + 0.5, 0.12, 6, 24), darkIron);
    rail1.position.y = p1y + 2.5;
    rail1.rotation.x = Math.PI / 2;
    tower.add(rail1);

    // === SECOND FLOOR PLATFORM (y=48) ===
    const p2y = 48;
    const p2sp = spreadAt(p2y / totalLegH);
    const p2Size = p2sp * 2 + 2;
    const platform2 = new THREE.Mesh(new THREE.CylinderGeometry(p2Size / 2 + 0.5, p2Size / 2 + 0.5, 0.8, 4), darkIron);
    platform2.position.y = p2y;
    platform2.rotation.y = Math.PI / 4;
    tower.add(platform2);
    // Railing
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const r = p2Size / 2 + 0.3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6), darkIron);
      post.position.set(Math.cos(angle) * r, p2y + 1.2, Math.sin(angle) * r);
      tower.add(post);
    }
    const rail2 = new THREE.Mesh(new THREE.TorusGeometry(p2Size / 2 + 0.3, 0.1, 6, 20), darkIron);
    rail2.position.y = p2y + 2.0;
    rail2.rotation.x = Math.PI / 2;
    tower.add(rail2);

    // === TOP PLATFORM (y=68) ===
    const topY = 68;
    const topPlatform = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 1.0, 8), darkIron);
    topPlatform.position.y = topY;
    tower.add(topPlatform);
    // Observation room - octagonal prism
    const obsRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 3.0, 8), ironMat);
    obsRoom.position.y = topY + 2.0;
    tower.add(obsRoom);
    // Window band
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4, metalness: 0.3 });
    const windowRing = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.6, 4, 8), windowMat);
    windowRing.position.y = topY + 2.0;
    windowRing.rotation.x = Math.PI / 2;
    tower.add(windowRing);

    // === UPPER SHAFT — tapering cylinder columns from platform2 to top ===
    const shaftBot = p2y + 1;
    const shaftTop = topY;
    const shaftSegs = 10;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let s = 0; s < shaftSegs; s++) {
        const t0 = s / shaftSegs;
        const t1 = (s + 1) / shaftSegs;
        const y0 = shaftBot + t0 * (shaftTop - shaftBot);
        const y1 = shaftBot + t1 * (shaftTop - shaftBot);
        const r0 = 2.5 * (1 - t0 * 0.65);
        const r1 = 2.5 * (1 - t1 * 0.65);
        const p0 = new THREE.Vector3(cx * r0, y0, cz * r0);
        const p1 = new THREE.Vector3(cx * r1, y1, cz * r1);
        tower.add(makeCylSegment(p0, p1, 0.5 * (1 - t0 * 0.4), 0.5 * (1 - t1 * 0.4), ironMat));
      }
    }
    // Horizontal rings on upper shaft
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const y = shaftBot + t * (shaftTop - shaftBot);
      const r = 2.5 * (1 - t * 0.65) + 0.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.15, 6, 12), darkIron);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      tower.add(ring);
    }

    // === SPIRE (tapering from top platform to 100) ===
    const spire1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.8, 10, 10), ironMat);
    spire1.position.y = topY + 8.5;
    spire1.castShadow = true;
    tower.add(spire1);
    const spire2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 10, 10), ironMat);
    spire2.position.y = topY + 18;
    spire2.castShadow = true;
    tower.add(spire2);
    const spire3 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 8, 8), ironMat);
    spire3.position.y = topY + 27;
    spire3.castShadow = true;
    tower.add(spire3);
    // Antenna mast brackets
    for (let a = 0; a < 4; a++) {
      const angle = (a / 4) * Math.PI * 2;
      const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), darkIron);
      bracket.position.set(Math.cos(angle) * 1.0, topY + 7, Math.sin(angle) * 1.0);
      bracket.rotation.z = Math.cos(angle) * 0.3;
      bracket.rotation.x = Math.sin(angle) * 0.3;
      tower.add(bracket);
    }
    // Golden tip
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xdaa520, emissive: 0xdaa520, emissiveIntensity: 0.6, metalness: 0.9 })
    );
    beacon.position.y = topY + 31.5;
    tower.add(beacon);
    const beaconLight = new THREE.PointLight(0xffcc66, 3, 50);
    beaconLight.position.y = topY + 31.5;
    tower.add(beaconLight);

    // === GROUND BASE — concrete foundation pads ===
    for (const [sx, sz] of legCorners) {
      const sp = spreadAt(0);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 1.5, 8), concreteMat);
      pad.position.set(sx * sp, 0.75, sz * sp);
      tower.add(pad);
    }
    // Central plaza with path lines
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 0.2, 32), concreteMat);
    plaza.position.y = 0.1;
    tower.add(plaza);
    // Darker path ring
    const pathRing = new THREE.Mesh(new THREE.TorusGeometry(16, 1.2, 4, 32),
      new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.95 }));
    pathRing.rotation.x = Math.PI / 2;
    pathRing.position.y = 0.15;
    tower.add(pathRing);

    // Warm golden up-lights around base (like real tower at night)
    for (const [sx, sz] of legCorners) {
      const sp = spreadAt(0);
      const upLight = new THREE.SpotLight(0xffcc77, 3, 80, Math.PI / 6, 0.5);
      upLight.position.set(sx * sp * 0.5, 1, sz * sp * 0.5);
      upLight.target.position.set(sx * sp * 0.3, 40, sz * sp * 0.3);
      tower.add(upLight);
      tower.add(upLight.target);
    }
    // Central uplighting
    const centerUp = new THREE.PointLight(0xffbb55, 1.5, 60);
    centerUp.position.set(0, 2, 0);
    tower.add(centerUp);

    // === BEAUTIFUL FOUNTAIN in the center under the tower ===
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf0e8dd, roughness: 0.3, metalness: 0.05 });
    const marbleDark = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.35, metalness: 0.08 });
    const goldTrim = new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.9, roughness: 0.1, emissive: 0x442200, emissiveIntensity: 0.15 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3399cc, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.05 });
    const spoutMat = new THREE.MeshStandardMaterial({ color: 0x77ccee, transparent: true, opacity: 0.35, roughness: 0.02, metalness: 0.1 });

    // === OUTER POOL — grand octagonal basin ===
    const outerPool = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.5, 1.2, 8), marbleMat);
    outerPool.position.y = 0.6;
    tower.add(outerPool);
    // Water surface
    const outerWater = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.08, 32), waterMat);
    outerWater.position.y = 1.15;
    tower.add(outerWater);
    this.fountainParts.waters.push(outerWater);
    // Gold rim
    const outerRim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.35, 8, 8), goldTrim);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = 1.2;
    tower.add(outerRim);

    // === INNER RAISED POOL ===
    const innerPool = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.8, 24), marbleDark);
    innerPool.position.y = 1.6;
    tower.add(innerPool);
    const innerWater = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.06, 24), waterMat);
    innerWater.position.y = 1.95;
    tower.add(innerWater);
    this.fountainParts.waters.push(innerWater);
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.2, 8, 24), goldTrim);
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = 2;
    tower.add(innerRim);

    // === CENTRAL PEDESTAL — ornate column ===
    // Base
    const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 0.8, 16), marbleMat);
    pedBase.position.y = 2.4;
    tower.add(pedBase);
    // Column with fluting (multiple thin cylinders around)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 4, 16), marbleMat);
    column.position.y = 4.8;
    tower.add(column);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 4), marbleDark);
      flute.position.set(Math.sin(a) * 1.15, 4.8, Math.cos(a) * 1.15);
      tower.add(flute);
    }
    // Capital (top of column)
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.0, 0.6, 16), marbleMat);
    capital.position.y = 7.2;
    tower.add(capital);
    // Gold band
    const goldBand = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 6, 16), goldTrim);
    goldBand.rotation.x = Math.PI / 2;
    goldBand.position.y = 7;
    tower.add(goldBand);

    // === TOP BOWL — scalloped ===
    const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 1.4, 1.0, 12), marbleMat);
    topBowl.position.y = 7.8;
    tower.add(topBowl);
    const topBowlWater = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.06, 16), waterMat);
    topBowlWater.position.y = 8.25;
    tower.add(topBowlWater);
    this.fountainParts.waters.push(topBowlWater);
    // Scalloped edge — small bumps around rim
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const scallop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), marbleMat);
      scallop.position.set(Math.sin(a) * 2.8, 8.3, Math.cos(a) * 2.8);
      scallop.scale.set(1, 0.5, 1);
      tower.add(scallop);
    }
    // Gold rim on top bowl
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 6, 24), goldTrim);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = 8.35;
    tower.add(topRim);

    // === CENTRAL SPOUT — tall graceful water jet ===
    const mainSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 10, 8), spoutMat);
    mainSpout.position.y = 13.3;
    tower.add(mainSpout);
    this.fountainParts.spout = mainSpout;
    // Spray at top — expanding cone
    const spray = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 12, 1, true), spoutMat);
    spray.position.y = 19;
    spray.rotation.x = Math.PI;
    tower.add(spray);
    this.fountainParts.spray = spray;

    // === CASCADING STREAMS from top bowl to inner pool ===
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      // Graceful arcing stream
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 6), spoutMat);
      const sx = Math.sin(a) * 2.5;
      const sz = Math.cos(a) * 2.5;
      stream.position.set(sx * 0.8, 5.5, sz * 0.8);
      stream.rotation.x = Math.cos(a) * 0.7;
      stream.rotation.z = -Math.sin(a) * 0.7;
      tower.add(stream);
    }

    // === OUTER RING JETS — 8 mini copies of the main spout (same shapes) ===
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const jx = Math.sin(a) * 6;
      const jz = Math.cos(a) * 6;
      // Gold nozzle at base
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8), goldTrim);
      nozzle.position.set(jx, 1.2, jz);
      tower.add(nozzle);
      // Mini spout cylinder — same shape as main spout (CylinderGeometry), just smaller
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3, 8), spoutMat);
      jet.position.set(jx, 2.7, jz);
      tower.add(jet);
      this.fountainParts.jets.push(jet);
      // Mini cone spray at top — SAME as main spray (ConeGeometry, upside down), just smaller
      const miniSpray = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 12, 1, true), spoutMat);
      miniSpray.position.set(jx, 4.5, jz);
      miniSpray.rotation.x = Math.PI;
      tower.add(miniSpray);
    }

    // === DECORATIVE FIGURES — 4 cherub-like spheres on pedestal ===
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const figGroup = new THREE.Group();
      // Body
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), marbleMat);
      body.scale.set(1, 1.3, 0.8);
      figGroup.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), marbleMat);
      head.position.y = 0.5;
      figGroup.add(head);
      // Arms (holding vase)
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4), marbleMat);
        arm.position.set(side * 0.25, 0.2, 0.15);
        arm.rotation.z = side * -0.5;
        arm.rotation.x = -0.3;
        figGroup.add(arm);
      }
      figGroup.position.set(Math.sin(a) * 1.6, 7.3, Math.cos(a) * 1.6);
      figGroup.rotation.y = -a;
      tower.add(figGroup);
    }

    // === SPLASH & FOAM around water landings ===
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xeeffff, transparent: true, opacity: 0.4 });
    // Inner pool foam ring
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 1.5;
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 4, 4), foamMat);
      foam.position.set(Math.sin(a) * r, 2, Math.cos(a) * r);
      tower.add(foam);
    }
    // Outer pool foam
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 3;
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 4, 4), foamMat);
      foam.position.set(Math.sin(a) * r, 1.2, Math.cos(a) * r);
      tower.add(foam);
    }

    // === FALLING WATER DROPLETS ===
    const dropMat = new THREE.MeshBasicMaterial({ color: 0x88ccee, transparent: true, opacity: 0.6 });
    // Main spout — 500 drops
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.5;
      const startY = 13 + Math.random() * 7;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 4), dropMat);
      drop.position.set(Math.sin(a) * r, startY, Math.cos(a) * r);
      tower.add(drop);
      this.fountainParts.droplets.push({ mesh: drop, vel: new THREE.Vector3(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6), startY, endY: 8.3, cx: 0, cz: 0 });
    }
    // Top bowl overflow drops
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.2;
      const startY = 8.3 + Math.random() * 0.5;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 4), dropMat);
      drop.position.set(Math.sin(a) * 2.8, startY, Math.cos(a) * 2.8);
      tower.add(drop);
      this.fountainParts.droplets.push({ mesh: drop, vel: new THREE.Vector3(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4), startY, endY: 2.0, cx: 0, cz: 0 });
    }
    // Inner pool overflow drops
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
      const startY = 2.0 + Math.random() * 0.3;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 4), dropMat);
      drop.position.set(Math.sin(a) * 4, startY, Math.cos(a) * 4);
      tower.add(drop);
      this.fountainParts.droplets.push({ mesh: drop, vel: new THREE.Vector3(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3), startY, endY: 1.15, cx: 0, cz: 0 });
    }
    // Each small jet — 80 drops each, same as the big spout, centered on jet position
    for (let i = 0; i < 8; i++) {
      const ja = (i / 8) * Math.PI * 2;
      const jx = Math.sin(ja) * 6;
      const jz = Math.cos(ja) * 6;
      for (let j = 0; j < 80; j++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.5;
        const startY = 3 + Math.random() * 2;
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 4), dropMat);
        drop.position.set(jx + Math.sin(a) * r, startY, jz + Math.cos(a) * r);
        tower.add(drop);
        this.fountainParts.droplets.push({ mesh: drop, vel: new THREE.Vector3(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6), startY, endY: 1.15, cx: jx, cz: jz });
      }
    }

    // === LIGHTING — magical blue and warm gold ===
    const waterLight = new THREE.PointLight(0x66bbff, 2, 20);
    waterLight.position.set(0, 3, 0);
    tower.add(waterLight);
    const topGlow = new THREE.PointLight(0x88ddff, 1.5, 15);
    topGlow.position.set(0, 12, 0);
    tower.add(topGlow);
    // Gold accent lights at base
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const gl = new THREE.PointLight(0xffcc55, 0.8, 8);
      gl.position.set(Math.sin(a) * 7, 1, Math.cos(a) * 7);
      tower.add(gl);
    }

    tower.position.set(0, 0, 0);
    tower.scale.set(0.5, 0.5, 0.5);
    tower.castShadow = true;
    this.scene3d.add(tower);

    // No colliders — player can walk inside and climb the tower
  }

  private createTrees(): void {
    const trunkMats = [
      new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 }),
    ];
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d5a1e }),
      new THREE.MeshStandardMaterial({ color: 0x3a6a2a }),
      new THREE.MeshStandardMaterial({ color: 0x1a4a0a }),
      new THREE.MeshStandardMaterial({ color: 0x2a5a18 }),
      new THREE.MeshStandardMaterial({ color: 0x1a3a0a }),
      new THREE.MeshStandardMaterial({ color: 0x4a7a10 }), // light green variant
      new THREE.MeshStandardMaterial({ color: 0x3a6010 }), // mid-light green variant
    ];
    const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a3a0a });
    const barkRingMat = new THREE.MeshStandardMaterial({ color: 0x3a2008, roughness: 1.0 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a2e0e, roughness: 0.95 });
    const fallenLeafMats = [
      new THREE.MeshStandardMaterial({ color: 0x8a6a20, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x6a4a10, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x9a5a10, side: THREE.DoubleSide }),
    ];

    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 950;
      const z = (Math.random() - 0.5) * 950;
      if (this.isOnRoad(x, z)) continue;

      const group = new THREE.Group();
      const trunkMat = trunkMats[Math.floor(Math.random() * trunkMats.length)];
      const isPine = Math.random() > 0.5;

      // Whole-tree scale variation (0.7-1.3x)
      const treeScale = 0.7 + Math.random() * 0.6;

      if (isPine) {
        // Pine / conifer tree
        const trunkH = 4 + Math.random() * 4;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, trunkH, 6), trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Bark rings on pine trunk
        const pineRingCount = 2 + Math.floor(Math.random() * 2);
        for (let rk = 0; rk < pineRingCount; rk++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 4, 8), barkRingMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = trunkH * 0.2 + rk * (trunkH * 0.25);
          group.add(ring);
        }

        // Cone-shaped layers
        const layers = 4 + Math.floor(Math.random() * 3);
        for (let l = 0; l < layers; l++) {
          const r = 2.0 - l * 0.35;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.8, 7), pineLeafMat);
          cone.position.y = trunkH * 0.4 + l * 1.2;
          cone.castShadow = true;
          group.add(cone);
        }
      } else {
        // Deciduous tree — big round canopy
        const trunkH = 2.5 + Math.random() * 3;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, trunkH, 7), trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Bark rings on deciduous trunk
        const decRingCount = 2 + Math.floor(Math.random() * 3);
        for (let rk = 0; rk < decRingCount; rk++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 4, 8), barkRingMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.4 + rk * (trunkH * 0.28);
          group.add(ring);
        }

        // Tree roots radiating outward from base
        const rootCount = 2 + Math.floor(Math.random() * 3);
        for (let rt = 0; rt < rootCount; rt++) {
          const rootAngle = (rt / rootCount) * Math.PI * 2 + Math.random() * 0.4;
          const rootLen = 0.4 + Math.random() * 0.4;
          const root = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, rootLen, 4), rootMat);
          root.position.x = Math.cos(rootAngle) * rootLen * 0.45;
          root.position.z = Math.sin(rootAngle) * rootLen * 0.45;
          root.position.y = 0.05;
          root.rotation.z = Math.cos(rootAngle) * 0.5;
          root.rotation.x = -Math.sin(rootAngle) * 0.5;
          group.add(root);
        }

        // Branches (slight angles off trunk)
        if (Math.random() > 0.4) {
          for (let b = 0; b < 2; b++) {
            const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.5, 5), trunkMat);
            branch.position.y = trunkH * 0.6 + b * 0.5;
            branch.position.x = (b === 0 ? -1 : 1) * 0.4;
            branch.rotation.z = (b === 0 ? 1 : -1) * 0.6;
            group.add(branch);
          }
        }

        // Leaf clusters — each gets its own randomly chosen mat for per-cluster color variation
        const layers = 2 + Math.floor(Math.random() * 3);
        for (let l = 0; l < layers; l++) {
          const clusterLeafMat = leafMats[Math.floor(Math.random() * leafMats.length)];
          const r = 1.8 - l * 0.35 + Math.random() * 0.5;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), clusterLeafMat);
          leaf.position.y = trunkH + l * 0.7 + Math.random() * 0.3;
          leaf.position.x = (Math.random() - 0.5) * 0.5;
          leaf.position.z = (Math.random() - 0.5) * 0.5;
          leaf.scale.y = 0.6 + Math.random() * 0.3;
          leaf.castShadow = true;
          group.add(leaf);
        }

        // Fallen autumn leaves on the ground under some deciduous trees
        if (Math.random() > 0.55) {
          const leafPatchCount = 2 + Math.floor(Math.random() * 4);
          for (let fl = 0; fl < leafPatchCount; fl++) {
            const flMat = fallenLeafMats[Math.floor(Math.random() * fallenLeafMats.length)];
            const flR = 0.15 + Math.random() * 0.25;
            const patch = new THREE.Mesh(new THREE.CircleGeometry(flR, 6), flMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.x = (Math.random() - 0.5) * 2.5;
            patch.position.z = (Math.random() - 0.5) * 2.5;
            patch.position.y = 0.02;
            group.add(patch);
          }
        }
      }

      group.position.set(x, this.getTerrainHeight(x, z), z);
      // Slight random lean
      group.rotation.z = (Math.random() - 0.5) * 0.05;
      group.rotation.x = (Math.random() - 0.5) * 0.03;
      // Whole-tree scale variation
      group.scale.setScalar(treeScale);
      this.scene3d.add(group);
      // Tree trunk collider
      this.colliders.push({ x, z, r: 0.5 });
    }
  }

  private createRocks(): void {
    const rockMats = [
      new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x777766, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 1 }),
    ];
    // Lichen-tinted material (20% chance on rocks)
    const lichenMat = new THREE.MeshStandardMaterial({ color: 0x888866, roughness: 0.9 });
    // Moss material for top of rocks (30% chance)
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 1 });

    for (let i = 0; i < 60; i++) {
      // 20% chance of lichen tint, otherwise normal rock mat
      const useLichen = Math.random() < 0.2;
      const mat = useLichen ? lichenMat : rockMats[Math.floor(Math.random() * rockMats.length)];
      const size = 0.3 + Math.random() * 1.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat);
      const rx = (Math.random() - 0.5) * 900;
      const rz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(rx, rz)) continue;
      rock.position.set(rx, this.getTerrainHeight(rx, rz) + size * 0.4, rz);
      rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      rock.scale.y = 0.5 + Math.random() * 0.5;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene3d.add(rock);
      if (size > 0.8) this.colliders.push({ x: rock.position.x, z: rock.position.z, r: size * 0.7 });

      // 30% chance of moss on top
      if (Math.random() < 0.3) {
        const mossSize = size * (0.4 + Math.random() * 0.3);
        const moss = new THREE.Mesh(new THREE.SphereGeometry(mossSize, 6, 4), mossMat);
        moss.scale.y = 0.25;
        moss.position.set(rx, rock.position.y + size * rock.scale.y * 0.5, rz);
        this.scene3d.add(moss);
      }
    }

    // Big boulder clusters
    for (let i = 0; i < 30; i++) {
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      for (let j = 0; j < 4; j++) {
        const useLichen = Math.random() < 0.2;
        const mat = useLichen ? lichenMat : rockMats[Math.floor(Math.random() * rockMats.length)];
        const size = 1 + Math.random() * 2;
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(size, 1),
          mat
        );
        const bx = cx + (Math.random() - 0.5) * 4;
        const bz = cz + (Math.random() - 0.5) * 4;
        rock.position.set(bx, this.getTerrainHeight(bx, bz) + size * 0.35, bz);
        rock.scale.y = 0.4 + Math.random() * 0.4;
        rock.rotation.y = Math.random() * Math.PI;
        rock.castShadow = true;
        this.scene3d.add(rock);
        this.colliders.push({ x: rock.position.x, z: rock.position.z, r: size * 0.7 });

        // 30% chance of moss on top of boulders
        if (Math.random() < 0.3) {
          const mossSize = size * (0.35 + Math.random() * 0.25);
          const moss = new THREE.Mesh(new THREE.SphereGeometry(mossSize, 6, 4), mossMat);
          moss.scale.y = 0.25;
          moss.position.set(bx, rock.position.y + size * rock.scale.y * 0.5, bz);
          this.scene3d.add(moss);
        }
      }
    }
  }

  private createRiver(): void {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a6655,      // blue-green tint
      roughness: 0.04,
      metalness: 0.72,      // slightly more metalness for reflectivity
      transparent: true,
      opacity: 0.78,
      envMapIntensity: 1.5,
    });
    // Darker riverbed underneath
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x2a3a1a, roughness: 1 });

    // Lily pad material — flat green circles
    const lilyPadMat = new THREE.MeshStandardMaterial({
      color: 0x2d6e1a,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });

    // Reed stem and top materials
    const reedStemMat = new THREE.MeshStandardMaterial({ color: 0x6b5a2a, roughness: 0.9 });
    const reedTopMat  = new THREE.MeshStandardMaterial({ color: 0x4a2a0a, roughness: 1 });

    // Track river path to place lily pads and reeds afterwards
    const riverPath: Array<{ x: number; z: number; w: number }> = [];

    // Winding river across the map
    let rx = -450, rz = -400;
    for (let i = 0; i < 100; i++) {
      const w = 5 + Math.sin(i * 0.15) * 2;
      riverPath.push({ x: rx, z: rz, w });

      // Riverbed
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(w + 2, 5.5), bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(rx, 0.01, rz);
      bed.rotation.z = Math.atan2(3 + Math.sin(i * 0.3) * 4, 4);
      this.scene3d.add(bed);

      // Water surface — subdivided plane with sine ripple on vertex Y
      const segGeo = new THREE.PlaneGeometry(w, 5, 6, 6);
      const posAttr = segGeo.attributes.position;
      for (let v = 0; v < posAttr.count; v++) {
        const vx = posAttr.getX(v);
        const vz = posAttr.getZ(v);
        posAttr.setY(v, Math.sin(vx * 1.2 + i * 0.4) * 0.025 + Math.sin(vz * 1.8 + i * 0.6) * 0.015);
      }
      posAttr.needsUpdate = true;
      segGeo.computeVertexNormals();
      const segment = new THREE.Mesh(segGeo, waterMat);
      segment.rotation.x = -Math.PI / 2;
      segment.position.set(rx, 0.06, rz);
      segment.rotation.z = Math.atan2(3 + Math.sin(i * 0.3) * 4, 4);
      this.scene3d.add(segment);

      // Shoreline rocks
      if (Math.random() > 0.6) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.3, 0),
          new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.9 })
        );
        rock.position.set(rx + (Math.random() > 0.5 ? 1 : -1) * (w / 2 + 0.5), 0.1, rz + (Math.random() - 0.5) * 2);
        rock.scale.y = 0.5;
        this.scene3d.add(rock);
      }

      rx += 3.5;
      rz += 3 + Math.sin(i * 0.3) * 4;
    }

    // Lily pads — ~30 scattered along the river
    for (let i = 0; i < 30; i++) {
      const seg = riverPath[Math.floor(Math.random() * riverPath.length)];
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35 + Math.random() * 0.3, 10), lilyPadMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(
        seg.x + (Math.random() - 0.5) * (seg.w * 0.7),
        0.1,
        seg.z + (Math.random() - 0.5) * 3
      );
      this.scene3d.add(pad);
    }

    // Reeds / cattails
    for (let i = 0; i < 15; i++) {
      const seg = riverPath[Math.floor(Math.random() * riverPath.length)];
      const side = Math.random() > 0.5 ? 1 : -1;
      const rbx = seg.x + side * (seg.w / 2 + 0.4 + Math.random() * 1.2);
      const rbz = seg.z + (Math.random() - 0.5) * 3;
      const stemH = 1.0 + Math.random() * 0.8;

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, stemH, 5), reedStemMat);
      stem.position.set(rbx, stemH / 2 + 0.05, rbz);
      this.scene3d.add(stem);

      // Brown oval top (cattail head)
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), reedTopMat);
      top.scale.set(1, 2.2, 1);
      top.position.set(rbx, stemH + 0.18, rbz);
      this.scene3d.add(top);
    }
  }

  private createBushes(): void {
    const bushMats = [
      new THREE.MeshStandardMaterial({ color: 0x2a5a18 }),
      new THREE.MeshStandardMaterial({ color: 0x3a6a22 }),
      new THREE.MeshStandardMaterial({ color: 0x1a4a0a }),
      new THREE.MeshStandardMaterial({ color: 0x5a7a10 }), // yellow-green variant
      new THREE.MeshStandardMaterial({ color: 0x4a6010 }), // olive variant
    ];
    const berryMatRed = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
    const berryMatPurple = new THREE.MeshStandardMaterial({ color: 0x7722aa });

    for (let i = 0; i < 400; i++) {
      const group = new THREE.Group();
      const mat = bushMats[Math.floor(Math.random() * bushMats.length)];
      const puffs = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 0.3 + Math.random() * 0.4;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
        puff.position.set((Math.random() - 0.5) * 0.5, r * 0.6, (Math.random() - 0.5) * 0.5);
        puff.scale.y = 0.7;
        puff.castShadow = true;
        group.add(puff);
      }

      // Berries on ~20% of bushes
      if (Math.random() < 0.2) {
        const berryMat = Math.random() > 0.5 ? berryMatRed : berryMatPurple;
        const berryCount = 3 + Math.floor(Math.random() * 5);
        for (let bry = 0; bry < berryCount; bry++) {
          const berry = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), berryMat);
          berry.position.set(
            (Math.random() - 0.5) * 0.7,
            0.3 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.7,
          );
          group.add(berry);
        }
      }

      const bx = (Math.random() - 0.5) * 900;
      const bz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(bx, bz)) continue;
      group.position.set(bx, this.getTerrainHeight(bx, bz), bz);
      this.scene3d.add(group);
    }
  }

  private createLogs(): void {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.95 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2a6a10, roughness: 0.9 });
    const mushroomCapMat = new THREE.MeshStandardMaterial({ color: 0xb87030, roughness: 0.8 });
    const mushroomStemMat = new THREE.MeshStandardMaterial({ color: 0xddcc99, roughness: 0.85 });

    for (let i = 0; i < 30; i++) {
      const len = 2 + Math.random() * 4;
      const logYaw = Math.random() * Math.PI;
      const group = new THREE.Group();
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, len, 6), logMat);
      log.rotation.z = Math.PI / 2;
      log.castShadow = true;
      group.add(log);

      // Moss patches on top of log
      const mossCount = 1 + Math.floor(Math.random() * 3);
      for (let m = 0; m < mossCount; m++) {
        const mossR = 0.08 + Math.random() * 0.1;
        const moss = new THREE.Mesh(new THREE.CylinderGeometry(mossR, mossR, 0.06, 6), mossMat);
        moss.position.set(
          (Math.random() - 0.5) * (len * 0.7),
          0.18,
          (Math.random() - 0.5) * 0.1,
        );
        group.add(moss);
      }

      // Mushroom cluster near ~30% of logs
      if (Math.random() < 0.3) {
        const shroomCount = 2 + Math.floor(Math.random() * 3);
        for (let sh = 0; sh < shroomCount; sh++) {
          const stemH = 0.12 + Math.random() * 0.1;
          const capR = 0.08 + Math.random() * 0.08;
          const sx = (Math.random() - 0.5) * (len * 0.6);
          const sz = 0.25 + Math.random() * 0.15;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, stemH, 5), mushroomStemMat);
          stem.position.set(sx, stemH / 2, sz);
          group.add(stem);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(capR, capR * 1.2, 6), mushroomCapMat);
          cap.position.set(sx, stemH + capR * 0.4, sz);
          group.add(cap);
        }
      }

      const lx = (Math.random() - 0.5) * 900;
      const lz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(lx, lz)) continue;
      group.rotation.y = logYaw;
      group.position.set(lx, this.getTerrainHeight(lx, lz) + 0.15, lz);
      this.scene3d.add(group);
    }
  }

  private createGrass(): void {
    const grassMats = [
      new THREE.MeshStandardMaterial({
        color: 0x4a8a20,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x3a7010,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    ];

    for (let i = 0; i < 100; i++) {
      const x = (Math.random() - 0.5) * 900;
      const z = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(x, z)) continue;
      const blades = 3 + Math.floor(Math.random() * 4);
      for (let b = 0; b < blades; b++) {
        const h = 0.4 + Math.random() * 0.4;
        const bladeMat = grassMats[b % 2]; // alternate shades within a patch
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.08, h), bladeMat);
        const gx = x + (Math.random() - 0.5) * 0.4;
        const gz = z + (Math.random() - 0.5) * 0.4;
        blade.position.set(gx, this.getTerrainHeight(gx, gz) + h / 2, gz);
        blade.rotation.y = Math.random() * Math.PI;
        // Slight lean toward positive X (sun direction), plus random sway
        blade.rotation.z = 0.1 + (Math.random() - 0.5) * 0.25;
        this.scene3d.add(blade);
      }
    }
  }

  private isOnRoad(px: number, pz: number, margin = 6): boolean {
    for (const r of this.roadSegments) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len2 = dx * dx + dz * dz;
      // Project point onto road line
      let t = ((px - r.x1) * dx + (pz - r.z1) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const closestX = r.x1 + t * dx;
      const closestZ = r.z1 + t * dz;
      const distSq = (px - closestX) ** 2 + (pz - closestZ) ** 2;
      if (distSq < margin * margin) return true;
    }
    return false;
  }

  private createRoads(): void {
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95, metalness: 0.0 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xdddd44, roughness: 0.7 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
    const gravelMat = new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 1 });
    const crackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
    const oilMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.5, metalness: 0.3 });

    const roadWidth = 8;
    const segLen = 10;

    // Main roads — a grid of roads across the map
    const roads = [
      // Horizontal roads
      { x1: -450, z1: 0, x2: 450, z2: 0 },
      { x1: -450, z1: 200, x2: 450, z2: 200 },
      { x1: -450, z1: -200, x2: 450, z2: -200 },
      // Vertical roads
      { x1: 0, z1: -450, x2: 0, z2: 450 },
      { x1: 200, z1: -450, x2: 200, z2: 450 },
      { x1: -200, z1: -450, x2: -200, z2: 450 },
      // Diagonal roads
      { x1: -350, z1: -350, x2: 350, z2: 350 },
      { x1: -350, z1: 350, x2: 350, z2: -350 },
    ];
    this.roadSegments = roads;

    for (const road of roads) {
      const dx = road.x2 - road.x1;
      const dz = road.z2 - road.z1;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      const segments = Math.ceil(length / segLen);

      for (let s = 0; s < segments; s++) {
        const t = (s + 0.5) / segments;
        const cx = road.x1 + dx * t;
        const cz = road.z1 + dz * t;
        const cy = this.getTerrainHeight(cx, cz) + 0.05;

        // Asphalt — slight roughness variation per segment
        const segRoughness = 0.88 + Math.random() * 0.12;
        const segMat = Math.random() < 0.15
          ? new THREE.MeshStandardMaterial({ color: 0x252528, roughness: segRoughness, metalness: 0.0 })
          : asphaltMat;
        const seg = new THREE.Mesh(
          new THREE.PlaneGeometry(roadWidth, segLen + 0.5),
          segMat
        );
        seg.rotation.x = -Math.PI / 2;
        seg.rotation.z = -angle;
        seg.position.set(cx, cy, cz);
        seg.receiveShadow = true;
        this.scene3d.add(seg);

        // Center dashed line
        if (s % 2 === 0) {
          const dash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, segLen * 0.5),
            lineMat
          );
          dash.rotation.x = -Math.PI / 2;
          dash.rotation.z = -angle;
          dash.position.set(cx, cy + 0.01, cz);
          this.scene3d.add(dash);
        }

        // Edge lines (white)
        for (const side of [-1, 1]) {
          const edge = new THREE.Mesh(
            new THREE.PlaneGeometry(0.15, segLen + 0.5),
            edgeMat
          );
          edge.rotation.x = -Math.PI / 2;
          edge.rotation.z = -angle;
          const offset = side * (roadWidth / 2 - 0.3);
          edge.position.set(
            cx + Math.cos(angle) * offset,
            cy + 0.01,
            cz - Math.sin(angle) * offset
          );
          this.scene3d.add(edge);
        }

        // Road shoulder / gravel strip on each side
        for (const side of [-1, 1]) {
          const gravel = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, segLen + 0.5),
            gravelMat
          );
          gravel.rotation.x = -Math.PI / 2;
          gravel.rotation.z = -angle;
          const gOffset = side * (roadWidth / 2 + 0.5);
          gravel.position.set(
            cx + Math.cos(angle) * gOffset,
            cy - 0.01,
            cz - Math.sin(angle) * gOffset
          );
          gravel.receiveShadow = true;
          this.scene3d.add(gravel);
        }

        // Road cracks — 20% chance per segment
        if (Math.random() < 0.2) {
          const crackLen = 1 + Math.random() * 2;
          const crack = new THREE.Mesh(
            new THREE.PlaneGeometry(0.05, crackLen),
            crackMat
          );
          crack.rotation.x = -Math.PI / 2;
          crack.rotation.z = -angle + (Math.random() - 0.5) * 1.2;
          const crackOffX = (Math.random() - 0.5) * (roadWidth - 1);
          crack.position.set(
            cx + Math.cos(angle) * crackOffX,
            cy + 0.02,
            cz - Math.sin(angle) * crackOffX
          );
          this.scene3d.add(crack);
        }

        // Oil stains — 5% chance per segment
        if (Math.random() < 0.05) {
          const oilR = 0.3 + Math.random() * 0.5;
          const oil = new THREE.Mesh(new THREE.CircleGeometry(oilR, 8), oilMat);
          oil.rotation.x = -Math.PI / 2;
          const oilOffX = (Math.random() - 0.5) * (roadWidth - 1.5);
          oil.position.set(
            cx + Math.cos(angle) * oilOffX,
            cy + 0.015,
            cz - Math.sin(angle) * oilOffX
          );
          this.scene3d.add(oil);
        }
      }
    }
  }

  private createMountains(): void {
    // Base mountain color options for slight variation
    const mtnColors = [0x5a6a5a, 0x526258, 0x627060, 0x4e5e50, 0x5e6a58];
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xddddee, roughness: 0.7 });
    const rockOutcropMat = new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x1a3a12, roughness: 0.9 });
    const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 1 });

    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const dist = 350 + Math.random() * 100;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = 40 + Math.random() * 50;
      const r = 20 + Math.random() * 20;

      // Slight color variation per mountain
      const mtnColor = mtnColors[i % mtnColors.length];
      const mtnMat = new THREE.MeshStandardMaterial({ color: mtnColor, roughness: 1 });

      // More detailed cone geometry (12 segments)
      const mtn = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), mtnMat);
      const mtnY = this.getTerrainHeight(x, z);
      mtn.position.set(x, mtnY + h / 2 - 2, z);
      mtn.castShadow = true;
      this.scene3d.add(mtn);

      // Snow cap — IcosahedronGeometry for natural snow accumulation look
      const snowSize = r * 0.35 + Math.random() * r * 0.1;
      const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(snowSize, 1), snowMat);
      cap.scale.y = 0.6;
      cap.position.set(
        x + (Math.random() - 0.5) * r * 0.1,
        mtnY + h - 2 + snowSize * 0.1,
        z + (Math.random() - 0.5) * r * 0.1
      );
      this.scene3d.add(cap);

      // Rock outcroppings on mountain sides
      const numOutcrops = 2 + Math.floor(Math.random() * 4);
      for (let o = 0; o < numOutcrops; o++) {
        const outcropSize = 1 + Math.random() * 2;
        const outcrop = new THREE.Mesh(new THREE.DodecahedronGeometry(outcropSize, 0), rockOutcropMat);
        const oa = Math.random() * Math.PI * 2;
        const od = r * (0.2 + Math.random() * 0.6);
        const heightFrac = 0.15 + Math.random() * 0.55;
        outcrop.position.set(
          x + Math.cos(oa) * od,
          mtnY + h * heightFrac,
          z + Math.sin(oa) * od
        );
        outcrop.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
        outcrop.castShadow = true;
        this.scene3d.add(outcrop);
      }

      // Tree-line at mountain base — scatter small pine trees around base
      const numPines = 4 + Math.floor(Math.random() * 5);
      for (let p = 0; p < numPines; p++) {
        const pa = Math.random() * Math.PI * 2;
        const pd = r * (0.6 + Math.random() * 0.5);
        const px = x + Math.cos(pa) * pd;
        const pz = z + Math.sin(pa) * pd;
        const pGroup = new THREE.Group();
        // Trunk
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 2, 5), pineTrunkMat);
        trunk.position.y = 1;
        pGroup.add(trunk);
        // Pine cone
        const pine = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4, 5), pineMat);
        pine.position.y = 4;
        pine.castShadow = true;
        pGroup.add(pine);
        pGroup.position.set(px, this.getTerrainHeight(px, pz), pz);
        this.scene3d.add(pGroup);
      }

      this.colliders.push({ x, z, r: r * 0.8 });
    }
  }

  // Brand names for shirt/hat labels
  private static readonly BRANDS = ['NIKE', 'NUKE', 'ADEDAS', 'POMA', 'REBOK', 'FILA', 'GUCI', 'PRDA', 'ZARA', 'GAP', 'TNFCE', 'UNDR', 'CHAMP'];

  /** Creates a small plane mesh with a brand name text on it */
  private createBrandLabel(brand: string, width: number, height: number, fontSize: number, textColor = '#ffffff'): THREE.Group {
    const group = new THREE.Group();

    // White background rectangle
    const bgMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, height), bgMat);
    group.add(bg);

    // Text on top
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 128);
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    // Brand text
    ctx.font = `bold ${fontSize}px Arial Black, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(brand, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    plane.position.z = 0.001;
    group.add(plane);

    return group;
  }

  /** Apply an uploaded image as a shirt label on a torso group */
  private applyImageLabel(torso: THREE.Group, dataUrl: string): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 128);
      const scale = Math.min(128 / img.width, 128 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
      plane.position.set(0, 0.3, 0.19);
      torso.add(plane);
    };
    img.src = dataUrl;
  }

  // Apply the full-body drawing to each body part as textures
  private applyDrawnSkin(
    _dataUrl: string,
    chestMesh: THREE.Mesh,
    leftUpperArmMesh: THREE.Object3D, rightUpperArmMesh: THREE.Object3D,
    leftForearmMesh: THREE.Object3D, rightForearmMesh: THREE.Object3D,
    leftThighMesh: THREE.Object3D, rightThighMesh: THREE.Object3D,
    leftShinMesh: THREE.Object3D, rightShinMesh: THREE.Object3D,
    leftShoeMesh: THREE.Object3D, rightShoeMesh: THREE.Object3D,
    headGroup: THREE.Group,
  ): void {
    // Load per-body-part pixel data from localStorage
    let data: Record<string, (string | null)[][]>;
    try {
      const raw = localStorage.getItem('fighting-wars-skin-drawing');
      if (!raw) return;
      data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    } catch (_e) { return; }

    const TEX_SIZE = 32;
    const applyPartToMesh = (mesh: THREE.Object3D, partName: string) => {
      if (!(mesh instanceof THREE.Mesh)) return;
      const partData = data[partName];
      if (!partData || !Array.isArray(partData)) return;
      const c = document.createElement('canvas');
      c.width = TEX_SIZE;
      c.height = TEX_SIZE;
      const ctx = c.getContext('2d')!;
      let hasPixels = false;
      for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
          const color = partData[y]?.[x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
            hasPixels = true;
          }
        }
      }
      if (!hasPixels) return;
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    };

    // Map saved part names to in-game meshes
    applyPartToMesh(headGroup.children[0], 'head');
    applyPartToMesh(chestMesh, 'chest');
    applyPartToMesh(leftUpperArmMesh, 'lArm_upper');
    applyPartToMesh(rightUpperArmMesh, 'rArm_upper');
    applyPartToMesh(leftForearmMesh, 'lArm_fore');
    applyPartToMesh(rightForearmMesh, 'rArm_fore');
    applyPartToMesh(leftThighMesh, 'lLeg_thigh');
    applyPartToMesh(rightThighMesh, 'rLeg_thigh');
    applyPartToMesh(leftShinMesh, 'lLeg_shin');
    applyPartToMesh(rightShinMesh, 'rLeg_shin');
    applyPartToMesh(leftShoeMesh, 'lLeg_shoe');
    applyPartToMesh(rightShoeMesh, 'rLeg_shoe');
  }

  private getRandomBrand(): string {
    return BattleScene.BRANDS[Math.floor(Math.random() * BattleScene.BRANDS.length)];
  }

  private buildRealisticHead(
    skinMat: THREE.MeshStandardMaterial,
    eyeColor: number,
    hairColor: number,
    hasCap: boolean,
    capMat: THREE.MeshStandardMaterial | null,
  ): THREE.Group {
    const headGroup = new THREE.Group();

    // Stylized Fortnite head — slightly oversized, smooth
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    head.scale.set(1, 1.15, 1);
    head.castShadow = true;
    headGroup.add(head);

    // Jaw / chin — gives face more shape
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), skinMat);
    jaw.position.set(0, -0.1, 0.02);
    jaw.scale.set(1, 0.7, 0.9);
    headGroup.add(jaw);

    // Cheekbones
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
      cheek.position.set(side * 0.12, -0.02, 0.1);
      headGroup.add(cheek);
    }

    // Eyes — larger, more expressive (Fortnite style)
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.05 });
    const irisMat = new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
    for (const side of [-1, 1]) {
      // Eye socket shadow
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a6a5a, roughness: 0.8 }));
      socket.position.set(side * 0.08, 0.05, 0.17);
      socket.scale.set(1.2, 0.8, 0.5);
      headGroup.add(socket);
      // Eyeball
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), whiteMat);
      eye.position.set(side * 0.08, 0.05, 0.18);
      headGroup.add(eye);
      // Iris — bigger for cartoon look
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), irisMat);
      iris.position.set(side * 0.08, 0.05, 0.221);
      headGroup.add(iris);
      // Pupil
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.015, 10), pupilMat);
      pupil.position.set(side * 0.08, 0.05, 0.222);
      headGroup.add(pupil);
      // Eye highlight
      const highlight = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      highlight.position.set(side * 0.08 + 0.015, 0.06, 0.223);
      headGroup.add(highlight);
      // Eyebrow
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.02),
        new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 }));
      brow.position.set(side * 0.08, 0.1, 0.18);
      brow.rotation.z = side * -0.15;
      headGroup.add(brow);
    }

    // Nose — slightly stylized
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), skinMat);
    nose.position.set(0, 0, 0.21);
    nose.scale.set(1, 0.8, 1.2);
    headGroup.add(nose);
    // Nostrils
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), skinMat);
      nostril.position.set(side * 0.015, -0.015, 0.22);
      headGroup.add(nostril);
    }

    // Mouth — curved smile line
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xbb5555, roughness: 0.5 });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 10, Math.PI), mouthMat);
    mouth.position.set(0, -0.065, 0.19);
    mouth.rotation.x = Math.PI;
    mouth.rotation.z = Math.PI;
    headGroup.add(mouth);

    // Ears — more detailed
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinMat);
      ear.position.set(side * 0.22, 0.02, 0);
      ear.scale.set(0.35, 1, 0.7);
      headGroup.add(ear);
      const earInner = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xd4a088, roughness: 0.7 }));
      earInner.position.set(side * 0.21, 0.02, 0.01);
      earInner.scale.set(0.3, 0.8, 0.5);
      headGroup.add(earInner);
    }

    // Hair or cap
    if (!hasCap) {
      const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85 });
      // Full hair volume — top
      const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      hairTop.position.y = 0.04;
      headGroup.add(hairTop);
      // Hair sides — wraps around
      const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 12, 0, Math.PI * 2, 0.3, Math.PI * 0.4), hairMat);
      hairBack.position.set(0, 0.02, -0.02);
      headGroup.add(hairBack);
    } else if (capMat) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
        capMat
      );
      cap.position.y = 0.05;
      headGroup.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.018, 12, 1, false, -Math.PI * 0.5, Math.PI), capMat);
      brim.position.set(0, 0.12, 0.2);
      brim.rotation.x = -0.25;
      headGroup.add(brim);
    }

    return headGroup;
  }

  private createPlayerModel(): void {
    // Use the selected character's colors
    let vis = { shirt: 0x2288ff, skin: 0xf0c8a0, pants: 0x1a1a3a, hair: 0x553311, eye: 0x2266cc };
    let playerHatColor = -1; // -1 = no hat
    let playerShirtLabel: string | null = null;
    let playerShirtBrand: string | null = null;
    if (this.selectedCharKey.startsWith('char-custom-')) {
      // Custom character — load colors from localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('customCharacters') || '[]');
        const custom = saved.find((c: { key: string }) => c.key === this.selectedCharKey);
        if (custom) {
          vis = { shirt: custom.shirtColor, skin: custom.skinColor, pants: custom.pantsColor, hair: custom.hairColor || 0x0e0e0e, eye: 0x4a5a3a };
          playerHatColor = custom.hatColor ?? -1;
          playerShirtLabel = custom.shirtLabel || null;
          playerShirtBrand = custom.shirtBrand || null;
        }
      } catch (_e) { /* ignore */ }
    } else {
      const charIndex = parseInt(this.selectedCharKey.replace('char-', ''), 10);
      if (charIndex >= 0 && charIndex < CHAR_VISUALS.length) {
        vis = CHAR_VISUALS[charIndex];
      }
    }
    const shirtMat = new THREE.MeshStandardMaterial({ color: vis.shirt, roughness: 0.8, metalness: 0.0 });
    const skinMat = new THREE.MeshStandardMaterial({ color: vis.skin, roughness: 0.6, metalness: 0.05 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: vis.pants, roughness: 0.85, metalness: 0.0 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.1 });

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
    torso.position.y = 0.05;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtMat);
    chest.position.y = 0.3;
    chest.castShadow = true;
    torso.add(chest);

    // Check for drawn skin — per-body-part pixel data
    const globalDrawing = localStorage.getItem('fighting-wars-skin-drawing');
    let isDrawnSkin = false;
    if (globalDrawing) {
      try {
        const parsed = JSON.parse(globalDrawing);
        isDrawnSkin = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
      } catch (_e) { /* not JSON, ignore */ }
    }
    const drawnSkinData = globalDrawing;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat);
    neck.position.y = 0.6;
    torso.add(neck);

    // Head
    let headGroup: THREE.Group;
    if (isDrawnSkin) {
      // Drawn skin — plain sphere head, no hair/eyes/nose
      headGroup = new THREE.Group();
      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
      headMesh.scale.set(1, 1.15, 1);
      headGroup.add(headMesh);
    } else {
      const hasHat = playerHatColor !== -1;
      const hatMat = hasHat ? new THREE.MeshStandardMaterial({ color: playerHatColor, roughness: 0.7 }) : null;
      headGroup = this.buildRealisticHead(skinMat, vis.eye, vis.hair, hasHat, hatMat);
    }
    headGroup.position.y = 0.72;
    torso.add(headGroup);

    // Arms
    const leftUpperArm = new THREE.Group();
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
    // Weapon
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 }));
    weapon.position.set(0, -0.28, 0.2);
    rightForearm.add(weapon);

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

    // Shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    // Apply drawn skin textures to each body part
    if (isDrawnSkin && drawnSkinData) {
      this.applyDrawnSkin(
        drawnSkinData,
        chest,
        leftUpperArm.children[0], rightUpperArm.children[0],  // upper arm meshes
        leftForearm.children[0], rightForearm.children[0],    // forearm meshes
        leftThigh.children[0], rightThigh.children[0],        // thigh meshes
        leftShin.children[0], rightShin.children[0],          // shin meshes
        leftShin.children[1], rightShin.children[1],          // shoe meshes
        headGroup,
      );
    }

    root.position.set(0, 0, 0);
    this.scene3d.add(root);

    this.playerModel = root;
    this.pHips = hips;
    this.pTorso = torso;
    this.pHead = headGroup;
    this.pLeftUpperArm = leftUpperArm;
    this.pLeftForearm = leftForearm;
    this.pRightUpperArm = rightUpperArm;
    this.pRightForearm = rightForearm;
    this.pLeftThigh = leftThigh;
    this.pLeftShin = leftShin;
    this.pRightThigh = rightThigh;
    this.pRightShin = rightShin;

    // Attach equipped armor meshes
    this.attachArmorMeshes(torso, headGroup, hips, leftThigh, rightThigh, leftShin, rightShin, leftUpperArm, rightUpperArm);

    // Health bar above player
    const { sprite, ctx, texture } = this.createHealthBarSprite();
    sprite.position.set(0, 2.5, 0);
    root.add(sprite);
    this.playerHealthBar = sprite;
    this.playerHealthCtx = ctx;
    this.playerHealthTex = texture;
  }

  private attachArmorMeshes(
    torso: THREE.Group, headGroup: THREE.Group, hips: THREE.Group,
    leftThigh: THREE.Group, rightThigh: THREE.Group,
    leftShin: THREE.Group, rightShin: THREE.Group,
    leftUpperArm: THREE.Group, rightUpperArm: THREE.Group,
  ): void {
    const equippedIds = getEquippedArmor();
    if (equippedIds.length === 0) return;

    const equipped = equippedIds.map(id => ARMOR_ITEMS.find(a => a.id === id)).filter(Boolean) as typeof ARMOR_ITEMS;
    if (equipped.length === 0) return;
    const slots = new Set(equipped.map(a => a.slot));

    const makeArmorMat = (color: number) => new THREE.MeshStandardMaterial({
      color, roughness: 0.15, metalness: 0.9, emissive: color, emissiveIntensity: 0.2,
    });

    const isFull = slots.has('full');
    const fullItem = equipped.find(a => a.slot === 'full');

    // HEAD — big visible helmet that covers the whole head
    const headItem = isFull ? fullItem! : equipped.find(a => a.slot === 'head');
    if (headItem) {
      const mat = makeArmorMat(headItem.color);
      // Full dome — covers entire head
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), mat);
      helmet.position.y = 0.02;
      helmet.scale.set(1, 1.1, 1);
      helmet.castShadow = true;
      headGroup.add(helmet);
      // Face plate with dark visor slit
      const facePlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.95, roughness: 0.05 }),
      );
      facePlate.position.set(0, -0.02, 0.24);
      headGroup.add(facePlate);
      // Mohawk crest on top
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.3), mat);
      crest.position.set(0, 0.2, -0.02);
      headGroup.add(crest);
    }

    // CHEST — thick armor plates that clearly wrap the torso
    const chestItem = isFull ? fullItem! : equipped.find(a => a.slot === 'chest');
    if (chestItem) {
      const mat = makeArmorMat(chestItem.color);
      // Front plate — box that sticks out from chest
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.56, 0.12), mat);
      front.position.set(0, 0.3, 0.2);
      front.castShadow = true;
      torso.add(front);
      // Back plate
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.1), mat);
      back.position.set(0, 0.3, -0.18);
      back.castShadow = true;
      torso.add(back);
      // Side plates
      for (const side of [-1, 1]) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.3), mat);
        sp.position.set(side * 0.3, 0.3, 0);
        torso.add(sp);
      }
      // Big shoulder pads
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
        pad.scale.set(1.3, 0.7, 1.3);
        pad.position.set(0, 0.0, 0);
        if (side === -1) leftUpperArm.add(pad);
        else rightUpperArm.add(pad);
      }
      // Collar
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.36), mat);
      collar.position.set(0, 0.58, 0);
      torso.add(collar);
    }

    // LEGS — thick plates over thighs and shins
    const legItem = isFull ? fullItem! : equipped.find(a => a.slot === 'legs');
    if (legItem) {
      const mat = makeArmorMat(legItem.color);
      for (const thigh of [leftThigh, rightThigh]) {
        // Thigh plate — wraps around leg
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24), mat);
        guard.position.set(0, -0.2, 0);
        guard.castShadow = true;
        thigh.add(guard);
        // Knee cap — sphere
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
        knee.position.set(0, -0.38, 0.08);
        thigh.add(knee);
      }
      for (const shin of [leftShin, rightShin]) {
        // Shin plate
        const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), mat);
        shinGuard.position.set(0, -0.16, 0);
        shin.add(shinGuard);
      }
    }

    // BOOTS — thick armored boots
    const feetItem = isFull ? fullItem! : equipped.find(a => a.slot === 'feet');
    if (feetItem) {
      const mat = makeArmorMat(feetItem.color);
      for (const shin of [leftShin, rightShin]) {
        // Boot — big box around foot
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), mat);
        boot.position.set(0, -0.36, 0.04);
        shin.add(boot);
        // Ankle guard
        const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), mat);
        ankle.position.set(0, -0.28, 0);
        shin.add(ankle);
      }
    }

    // Shield (smooth rounded shield on left arm)
    const shieldItem = equipped.find(a => a.slot === 'shield');
    if (shieldItem) {
      const mat = makeArmorMat(shieldItem.color);
      // Curved shield shape
      const shield = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI, 0, Math.PI * 0.7), mat);
      shield.position.set(-0.12, -0.1, 0);
      shield.rotation.y = Math.PI / 2;
      shield.castShadow = true;
      leftUpperArm.add(shield);
      // Shield emblem
      const emblem = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 16),
        new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.9, roughness: 0.1 }),
      );
      emblem.position.set(-0.2, -0.1, 0);
      emblem.rotation.y = -Math.PI / 2;
      leftUpperArm.add(emblem);
    }
  }

  private createHealthBarSprite(): { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.15, 1);
    return { sprite, ctx, texture };
  }

  private updateHealthBar(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, hp: number, maxHp: number): void {
    const w = 128, h = 16;
    ctx.clearRect(0, 0, w, h);
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);
    // Health fill
    const pct = Math.max(0, hp / maxHp);
    const green = pct > 0.5 ? 255 : Math.floor(pct * 2 * 255);
    const red = pct < 0.5 ? 255 : Math.floor((1 - (pct - 0.5) * 2) * 255);
    ctx.fillStyle = `rgb(${red},${green},0)`;
    ctx.fillRect(2, 2, (w - 4) * pct, h - 4);
    // Border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    tex.needsUpdate = true;
  }

  private createGuns(): void {
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.3 });
    const bbBlack = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4, roughness: 0.5 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4420, roughness: 0.85, metalness: 0.05 });

    for (let i = 0; i < 80; i++) {
      const group = new THREE.Group();

      // BB gun body — slim rectangular receiver
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.3), bbBlack);
      group.add(body);

      // Thin barrel — long and skinny like a BB gun
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), darkMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.15 + 0.25;
      group.add(barrel);

      // Muzzle tip
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.03, 6), darkMetal);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = 0.15 + 0.5 + 0.015;
      group.add(muzzle);

      // Front sight — tiny nub
      const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.006), darkMetal);
      fSight.position.set(0, 0.05, 0.35);
      group.add(fSight);

      // Wooden stock — classic BB gun look
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.25), woodMat);
      stock.position.set(0, -0.01, -0.15 - 0.125);
      group.add(stock);

      // Stock curves down at the end (butt)
      const butt = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.06), woodMat);
      butt.position.set(0, -0.03, -0.15 - 0.25 - 0.03);
      butt.rotation.x = 0.2;
      group.add(butt);

      // Trigger guard
      const guard = new THREE.Mesh(
        new THREE.TorusGeometry(0.02, 0.003, 4, 8, Math.PI),
        darkMetal
      );
      guard.position.set(0, -0.04, 0.0);
      guard.rotation.y = Math.PI / 2;
      group.add(guard);

      // Pump lever under barrel (like a Daisy BB gun)
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.3), woodMat);
      pump.position.set(0, -0.04, 0.15);
      group.add(pump);

      // Glow ring underneath
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.35, 16),
        new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -0.1;
      group.add(glow);

      const gx = (Math.random() - 0.5) * 900;
      const gz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(gx, gz)) continue;
      group.position.set(gx, this.getTerrainHeight(gx, gz) + 0.25, gz);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene3d.add(group);
      this.gunPickups.push({ group, name: 'BB Gun', color: 0x222222, picked: false });
    }
  }

  private createCheese(): void {
    // Realistic pizza materials
    const crustMat = new THREE.MeshStandardMaterial({ color: 0xc89030, roughness: 0.9, metalness: 0.0 });
    const crustDarkMat = new THREE.MeshStandardMaterial({ color: 0xa06820, roughness: 0.85 });
    const sauceMat = new THREE.MeshStandardMaterial({ color: 0x991500, roughness: 0.75 });
    const cheeseMat = new THREE.MeshStandardMaterial({ color: 0xf0c830, roughness: 0.4, metalness: 0.05 });
    const cheeseBubbleMat = new THREE.MeshStandardMaterial({ color: 0xe8b020, roughness: 0.3 });
    const pepMat = new THREE.MeshStandardMaterial({ color: 0x8a0a00, roughness: 0.65 });
    const pepFatMat = new THREE.MeshStandardMaterial({ color: 0xcc8866, roughness: 0.5 });
    const greenPepperMat = new THREE.MeshStandardMaterial({ color: 0x228822, roughness: 0.6 });
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const greaseMat = new THREE.MeshStandardMaterial({ color: 0xdd8800, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.4 });

    for (let i = 0; i < 200; i++) {
      const group = new THREE.Group();
      const sc = 0.8 + Math.random() * 0.4;

      // Dough base — slightly curved, thicker at crust end
      const dough = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.55, 0.05, 8, 1),
        crustMat
      );
      dough.castShadow = true;
      group.add(dough);

      // Bottom — slightly darker (baked)
      const bottom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.53, 0.01, 8, 1),
        crustDarkMat
      );
      bottom.position.y = -0.025;
      group.add(bottom);

      // Raised crust edge (puffy rim)
      const crustRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.055, 6, 8, Math.PI * 0.8),
        crustMat
      );
      crustRim.rotation.x = Math.PI / 2;
      crustRim.position.set(0, 0.01, -0.22);
      group.add(crustRim);

      // Crust browning spots
      for (let b = 0; b < 4; b++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), crustDarkMat);
        const a = (Math.random() - 0.5) * 1.5;
        spot.position.set(Math.sin(a) * 0.3, 0.03, -0.22 + Math.cos(a) * 0.06);
        spot.scale.y = 0.3;
        group.add(spot);
      }

      // Sauce layer (slightly uneven)
      const sauce = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.42, 0.012, 8, 1),
        sauceMat
      );
      sauce.position.y = 0.03;
      group.add(sauce);

      // Melted cheese — main layer with bumps
      const cheese = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.40, 0.01, 8, 1),
        cheeseMat
      );
      cheese.position.y = 0.038;
      group.add(cheese);

      // Cheese bubbles (browned spots)
      for (let cb = 0; cb < 6; cb++) {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.02 + Math.random() * 0.02, 5, 5), cheeseBubbleMat);
        const bDist = Math.random() * 0.3;
        const bAngle = Math.random() * Math.PI * 2;
        bubble.position.set(Math.cos(bAngle) * bDist, 0.045, Math.sin(bAngle) * bDist * 0.6);
        bubble.scale.y = 0.4;
        group.add(bubble);
      }

      // Cheese strings (dripping off edge)
      for (let s = 0; s < 2; s++) {
        const strand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.003, 0.08, 4),
          cheeseMat
        );
        strand.position.set(
          (Math.random() - 0.5) * 0.3,
          0.0,
          0.2 + Math.random() * 0.15
        );
        strand.rotation.z = (Math.random() - 0.5) * 0.5;
        group.add(strand);
      }

      // Pepperoni slices (concave with fat spots)
      const numPep = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPep; p++) {
        const pepSize = 0.04 + Math.random() * 0.025;
        const pep = new THREE.Mesh(new THREE.CylinderGeometry(pepSize, pepSize, 0.015, 8), pepMat);
        const pDist = Math.random() * 0.25;
        const pAngle = Math.random() * Math.PI * 2;
        pep.position.set(Math.cos(pAngle) * pDist, 0.052, Math.sin(pAngle) * pDist * 0.6);
        group.add(pep);
        // Fat spots on pepperoni
        const fat = new THREE.Mesh(new THREE.SphereGeometry(pepSize * 0.3, 4, 4), pepFatMat);
        fat.position.set(pep.position.x + 0.01, 0.058, pep.position.z);
        fat.scale.y = 0.3;
        group.add(fat);
        // Curled edges
        const curl = new THREE.Mesh(new THREE.TorusGeometry(pepSize, 0.005, 4, 8), pepMat);
        curl.position.copy(pep.position);
        curl.position.y = 0.055;
        curl.rotation.x = Math.PI / 2;
        group.add(curl);
      }

      // Random toppings — green peppers and olives
      if (Math.random() > 0.4) {
        for (let g = 0; g < 3; g++) {
          const gp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.015), greenPepperMat);
          const gDist = Math.random() * 0.25;
          const gAngle = Math.random() * Math.PI * 2;
          gp.position.set(Math.cos(gAngle) * gDist, 0.05, Math.sin(gAngle) * gDist * 0.6);
          gp.rotation.y = Math.random() * Math.PI;
          group.add(gp);
        }
      }
      if (Math.random() > 0.5) {
        for (let o = 0; o < 2; o++) {
          const olive = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 6, 8), oliveMat);
          const oDist = Math.random() * 0.2;
          const oAngle = Math.random() * Math.PI * 2;
          olive.position.set(Math.cos(oAngle) * oDist, 0.055, Math.sin(oAngle) * oDist * 0.5);
          olive.rotation.x = Math.PI / 2;
          group.add(olive);
        }
      }

      // Grease puddles
      for (let gr = 0; gr < 3; gr++) {
        const grease = new THREE.Mesh(new THREE.CircleGeometry(0.03 + Math.random() * 0.02, 6), greaseMat);
        const grDist = Math.random() * 0.2;
        const grAngle = Math.random() * Math.PI * 2;
        grease.position.set(Math.cos(grAngle) * grDist, 0.06, Math.sin(grAngle) * grDist * 0.5);
        grease.rotation.x = -Math.PI / 2;
        group.add(grease);
      }

      group.scale.setScalar(sc);
      const cx = (Math.random() - 0.5) * 900;
      const cz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(cx, cz)) continue;
      group.position.set(cx, this.getTerrainHeight(cx, cz) + 0.1, cz);
      group.rotation.y = Math.random() * Math.PI * 2;
      // Slight tilt like it was dropped
      group.rotation.x = (Math.random() - 0.5) * 0.15;
      group.rotation.z = (Math.random() - 0.5) * 0.15;
      this.scene3d.add(group);
      this.cheesePickups.push({ group, picked: false });
    }
  }

  private createNPCs(count: number): void {
    const skinColors = [0xf0c8a0, 0xc49a6c, 0x8d5524, 0xd4a574, 0xffe0bd];
    const pantsColors = [0x1a1a3a, 0x2a2a2a, 0x3a2a1a, 0x1a2a1a, 0x2a1a2a];

    for (let i = 0; i < count; i++) {
      const color = CHAR_COLORS[i % CHAR_COLORS.length];
      const skin = skinColors[Math.floor(Math.random() * skinColors.length)];
      const pants = pantsColors[Math.floor(Math.random() * pantsColors.length)];
      const shirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 });
      const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6, metalness: 0.05 });
      const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85, metalness: 0.0 });
      const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.1 });

      const root = new THREE.Group();

      // === HIPS — root of skeleton ===
      const hips = new THREE.Group();
      hips.position.y = 0.95;
      root.add(hips);

      // Belt
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a2010 }));
      hips.add(belt);
      // Buckle
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0xc8a848, metalness: 0.6 }));
      buckle.position.z = 0.15;
      hips.add(buckle);

      // === TORSO — child of hips ===
      const torso = new THREE.Group();
      torso.position.y = 0.05;
      hips.add(torso);

      // Chest
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), shirtMat);
      chest.position.y = 0.3;
      chest.castShadow = true;
      torso.add(chest);

      // Collar / neck base
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat);
      neck.position.y = 0.6;
      torso.add(neck);

      // === HEAD — realistic human head ===
      const eyeColors = [0x2266cc, 0x337722, 0x553311, 0x556688, 0x884422];
      const hairColors = [0x1a1a1a, 0x553311, 0xaa7733, 0xcc8844, 0x882211];
      const thisHairColor = hairColors[i % hairColors.length];
      const wearsCap = Math.random() < 0.35;
      const headGroup = this.buildRealisticHead(
        skinMat,
        eyeColors[i % eyeColors.length],
        thisHairColor,
        wearsCap,
        wearsCap ? shirtMat : null,
      );
      headGroup.position.y = 0.72;
      torso.add(headGroup);

      // === LEFT ARM — upper arm pivot at shoulder ===
      const leftUpperArm = new THREE.Group();
      leftUpperArm.position.set(-0.3, 0.48, 0);
      torso.add(leftUpperArm);
      const lUpperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat);
      lUpperMesh.position.y = -0.14;
      lUpperMesh.castShadow = true;
      leftUpperArm.add(lUpperMesh);

      // Left forearm pivot at elbow
      const leftForearm = new THREE.Group();
      leftForearm.position.y = -0.28;
      leftUpperArm.add(leftForearm);
      const lForearmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat);
      lForearmMesh.position.y = -0.12;
      leftForearm.add(lForearmMesh);
      // Hand
      const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
      lHand.position.y = -0.27;
      leftForearm.add(lHand);

      // === RIGHT ARM ===
      const rightUpperArm = new THREE.Group();
      rightUpperArm.position.set(0.3, 0.48, 0);
      torso.add(rightUpperArm);
      const rUpperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat);
      rUpperMesh.position.y = -0.14;
      rUpperMesh.castShadow = true;
      rightUpperArm.add(rUpperMesh);

      const rightForearm = new THREE.Group();
      rightForearm.position.y = -0.28;
      rightUpperArm.add(rightForearm);
      const rForearmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat);
      rForearmMesh.position.y = -0.12;
      rightForearm.add(rForearmMesh);
      const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
      rHand.position.y = -0.27;
      rightForearm.add(rHand);

      // Machine gun in right hand
      const gMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
      const gBody = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
      const gunGroup = new THREE.Group();
      gunGroup.position.set(0, -0.28, 0.15);
      // Receiver
      const recv = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.3), gBody);
      gunGroup.add(recv);
      // Barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.35, 6), gMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.32;
      gunGroup.add(barrel);
      // Barrel shroud
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 6, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, side: THREE.DoubleSide }));
      shroud.rotation.x = Math.PI / 2;
      shroud.position.z = 0.25;
      gunGroup.add(shroud);
      // Muzzle
      const muz = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.04, 6), gMetal);
      muz.rotation.x = Math.PI / 2;
      muz.position.z = 0.5;
      gunGroup.add(muz);
      // Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), gMetal);
      mag.position.set(0, -0.08, 0.05);
      gunGroup.add(mag);
      // Stock
      const stk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.15), gBody);
      stk.position.z = -0.22;
      gunGroup.add(stk);
      // Top rail
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.18), gMetal);
      rail.position.set(0, 0.035, 0.05);
      gunGroup.add(rail);
      rightForearm.add(gunGroup);

      // === LEFT LEG — thigh pivot at hip ===
      const leftThigh = new THREE.Group();
      leftThigh.position.set(-0.12, 0, 0);
      hips.add(leftThigh);
      const lThighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat);
      lThighMesh.position.y = -0.2;
      lThighMesh.castShadow = true;
      leftThigh.add(lThighMesh);

      // Left shin pivot at knee
      const leftShin = new THREE.Group();
      leftShin.position.y = -0.38;
      leftThigh.add(leftShin);
      const lShinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat);
      lShinMesh.position.y = -0.16;
      leftShin.add(lShinMesh);
      // Shoe
      const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat);
      lShoe.position.set(0, -0.35, 0.04);
      leftShin.add(lShoe);
      // Sole
      const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      lSole.position.set(0, -0.39, 0.04);
      leftShin.add(lSole);

      // === RIGHT LEG ===
      const rightThigh = new THREE.Group();
      rightThigh.position.set(0.12, 0, 0);
      hips.add(rightThigh);
      const rThighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), pantsMat);
      rThighMesh.position.y = -0.2;
      rThighMesh.castShadow = true;
      rightThigh.add(rThighMesh);

      const rightShin = new THREE.Group();
      rightShin.position.y = -0.38;
      rightThigh.add(rightShin);
      const rShinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), pantsMat);
      rShinMesh.position.y = -0.16;
      rightShin.add(rShinMesh);
      const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat);
      rShoe.position.set(0, -0.35, 0.04);
      rightShin.add(rShoe);
      const rSole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      rSole.position.set(0, -0.39, 0.04);
      rightShin.add(rSole);

      // Random armor on ~40% of bots
      if (Math.random() < 0.4) {
        const armorTiers = [
          ['iron-helmet', 'iron-chestplate', 'leg-guards', 'iron-boots'],
          ['gold-helmet', 'gold-chestplate', 'leg-guards', 'iron-boots'],
          ['full-iron-suit'],
          ['full-diamond-suit'],
          ['diamond-helmet', 'diamond-chestplate', 'leg-guards', 'iron-boots'],
        ];
        const tier = armorTiers[Math.floor(Math.random() * armorTiers.length)];
        const botArmorItems = tier.map(id => ARMOR_ITEMS.find(a => a.id === id)).filter(Boolean) as typeof ARMOR_ITEMS;
        const botSlots = new Set(botArmorItems.map(a => a.slot));
        const botIsFull = botSlots.has('full');
        const botFullItem = botArmorItems.find(a => a.slot === 'full');
        const makeAMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.85, emissive: c, emissiveIntensity: 0.15 });

        const bHeadItem = botIsFull ? botFullItem! : botArmorItems.find(a => a.slot === 'head');
        if (bHeadItem) {
          const m = makeAMat(bHeadItem.color);
          const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), m);
          h.position.y = 0.06;
          headGroup.add(h);
        }
        const bChestItem = botIsFull ? botFullItem! : botArmorItems.find(a => a.slot === 'chest');
        if (bChestItem) {
          const m = makeAMat(bChestItem.color);
          const f = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.56, 16, 1, true, -Math.PI * 0.45, Math.PI * 0.9), m);
          f.position.set(0, 0.3, 0);
          torso.add(f);
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.27, 0.52, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9), m);
          b.position.set(0, 0.3, 0);
          torso.add(b);
        }
        const bLegItem = botIsFull ? botFullItem! : botArmorItems.find(a => a.slot === 'legs');
        if (bLegItem) {
          const m = makeAMat(bLegItem.color);
          for (const th of [leftThigh, rightThigh]) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 12), m);
            g.position.set(0, -0.18, 0);
            th.add(g);
          }
        }
      }

      // Shadow blob on ground
      const shadowGeo = new THREE.CircleGeometry(0.35, 12);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.01;
      root.add(shadow);

      // Place in world
      const x = (Math.random() - 0.5) * 800;
      const z = (Math.random() - 0.5) * 800;
      root.position.set(x, this.getTerrainHeight(x, z), z);
      root.rotation.y = Math.random() * Math.PI * 2;
      // Health bar above NPC
      const hb = this.createHealthBarSprite();
      hb.sprite.position.set(0, 2.5, 0);
      root.add(hb.sprite);

      this.scene3d.add(root);

      this.npcs.push({
        mesh: root,
        vx: (Math.random() - 0.5) * 2,
        vz: (Math.random() - 0.5) * 2,
        timer: Math.random() * 5,
        hips, torso, head: headGroup,
        leftUpperArm, leftForearm,
        rightUpperArm, rightForearm,
        leftThigh, leftShin,
        rightThigh, rightShin,
        phase: Math.random() * Math.PI * 2,
        speed: 0,
        hp: 2,
        dead: false,
        healthBar: hb.sprite,
        healthCtx: hb.ctx,
        healthTex: hb.texture,
      });
    }
  }

  private createCars(): void {
    // T-Rex colors — each one slightly different
    const rexColors = [
      { body: 0x4a3a28, light: 0x6a5a3a },
      { body: 0x3a4a2a, light: 0x5a6a3a },
      { body: 0x5a3a2a, light: 0x7a5a3a },
      { body: 0x3a3a3a, light: 0x5a5a5a },
      { body: 0x4a2a1a, light: 0x6a4a2a },
      { body: 0x2a4a3a, light: 0x4a6a5a },
      { body: 0x5a4a3a, light: 0x7a6a5a },
      { body: 0x3a2a2a, light: 0x5a4a4a },
    ];

    // T-Rexes (8)
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const rc = rexColors[i % rexColors.length];

      // Procedural scaly skin texture (matches ride T-Rex)
      const makeSkinTex = (base: number, variation = 0.15) => {
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        const cx2 = cv.getContext('2d')!;
        const rr = (base >> 16) & 0xff, gg = (base >> 8) & 0xff, bb = base & 0xff;
        cx2.fillStyle = `rgb(${rr},${gg},${bb})`;
        cx2.fillRect(0, 0, 64, 64);
        for (let sy = 0; sy < 64; sy += 4) {
          for (let sx = 0; sx < 64; sx += 4) {
            const off = ((sy / 4) % 2) * 2;
            const v = (Math.random() - 0.5) * variation;
            const sr = Math.max(0, Math.min(255, rr + rr * v));
            const sg = Math.max(0, Math.min(255, gg + gg * v));
            const sb = Math.max(0, Math.min(255, bb + bb * v));
            cx2.fillStyle = `rgb(${sr|0},${sg|0},${sb|0})`;
            cx2.fillRect(sx + off, sy, 3, 3);
            cx2.fillStyle = `rgba(0,0,0,0.15)`;
            cx2.fillRect(sx + off + 3, sy, 1, 3);
            cx2.fillRect(sx + off, sy + 3, 4, 1);
          }
        }
        cx2.strokeStyle = 'rgba(0,0,0,0.12)';
        cx2.lineWidth = 1;
        for (let ii = 0; ii < 5; ii++) {
          cx2.beginPath();
          cx2.moveTo(Math.random() * 64, Math.random() * 64);
          cx2.lineTo(Math.random() * 64, Math.random() * 64);
          cx2.stroke();
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        return tex;
      };

      const bodyDark = rc.body;
      const bodyMid = rc.body + 0x101008;
      const bodyLight = rc.light;
      const bellyCol = rc.light + 0x201810;
      const scaleCol = rc.body - 0x101010;
      const clawCol = 0x1a1a10;
      const teethCol = 0xeeeedd;
      const eyeCol = 0xddcc44;
      const pupilCol = 0x111100;
      const tongueCol = 0x884444;
      const gumCol = 0x663333;

      const dmat = (c: number, r2 = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r2, map: makeSkinTex(c) });
      const smoothMat2 = (c: number, r2 = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r2 });

      // === BODY ===
      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 2.4;
      group.add(bodyGroup);
      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 3.0), dmat(bodyMid));
      bodyMesh.castShadow = true; bodyGroup.add(bodyMesh);
      const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 2.6), dmat(bodyDark));
      bodyTop.position.y = 0.8; bodyGroup.add(bodyTop);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 2.4), dmat(bodyMid));
        side.position.set(s * 0.85, 0.1, 0); bodyGroup.add(side);
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.8), dmat(bodyDark));
        shoulder.position.set(s * 0.75, 0.5, 0.8); bodyGroup.add(shoulder);
      }
      const bellyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.4), dmat(bellyCol));
      bellyMesh.position.y = -0.7; bodyGroup.add(bellyMesh);
      for (let bw = -3; bw <= 3; bw++) {
        const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.06), dmat(scaleCol));
        wrinkle.position.set(0, -0.5, bw * 0.3); bodyGroup.add(wrinkle);
      }
      for (let ri = -3; ri <= 3; ri++) {
        for (const s of [-1, 1]) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.12), dmat(bodyDark));
          rib.position.set(s * 0.82, -0.15 + Math.abs(ri) * 0.04, ri * 0.35);
          rib.rotation.z = s * 0.15; bodyGroup.add(rib);
        }
      }
      for (let si = -4; si <= 5; si++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), dmat(scaleCol));
        spine.position.set(0, 1.0, si * 0.28); bodyGroup.add(spine);
      }
      for (const s of [-1, 1]) {
        for (let fi = 0; fi < 3; fi++) {
          const fold = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.15), dmat(scaleCol));
          fold.position.set(s * 0.6, -0.55 - fi * 0.08, -0.3 + fi * 0.1);
          fold.rotation.z = s * 0.2; bodyGroup.add(fold);
        }
      }

      // === NECK ===
      const neckBase = new THREE.Group();
      neckBase.position.set(0, 0.3, 1.5); bodyGroup.add(neckBase);
      const neck1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), dmat(bodyMid));
      neckBase.add(neck1);
      const neckMid = new THREE.Group();
      neckMid.position.set(0, 0.4, 0.4); neckBase.add(neckMid);
      const neck2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), dmat(bodyLight));
      neckMid.add(neck2);
      for (let nf = 0; nf < 5; nf++) {
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.5), dmat(scaleCol));
        fold.position.set(0, -0.3 + nf * 0.15, 0); neckMid.add(fold);
      }
      for (const s of [-1, 1]) {
        const tendon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.08), dmat(bodyDark));
        tendon.position.set(s * 0.3, 0, 0.15); neckMid.add(tendon);
      }
      const dewlap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.5), dmat(bellyCol));
      dewlap.position.set(0, -0.45, 0.1); neckBase.add(dewlap);

      // === HEAD ===
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.6, 0.5); neckMid.add(headGroup);
      const skullBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), dmat(bodyMid));
      skullBack.position.z = -0.1; headGroup.add(skullBack);
      const skullMid2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), dmat(bodyDark));
      skullMid2.position.z = 0.4; headGroup.add(skullMid2);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), dmat(bodyMid));
      snout.position.z = 0.8; headGroup.add(snout);
      const snoutTip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.3), dmat(bodyLight));
      snoutTip.position.z = 1.15; headGroup.add(snoutTip);
      for (const s of [-1, 1]) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.5), dmat(scaleCol));
        brow.position.set(s * 0.4, 0.4, 0.2); headGroup.add(brow);
        const browBump = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), dmat(bodyDark));
        browBump.position.set(s * 0.35, 0.48, 0.3); headGroup.add(browBump);
      }
      for (let wi = 0; wi < 4; wi++) {
        const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.5 - wi * 0.06, 0.02, 0.04), dmat(scaleCol));
        wrinkle.position.set(0, 0.25 - wi * 0.03, 0.5 + wi * 0.18); headGroup.add(wrinkle);
      }
      const scarMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });
      const scar1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), scarMat);
      scar1.position.set(0.3, 0.15, 0.5); scar1.rotation.z = 0.3; headGroup.add(scar1);
      const scar2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), scarMat);
      scar2.position.set(-0.2, 0.1, 0.7); scar2.rotation.z = -0.2; headGroup.add(scar2);
      for (const s of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.35), dmat(bodyMid));
        cheek.position.set(s * 0.52, -0.05, 0.15); headGroup.add(cheek);
      }

      // Jaw
      const jawPivot = new THREE.Group();
      jawPivot.position.set(0, -0.3, -0.1); headGroup.add(jawPivot);
      const jawMain = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.2), dmat(bodyLight));
      jawMain.position.set(0, -0.1, 0.5); jawPivot.add(jawMain);
      const jawTip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), dmat(bodyMid));
      jawTip.position.set(0, -0.1, 1.15); jawPivot.add(jawTip);
      const gumTop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.9), dmat(gumCol));
      gumTop.position.set(0, -0.38, 0.6); headGroup.add(gumTop);
      const gumBot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.8), dmat(gumCol));
      gumBot.position.set(0, 0.05, 0.5); jawPivot.add(gumBot);
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.5), dmat(tongueCol));
      tongue.position.set(0, 0.02, 0.4); jawPivot.add(tongue);

      // Teeth — top row
      const topTeethSizes = [0.06, 0.1, 0.14, 0.18, 0.2, 0.18, 0.2, 0.18, 0.14, 0.1, 0.06];
      for (let ti = 0; ti < topTeethSizes.length; ti++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, topTeethSizes[ti], 5), smoothMat2(teethCol, 0.2));
        tooth.position.set(-0.3 + ti * 0.06, -0.42, 0.3 + Math.sin(ti * 0.6) * 0.35);
        tooth.rotation.x = Math.PI; tooth.rotation.z = (ti - 5) * 0.04;
        tooth.rotation.y = (ti - 5) * 0.02; headGroup.add(tooth);
      }
      for (let ti = 0; ti < 9; ti++) {
        const h = 0.06 + Math.sin(ti * 0.8) * 0.06;
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, h, 5), smoothMat2(teethCol, 0.2));
        tooth.position.set(-0.24 + ti * 0.06, 0.08, 0.3 + Math.sin(ti * 0.6) * 0.3);
        jawPivot.add(tooth);
      }
      // Saliva
      for (let si2 = 0; si2 < 3; si2++) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.15, 3), smoothMat2(0xddddcc, 0.1));
        strand.position.set(-0.1 + si2 * 0.1, -0.2, 0.5 + si2 * 0.1); headGroup.add(strand);
      }

      // Eyes
      for (const s of [-1, 1]) {
        const socket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.14), dmat(scaleCol));
        socket.position.set(s * 0.48, 0.2, 0.24); headGroup.add(socket);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), smoothMat2(0xeeeedd, 0.15));
        eye.position.set(s * 0.48, 0.22, 0.32); headGroup.add(eye);
        for (let v = 0; v < 3; v++) {
          const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 3), smoothMat2(0xaa3333, 0.2));
          vein.position.set(s * 0.48 + Math.cos(v * 2) * 0.04, 0.22 + Math.sin(v * 2) * 0.04, 0.315);
          vein.rotation.z = v * 1.1; headGroup.add(vein);
        }
        const iris = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), smoothMat2(eyeCol, 0.2));
        iris.position.set(s * 0.48, 0.22, 0.42); headGroup.add(iris);
        const pup = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.01), smoothMat2(pupilCol));
        pup.position.set(s * 0.48, 0.22, 0.425); headGroup.add(pup);
        const eyelid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), dmat(bodyDark));
        eyelid.position.set(s * 0.48, 0.29, 0.34); eyelid.rotation.x = 0.2; headGroup.add(eyelid);
        for (let w = 0; w < 2; w++) {
          const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.04), dmat(scaleCol));
          wrinkle.position.set(s * 0.48, 0.12 - w * 0.04, 0.32); headGroup.add(wrinkle);
        }
      }
      // Nostrils
      for (const s of [-1, 1]) {
        const nostrilOuter = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), dmat(bodyDark));
        nostrilOuter.position.set(s * 0.16, 0.1, 1.28); headGroup.add(nostrilOuter);
        const nostrilInner = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), smoothMat2(0x0a0a05));
        nostrilInner.position.set(s * 0.16, 0.1, 1.32); headGroup.add(nostrilInner);
      }

      // === TAIL ===
      const carTailPivots: THREE.Group[] = [];
      let tailParent: THREE.Object3D = bodyGroup;
      let tailZ2 = -1.5;
      for (let ti = 0; ti < 8; ti++) {
        const sc = 1 - ti * 0.1;
        const pivot = new THREE.Group();
        if (ti === 0) { pivot.position.set(0, 0, tailZ2); tailParent.add(pivot); }
        else { pivot.position.set(0, 0, -0.55); tailParent.add(pivot); }
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.55 * sc, 0.45 * sc, 0.6), dmat(ti % 2 === 0 ? bodyMid : bodyDark));
        seg.castShadow = true; pivot.add(seg);
        if (ti < 5) {
          const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sc, 0.2 * sc, 4), dmat(scaleCol));
          ridge.position.y = 0.25 * sc; pivot.add(ridge);
        }
        carTailPivots.push(pivot);
        tailParent = pivot;
      }
      const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), dmat(bodyDark));
      tailTip.position.set(0, 0, -0.3); tailTip.rotation.x = Math.PI / 2; tailParent.add(tailTip);

      // === LEGS ===
      const carLegPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[] = [];
      for (const side of [-1, 1]) {
        const hipBulge = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), dmat(bodyMid));
        hipBulge.position.set(side * 0.7, 2.0, -0.2); group.add(hipBulge);
        const thighPivot = new THREE.Group();
        thighPivot.position.set(side * 0.7, 1.8, -0.2); group.add(thighPivot);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.65), dmat(bodyMid));
        thigh.position.y = -0.65; thigh.castShadow = true; thighPivot.add(thigh);
        const thighMuscle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), dmat(bodyLight));
        thighMuscle.position.set(side * 0.1, -0.3, 0.1); thighPivot.add(thighMuscle);
        const kneeBulge = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), dmat(bodyDark));
        kneeBulge.position.y = -1.3; thighPivot.add(kneeBulge);
        const shinPivot = new THREE.Group();
        shinPivot.position.y = -1.3; thighPivot.add(shinPivot);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.4), dmat(bodyDark));
        shin.position.y = -0.55; shinPivot.add(shin);
        const calf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.35), dmat(bodyMid));
        calf.position.set(0, -0.25, -0.1); shinPivot.add(calf);
        const ankleBulge = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 5), dmat(bodyDark));
        ankleBulge.position.y = -1.1; shinPivot.add(ankleBulge);
        const footPivot = new THREE.Group();
        footPivot.position.y = -1.1; shinPivot.add(footPivot);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.7), dmat(bodyDark));
        foot.position.set(0, -0.08, 0.15); footPivot.add(foot);
        for (let c = -1; c <= 1; c++) {
          const toe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), dmat(bodyMid));
          toe.position.set(c * 0.14, -0.08, 0.5); footPivot.add(toe);
          const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), dmat(bodyDark));
          knuckle.position.set(c * 0.14, -0.02, 0.4); footPivot.add(knuckle);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), smoothMat2(clawCol, 0.3));
          claw.position.set(c * 0.14, -0.1, 0.72); claw.rotation.x = Math.PI / 2 + 0.2; footPivot.add(claw);
        }
        const dewclaw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), smoothMat2(clawCol, 0.3));
        dewclaw.position.set(0, -0.05, -0.2); dewclaw.rotation.x = -Math.PI / 2; footPivot.add(dewclaw);
        for (let w = 0; w < 3; w++) {
          const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.08), dmat(scaleCol));
          wrinkle.position.set(0, 0.05 + w * 0.06, 0); footPivot.add(wrinkle);
        }
        carLegPivots.push({ thighPivot, shinPivot, side });
      }

      // === TINY ARMS ===
      const carArmPivots: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const armPivot = new THREE.Group();
        armPivot.position.set(side * 0.65, 2.8, 1.3); group.add(armPivot);
        const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), dmat(bodyLight));
        upperArm.position.y = -0.18; armPivot.add(upperArm);
        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), dmat(bodyMid));
        forearm.position.set(0, -0.45, 0.05); armPivot.add(forearm);
        for (const f of [-1, 1]) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), dmat(bodyDark));
          finger.position.set(f * 0.04, -0.6, 0.05); armPivot.add(finger);
          const fClaw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 3), smoothMat2(clawCol, 0.3));
          fClaw.position.set(f * 0.04, -0.68, 0.05); fClaw.rotation.x = Math.PI; armPivot.add(fClaw);
        }
        armPivot.rotation.z = side * 0.5; armPivot.rotation.x = -0.3;
        carArmPivots.push(armPivot);
      }

      // === BACK RIDGES ===
      for (let ri = -3; ri <= 4; ri++) {
        const h = 0.15 + Math.sin((ri + 3) * 0.4) * 0.1;
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 4), dmat(scaleCol));
        ridge.position.set(0, 3.35, -0.3 + ri * 0.35); group.add(ridge);
      }

      group.scale.set(3, 3, 3);

      // Place T-Rex
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 25; // slower than cars — they're dinosaurs
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      group.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      group.rotation.y = angle;
      this.scene3d.add(group);

      this.cars.push({
        mesh: group,
        vx: 0,
        vz: 0,
        speed,
        driver: 'none',
        legPivots: carLegPivots,
        armPivots: carArmPivots,
        tailPivots: carTailPivots,
        jawPivot,
        neckBase,
        neckMid,
        bodyGroup,
        runPhase: Math.random() * Math.PI * 2,
      });
    }

    // === TRICERATOPS (6) — big, stocky, 3 horns, frill ===
    const triColors = [
      { body: 0x6a5a3a, light: 0x8a7a5a },
      { body: 0x5a6a4a, light: 0x7a8a6a },
      { body: 0x7a5a4a, light: 0x9a7a6a },
    ];
    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const tc = triColors[i % triColors.length];
      const bmat = new THREE.MeshStandardMaterial({ color: tc.body, roughness: 0.85 });
      const lmat = new THREE.MeshStandardMaterial({ color: tc.light, roughness: 0.8 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xeeddaa, roughness: 0.4, metalness: 0.1 });

      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 1.8; group.add(bodyGroup);
      // Big round body
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 3.2), bmat);
      body.castShadow = true; bodyGroup.add(body);
      // Belly
      const belly = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.8), lmat);
      belly.position.y = -0.7; bodyGroup.add(belly);

      // Head
      const headG = new THREE.Group();
      headG.position.set(0, 0.2, 1.8); bodyGroup.add(headG);
      const skull = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), bmat);
      headG.add(skull);
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), lmat);
      beak.position.z = 0.7; headG.add(beak);
      // Frill — big bony plate behind head
      const frill = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 0.15), bmat);
      frill.position.set(0, 0.6, -0.5); headG.add(frill);
      // Frill edge bumps
      for (let fi = 0; fi < 8; fi++) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), hornMat);
        const angle = (fi / 8) * Math.PI - Math.PI * 0.5;
        bump.position.set(Math.cos(angle) * 1.0, Math.sin(angle) * 0.8 + 0.6, -0.5);
        headG.add(bump);
      }
      // Nose horn — big
      const noseHorn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 6), hornMat);
      noseHorn.position.set(0, 0.3, 0.9); headG.add(noseHorn);
      // Two brow horns — long
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.2, 6), hornMat);
        horn.position.set(s * 0.35, 0.5, 0.1);
        horn.rotation.z = s * -0.3;
        horn.rotation.x = -0.4;
        headG.add(horn);
      }
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        eye.position.set(s * 0.45, 0.1, 0.3); headG.add(eye);
      }

      // Jaw
      const jawPivot = new THREE.Group();
      jawPivot.position.set(0, -0.3, 0.2); headG.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), lmat);
      jaw.position.set(0, -0.1, 0.2); jawPivot.add(jaw);

      // 4 thick legs
      const legPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[] = [];
      for (const side of [-1, 1]) {
        for (const fz of [-0.8, 0.8]) {
          const thighPivot = new THREE.Group();
          thighPivot.position.set(side * 0.85, 1.5, fz); group.add(thighPivot);
          const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.55), bmat);
          thigh.position.y = -0.6; thigh.castShadow = true; thighPivot.add(thigh);
          const shinPivot = new THREE.Group();
          shinPivot.position.y = -1.1; thighPivot.add(shinPivot);
          const shin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.45), lmat);
          shin.position.y = -0.4; shinPivot.add(shin);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), bmat);
          foot.position.set(0, -0.8, 0.05); shinPivot.add(foot);
          legPivots.push({ thighPivot, shinPivot, side });
        }
      }

      // Tail
      const tailPivots: THREE.Group[] = [];
      let tp: THREE.Object3D = bodyGroup;
      for (let ti = 0; ti < 5; ti++) {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, ti === 0 ? -1.7 : -0.5);
        tp.add(pivot);
        const sc = 1 - ti * 0.15;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5 * sc, 0.4 * sc, 0.55), bmat);
        pivot.add(seg);
        tailPivots.push(pivot);
        tp = pivot;
      }

      group.scale.set(2.5, 2.5, 2.5);
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      group.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene3d.add(group);
      this.cars.push({ mesh: group, vx: 0, vz: 0, speed: 20 + Math.random() * 15, driver: 'none', legPivots, tailPivots, jawPivot, bodyGroup, runPhase: Math.random() * Math.PI * 2 });
    }

    // === VELOCIRAPTOR (8) — small, fast, feathered ===
    const rapColors = [
      { body: 0x3a5a2a, light: 0x5a7a4a },
      { body: 0x5a3a2a, light: 0x7a5a4a },
      { body: 0x2a3a5a, light: 0x4a5a7a },
      { body: 0x5a5a2a, light: 0x7a7a4a },
    ];
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const vc = rapColors[i % rapColors.length];
      const bmat = new THREE.MeshStandardMaterial({ color: vc.body, roughness: 0.75 });
      const lmat = new THREE.MeshStandardMaterial({ color: vc.light, roughness: 0.7 });
      const clawMat = new THREE.MeshStandardMaterial({ color: 0x1a1a10, roughness: 0.3 });

      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 1.2; group.add(bodyGroup);
      // Sleek body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 1.6), bmat);
      body.castShadow = true; bodyGroup.add(body);
      // Belly
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.4), lmat);
      belly.position.y = -0.25; bodyGroup.add(belly);
      // Feather tufts on arms and back
      for (let fi = -2; fi <= 2; fi++) {
        const feather = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.25), new THREE.MeshStandardMaterial({ color: vc.light + 0x101010 }));
        feather.position.set(0, 0.3, fi * 0.3); bodyGroup.add(feather);
      }

      // Neck
      const neckBase = new THREE.Group();
      neckBase.position.set(0, 0.15, 0.9); bodyGroup.add(neckBase);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), bmat);
      neckBase.add(neck);
      const neckMid = new THREE.Group();
      neckMid.position.set(0, 0.25, 0.15); neckBase.add(neckMid);

      // Head — narrow and sharp
      const headG = new THREE.Group();
      headG.position.set(0, 0.2, 0.2); neckMid.add(headG);
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.5), bmat);
      headG.add(skull);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.4), lmat);
      snout.position.z = 0.4; headG.add(snout);
      // Big eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xddaa22 }));
        eye.position.set(s * 0.18, 0.08, 0.15); headG.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshStandardMaterial({ color: 0x111100 }));
        pupil.position.set(s * 0.18, 0.08, 0.22); headG.add(pupil);
      }
      // Teeth
      for (let ti = 0; ti < 6; ti++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xeeeedd }));
        tooth.position.set(-0.08 + ti * 0.03, -0.15, 0.35 + Math.sin(ti) * 0.15);
        tooth.rotation.x = Math.PI; headG.add(tooth);
      }

      const jawPivot = new THREE.Group();
      jawPivot.position.set(0, -0.15, 0); headG.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), lmat);
      jaw.position.set(0, -0.05, 0.2); jawPivot.add(jaw);

      // Legs — long and bird-like
      const legPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[] = [];
      for (const side of [-1, 1]) {
        const thighPivot = new THREE.Group();
        thighPivot.position.set(side * 0.25, 0.9, -0.1); group.add(thighPivot);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), bmat);
        thigh.position.y = -0.35; thigh.castShadow = true; thighPivot.add(thigh);
        const shinPivot = new THREE.Group();
        shinPivot.position.y = -0.7; thighPivot.add(shinPivot);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), lmat);
        shin.position.y = -0.3; shinPivot.add(shin);
        // Big killing claw on each foot
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), bmat);
        foot.position.set(0, -0.6, 0.08); shinPivot.add(foot);
        const killClaw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 5), clawMat);
        killClaw.position.set(0, -0.55, 0.3); killClaw.rotation.x = Math.PI / 2 + 0.3;
        shinPivot.add(killClaw);
        legPivots.push({ thighPivot, shinPivot, side });
      }

      // Arms with feathers
      for (const side of [-1, 1]) {
        const armPivot = new THREE.Group();
        armPivot.position.set(side * 0.3, 1.4, 0.5); group.add(armPivot);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), bmat);
        arm.position.y = -0.12; armPivot.add(arm);
        // Feather fan on arm
        for (let fi = 0; fi < 4; fi++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: vc.light + 0x202020 }));
          f.position.set(side * 0.06, -0.1 - fi * 0.04, fi * 0.04);
          armPivot.add(f);
        }
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), clawMat);
        claw.position.set(0, -0.3, 0); claw.rotation.x = Math.PI; armPivot.add(claw);
        armPivot.rotation.z = side * 0.6;
      }

      // Tail — long and stiff
      const tailPivots: THREE.Group[] = [];
      let tp2: THREE.Object3D = bodyGroup;
      for (let ti = 0; ti < 6; ti++) {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, ti === 0 ? -0.9 : -0.35);
        tp2.add(pivot);
        const sc = 1 - ti * 0.12;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.15 * sc, 0.12 * sc, 0.35), bmat);
        pivot.add(seg);
        tailPivots.push(pivot);
        tp2 = pivot;
      }

      group.scale.set(2, 2, 2);
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      group.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene3d.add(group);
      this.cars.push({ mesh: group, vx: 0, vz: 0, speed: 40 + Math.random() * 20, driver: 'none', legPivots, tailPivots, jawPivot, neckBase, neckMid, bodyGroup, runPhase: Math.random() * Math.PI * 2 });
    }

    // === STEGOSAURUS (4) — plates on back, spiked tail ===
    const stegoColors = [
      { body: 0x5a6a3a, light: 0x7a8a5a },
      { body: 0x6a5a4a, light: 0x8a7a6a },
    ];
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const sc2 = stegoColors[i % stegoColors.length];
      const bmat = new THREE.MeshStandardMaterial({ color: sc2.body, roughness: 0.85 });
      const lmat = new THREE.MeshStandardMaterial({ color: sc2.light, roughness: 0.8 });
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7 });
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.3, metalness: 0.1 });

      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 2.0; group.add(bodyGroup);
      // Big round body — arched back
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 3.5), bmat);
      body.castShadow = true; bodyGroup.add(body);
      const belly = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 3.0), lmat);
      belly.position.y = -0.6; bodyGroup.add(belly);

      // Back plates — two rows of diamond shapes
      for (let pi = -4; pi <= 4; pi++) {
        const size = 0.4 + Math.sin((pi + 4) * 0.35) * 0.25;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, size, size * 0.7), plateMat);
        plate.position.set(0, 0.9 + size * 0.3, pi * 0.38);
        plate.rotation.z = Math.PI * 0.25;
        bodyGroup.add(plate);
      }

      // Small head on long low neck
      const neckBase = new THREE.Group();
      neckBase.position.set(0, -0.2, 1.9); bodyGroup.add(neckBase);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), bmat);
      neckBase.add(neck);
      const neckMid = new THREE.Group();
      neckMid.position.set(0, 0, 0.5); neckBase.add(neckMid);
      const headG = new THREE.Group();
      headG.position.set(0, 0.1, 0.4); neckMid.add(headG);
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), bmat);
      headG.add(skull);
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), lmat);
      beak.position.z = 0.35; headG.add(beak);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0x332211 }));
        eye.position.set(s * 0.18, 0.05, 0.15); headG.add(eye);
      }
      const jawPivot = new THREE.Group();
      jawPivot.position.set(0, -0.12, 0); headG.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.45), lmat);
      jaw.position.set(0, -0.05, 0.15); jawPivot.add(jaw);

      // 4 thick legs
      const legPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[] = [];
      for (const side of [-1, 1]) {
        for (const fz of [-1.0, 0.8]) {
          const thighPivot = new THREE.Group();
          thighPivot.position.set(side * 0.8, 1.6, fz); group.add(thighPivot);
          const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), bmat);
          thigh.position.y = -0.55; thigh.castShadow = true; thighPivot.add(thigh);
          const shinPivot = new THREE.Group();
          shinPivot.position.y = -1.0; thighPivot.add(shinPivot);
          const shin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), lmat);
          shin.position.y = -0.35; shinPivot.add(shin);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.45), bmat);
          foot.position.set(0, -0.7, 0); shinPivot.add(foot);
          legPivots.push({ thighPivot, shinPivot, side });
        }
      }

      // Spiked tail — the thagomizer!
      const tailPivots: THREE.Group[] = [];
      let tp3: THREE.Object3D = bodyGroup;
      for (let ti = 0; ti < 6; ti++) {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, ti === 0 ? -1.9 : -0.5);
        tp3.add(pivot);
        const sc = 1 - ti * 0.12;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5 * sc, 0.4 * sc, 0.55), bmat);
        pivot.add(seg);
        tailPivots.push(pivot);
        tp3 = pivot;
      }
      // 4 tail spikes at the end
      for (const s of [-1, 1]) {
        for (const ud of [-1, 1]) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 5), spikeMat);
          spike.position.set(s * 0.2, ud * 0.15, -0.3);
          spike.rotation.x = Math.PI / 2 + ud * 0.3;
          spike.rotation.z = s * 0.3;
          tp3.add(spike);
        }
      }

      group.scale.set(2.5, 2.5, 2.5);
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      group.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene3d.add(group);
      this.cars.push({ mesh: group, vx: 0, vz: 0, speed: 15 + Math.random() * 10, driver: 'none', legPivots, tailPivots, jawPivot, neckBase, neckMid, bodyGroup, runPhase: Math.random() * Math.PI * 2 });
    }
  }

  private updateCars(dt: number): void {
    // NPCs look for nearby empty cars to drive
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      // Check if this NPC is already driving
      const alreadyDriving = this.cars.some(c => c.driver === this.npcs.indexOf(npc));
      if (alreadyDriving) continue;

      // Find nearest empty car
      for (let ci = 0; ci < this.cars.length; ci++) {
        const car = this.cars[ci];
        if (car.driver !== 'none') continue;
        const dx = npc.mesh.position.x - car.mesh.position.x;
        const dz = npc.mesh.position.z - car.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 4) {
          car.driver = this.npcs.indexOf(npc);
          npc.mesh.visible = false; // hide NPC, they're in the car
          break;
        }
      }
    }

    // Player enter/exit car — check E key or proximity auto-detect handled in keyboard
    // (E key handling added in setupKeyboard)

    for (let ci = 0; ci < this.cars.length; ci++) {
      const car = this.cars[ci];

      if (car.driver === 'player') {
        // Player drives — car follows look direction
        const spd = car.speed;
        car.vx = -Math.sin(this.lookAngle) * spd * Math.max(-this.moveDir.z, 0);
        car.vz = -Math.cos(this.lookAngle) * spd * Math.max(-this.moveDir.z, 0);
        car.mesh.rotation.y = this.lookAngle + Math.PI;
        car.mesh.position.x += car.vx * dt;
        car.mesh.position.z += car.vz * dt;
        car.mesh.position.y = this.getTerrainHeight(car.mesh.position.x, car.mesh.position.z);
        // Sync player pos to car — show player sitting on top
        this.playerPos.set(car.mesh.position.x, car.mesh.position.y, car.mesh.position.z);
        this.playerModel.visible = true;
        const seatBounce = Math.abs(Math.sin((car.runPhase || 0))) * 0.15;
        // Seat height — sit right on the dino's back
        const dinoScale = car.mesh.scale.y;
        const bodyY = car.bodyGroup ? car.bodyGroup.position.y : 2.0;
        const bodyHalfH = 0.7; // half the body mesh height roughly
        const seatHeight = (bodyY + bodyHalfH) * dinoScale;
        this.playerModel.position.set(car.mesh.position.x, car.mesh.position.y + seatHeight + seatBounce, car.mesh.position.z);
        this.playerModel.rotation.y = this.lookAngle + Math.PI;
        // Riding pose — sitting with legs in stirrups, arms holding reins
        this.pLeftThigh.rotation.x = -1.4;
        this.pRightThigh.rotation.x = -1.4;
        this.pLeftShin.rotation.x = 1.2;
        this.pRightShin.rotation.x = 1.2;
        // Arms forward holding reins
        this.pLeftUpperArm.rotation.x = -0.8;
        this.pLeftForearm.rotation.x = -0.6;
        this.pRightUpperArm.rotation.x = -0.8;
        this.pRightForearm.rotation.x = -0.6;
        // Update engine pitch based on actual speed
        const actualSpd = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
      } else if (typeof car.driver === 'number') {
        // NPC drives — chase nearest enemy
        const npc = this.npcs[car.driver];
        if (!npc || npc.dead) {
          car.driver = 'none';
          car.vx = 0;
          car.vz = 0;
          continue;
        }

        // Find nearest NPC target to chase (prefer NPCs over player)
        let tx = 0, tz = 0;
        let bestDist = 99999;
        for (let j = 0; j < this.npcs.length; j++) {
          if (j === car.driver || this.npcs[j].dead) continue;
          if (this.cars.some(c => c.driver === j)) continue; // skip NPCs in cars
          const od = Math.sqrt(
            (this.npcs[j].mesh.position.x - car.mesh.position.x) ** 2 +
            (this.npcs[j].mesh.position.z - car.mesh.position.z) ** 2
          );
          if (od < bestDist) {
            bestDist = od;
            tx = this.npcs[j].mesh.position.x;
            tz = this.npcs[j].mesh.position.z;
          }
        }
        // T-Rex does NOT chase the player — only NPCs

        const ddx = tx - car.mesh.position.x;
        const ddz = tz - car.mesh.position.z;
        const dlen = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dlen > 1) {
          car.vx = (ddx / dlen) * car.speed;
          car.vz = (ddz / dlen) * car.speed;
        }

        car.mesh.position.x += car.vx * dt;
        car.mesh.position.z += car.vz * dt;
        car.mesh.position.y = this.getTerrainHeight(car.mesh.position.x, car.mesh.position.z);
        if (dlen > 1) car.mesh.rotation.y = Math.atan2(car.vx, car.vz);

        // Sync NPC pos to car
        npc.mesh.position.copy(car.mesh.position);
        // Update NPC car engine pitch
        const npcSpd = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
      } else {
        // No driver — wild T-Rex stands still, waiting to be ridden
        car.vx = 0;
        car.vz = 0;
      }

      // Bounce off world edges
      if (Math.abs(car.mesh.position.x) > 450) {
        car.vx *= -1;
        car.mesh.position.x = Math.sign(car.mesh.position.x) * 449;
      }
      if (Math.abs(car.mesh.position.z) > 450) {
        car.vz *= -1;
        car.mesh.position.z = Math.sign(car.mesh.position.z) * 449;
      }

      // T-Rex doesn't attack player — just roams around

      // T-Rex stomps NPCs (not the rider)
      for (let ni = 0; ni < this.npcs.length; ni++) {
        const npc = this.npcs[ni];
        if (npc.dead || ni === car.driver) continue;
        // Don't eat NPCs that are riding T-Rexes
        if (this.cars.some(c => c.driver === ni)) continue;
        const ndx = npc.mesh.position.x - car.mesh.position.x;
        const ndz = npc.mesh.position.z - car.mesh.position.z;
        const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
        if (ndist < 2.5) {
          npc.hp = 0;
          npc.dead = true;
          this.coinsEarned += 1000;
          this.showPickupMsg('T-Rex stomped them! +1000 coins!');
          this.spawnDeathFluff(npc.mesh.position.clone());
          this.scene3d.remove(npc.mesh);
        }
      }

      // T-Rex attacks bear boss
      if (!this.bossDead && this.bossSpawned && this.boss) {
        const bdx = car.mesh.position.x - this.boss.position.x;
        const bdz = car.mesh.position.z - this.boss.position.z;
        const bdist = Math.sqrt(bdx * bdx + bdz * bdz);
        if (bdist < 4 && car.speed > 3) {
          const damage = Math.round(car.speed * 5);
          this.bossHP -= damage;
          this.playSfx('carHit', 0.8);
          this.bossRoarTimer = 0.8;
          this.playSfx('roar', 0.7);
          // T-Rex recoils from the fight
          car.speed *= -0.5;
          if (this.bossHP <= 0) {
            this.bossDead = true;
            this.coinsEarned += 1000;
            this.spawnDeathFluff(this.boss.position.clone(), 40);
            this.scene3d.remove(this.boss);
            this.playSfx('bossDeath', 0.8);
            setTimeout(() => this.showVictory(), 1500);
          }
        }
      }

      // Running animation — works for all dino types
      const spd = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
      if (spd > 1 && car.legPivots) {
        car.runPhase = (car.runPhase || 0) + dt * 7;
        const rc = car.runPhase;

        // Body bounce
        if (car.bodyGroup) {
          const baseY = car.bodyGroup.userData.baseY ?? car.bodyGroup.position.y;
          car.bodyGroup.userData.baseY = baseY;
          car.bodyGroup.position.y = baseY + Math.abs(Math.sin(rc)) * 0.15;
          car.bodyGroup.rotation.x = Math.sin(rc) * 0.03;
        }

        // Neck sway
        if (car.neckBase) {
          car.neckBase.rotation.x = Math.sin(rc * 0.5) * 0.08;
          car.neckBase.rotation.y = Math.sin(rc * 0.3) * 0.04;
        }
        if (car.neckMid) {
          car.neckMid.rotation.x = Math.sin(rc * 0.5 + 0.5) * 0.06;
        }

        // Jaw bounce
        if (car.jawPivot) {
          car.jawPivot.rotation.x = Math.abs(Math.sin(rc * 2)) * 0.08;
        }

        // Leg running
        for (const leg of car.legPivots) {
          const phase = rc + (leg.side === 1 ? Math.PI : 0);
          leg.thighPivot.rotation.x = Math.sin(phase) * 0.7;
          const backSwing = Math.max(0, Math.sin(phase));
          leg.shinPivot.rotation.x = backSwing * 0.8;
        }

        // Arms bounce (T-Rex only)
        if (car.armPivots) {
          for (let ai = 0; ai < car.armPivots.length; ai++) {
            const phase = rc + (ai === 0 ? Math.PI : 0);
            car.armPivots[ai].rotation.x = -0.3 + Math.sin(phase) * 0.3;
          }
        }

        // Tail wave
        if (car.tailPivots) {
          for (let ti = 0; ti < car.tailPivots.length; ti++) {
            const delay = ti * 0.4;
            car.tailPivots[ti].rotation.y = Math.sin(rc + delay) * (0.12 + ti * 0.02);
            car.tailPivots[ti].rotation.x = Math.sin(rc * 0.5 + delay) * 0.03;
          }
        }
      } else if (spd <= 1) {
        // Reset to idle pose when stopped
        car.runPhase = car.runPhase || 0;
      }
    }
  }


  private createBearBoss(): void {
    const group = new THREE.Group();

    // Black bear fur materials
    const furMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.95, metalness: 0.0 });
    const darkFur = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.98 });
    const lightFur = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 });
    const bellyFur = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.3 }); // wet nose
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x080400, roughness: 0.1 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.4, metalness: 0.1 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6a0a18, roughness: 0.7 });
    const gumMat = new THREE.MeshStandardMaterial({ color: 0xaa3344, roughness: 0.5 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xcc5566, roughness: 0.4 });

    // === BODY — LatheGeometry for organic barrel shape ===
    const bodyProfile: THREE.Vector2[] = [];
    // From tail end (z=-) to chest (z=+)
    bodyProfile.push(new THREE.Vector2(0, -3.2));
    bodyProfile.push(new THREE.Vector2(1.0, -3.0));
    bodyProfile.push(new THREE.Vector2(1.8, -2.5));
    bodyProfile.push(new THREE.Vector2(2.3, -1.8));
    bodyProfile.push(new THREE.Vector2(2.5, -0.8)); // widest at hips
    bodyProfile.push(new THREE.Vector2(2.4, 0.0));
    bodyProfile.push(new THREE.Vector2(2.5, 0.8)); // widest at shoulders
    bodyProfile.push(new THREE.Vector2(2.3, 1.5));
    bodyProfile.push(new THREE.Vector2(1.8, 2.2));
    bodyProfile.push(new THREE.Vector2(1.2, 2.8));
    bodyProfile.push(new THREE.Vector2(0, 3.0));
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 18);
    const body = new THREE.Mesh(bodyGeo, furMat);
    body.rotation.x = Math.PI / 2; // lay horizontal
    body.position.set(0, 3.5, 0);
    body.scale.set(1, 0.82, 1); // flatten slightly
    body.castShadow = true;
    group.add(body);

    // Belly underside (lighter)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 10), bellyFur);
    belly.position.set(0, 2.6, 0.3);
    belly.scale.set(0.65, 0.45, 1.1);
    group.add(belly);

    // Shoulder hump (grizzly signature)
    const hump = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), furMat);
    hump.position.set(0, 5.0, -0.3);
    hump.scale.set(1.1, 0.7, 0.9);
    hump.castShadow = true;
    group.add(hump);

    // Muscle definition — shoulder blades
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), furMat);
      shoulder.position.set(side * 1.5, 4.2, 1.0);
      shoulder.scale.set(0.6, 0.8, 0.7);
      group.add(shoulder);
      // Hip muscles
      const hip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), furMat);
      hip.position.set(side * 1.4, 3.5, -1.8);
      hip.scale.set(0.6, 0.7, 0.8);
      group.add(hip);
    }

    // Fur tufts along spine
    for (let i = -4; i <= 3; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 4), darkFur);
      tuft.position.set((Math.random() - 0.5) * 0.3, 5.0 - Math.abs(i) * 0.15, i * 0.7);
      tuft.rotation.x = -0.3;
      group.add(tuft);
    }

    // === HEAD ===
    const head = new THREE.Group();
    head.position.set(0, 4.8, 2.8);
    group.add(head);

    // Skull — LatheGeometry for realistic bear head
    const skullProfile: THREE.Vector2[] = [];
    skullProfile.push(new THREE.Vector2(0, -0.8));
    skullProfile.push(new THREE.Vector2(0.5, -0.7));
    skullProfile.push(new THREE.Vector2(0.9, -0.5));
    skullProfile.push(new THREE.Vector2(1.15, -0.2));
    skullProfile.push(new THREE.Vector2(1.2, 0.1)); // widest
    skullProfile.push(new THREE.Vector2(1.15, 0.4));
    skullProfile.push(new THREE.Vector2(0.95, 0.65));
    skullProfile.push(new THREE.Vector2(0.6, 0.8));
    skullProfile.push(new THREE.Vector2(0, 0.85));
    const skullGeo = new THREE.LatheGeometry(skullProfile, 16);
    const skull = new THREE.Mesh(skullGeo, furMat);
    skull.rotation.x = -0.15;
    skull.castShadow = true;
    head.add(skull);

    // Cheek fur puffs
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lightFur);
      cheek.position.set(side * 0.85, -0.1, 0.3);
      cheek.scale.set(0.5, 0.6, 0.5);
      head.add(cheek);
    }

    // Snout — more elongated and realistic
    const snoutBase = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), furMat);
    snoutBase.position.set(0, -0.25, 0.9);
    snoutBase.scale.set(0.75, 0.55, 1.1);
    head.add(snoutBase);
    // Snout bridge (top of nose)
    const snoutTop = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.8), furMat);
    snoutTop.position.set(0, 0.0, 1.0);
    snoutTop.rotation.x = 0.1;
    head.add(snoutTop);
    // Snout tip (wider, more realistic)
    const snoutTip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), furMat);
    snoutTip.position.set(0, -0.2, 1.5);
    snoutTip.scale.set(0.7, 0.5, 0.6);
    head.add(snoutTip);

    // Nose — large, wet, detailed
    const noseBase = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), noseMat);
    noseBase.position.set(0, -0.1, 1.75);
    noseBase.scale.set(1.2, 0.7, 0.7);
    head.add(noseBase);
    // Nostrils
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x050505 }));
      nostril.position.set(side * 0.12, -0.15, 1.78);
      head.add(nostril);
    }
    // Nose shine/highlight
    const noseShine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.0, metalness: 0.5 }));
    noseShine.position.set(0.05, -0.05, 1.8);
    head.add(noseShine);

    // Mouth — upper and lower jaw
    // Upper jaw interior
    const upperJaw = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mouthMat);
    upperJaw.position.set(0, -0.35, 1.15);
    upperJaw.rotation.x = 0.2;
    upperJaw.scale.set(0.65, 0.4, 0.8);
    head.add(upperJaw);
    // Lower jaw
    const lowerJaw = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), furMat);
    lowerJaw.position.set(0, -0.55, 0.9);
    lowerJaw.scale.set(0.65, 0.4, 0.9);
    head.add(lowerJaw);
    // Gums
    const gums = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.5), gumMat);
    gums.position.set(0, -0.4, 1.15);
    head.add(gums);
    // Tongue
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), tongueMat);
    tongue.position.set(0, -0.5, 1.0);
    tongue.scale.set(0.8, 0.3, 1.2);
    head.add(tongue);

    // Teeth — upper row with varying sizes (big and scary)
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.15, metalness: 0.1 });
    const toothSizes = [0.14, 0.18, 0.22, 0.28, 0.22, 0.18, 0.14];
    for (let t = 0; t < toothSizes.length; t++) {
      const x = (t - 3) * 0.11;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, toothSizes[t], 5), toothMat);
      tooth.position.set(x, -0.35, 1.4 - Math.abs(t - 3) * 0.03);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    }
    // Lower teeth
    for (let t = -3; t <= 3; t++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), toothMat);
      tooth.position.set(t * 0.09, -0.55, 1.3 - Math.abs(t) * 0.02);
      head.add(tooth);
    }
    // Canine fangs (huge, curved, terrifying)
    for (const side of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.65, 6), toothMat);
      fang.position.set(side * 0.28, -0.42, 1.3);
      fang.rotation.x = Math.PI + 0.2;
      fang.rotation.z = side * -0.12;
      head.add(fang);
    }

    // Eyes — small, deep-set, realistic amber
    for (const side of [-1, 1]) {
      // Deep socket shadow
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), darkFur);
      socket.position.set(side * 0.5, 0.15, 0.8);
      socket.scale.set(0.8, 0.6, 0.5);
      head.add(socket);
      // Eyeball
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.2 }));
      eyeWhite.position.set(side * 0.48, 0.18, 0.95);
      head.add(eyeWhite);
      // Iris (amber/brown)
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12),
        new THREE.MeshStandardMaterial({ color: 0xaa6600 }));
      iris.position.set(side * 0.48, 0.18, 1.065);
      head.add(iris);
      // Pupil
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), eyeMat);
      pupil.position.set(side * 0.48, 0.18, 1.07);
      head.add(pupil);
      // Eye shine
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.02, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }));
      shine.position.set(side * 0.46, 0.21, 1.075);
      head.add(shine);
      // Heavy brow ridge
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), darkFur);
      brow.position.set(side * 0.5, 0.32, 0.85);
      brow.scale.set(1.2, 0.5, 0.8);
      brow.rotation.z = side * 0.25;
      head.add(brow);
      // Under-eye fur
      const underEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), lightFur);
      underEye.position.set(side * 0.48, 0.05, 0.9);
      underEye.scale.set(0.8, 0.4, 0.5);
      head.add(underEye);
    }

    // Ears (round, realistic with fur detail)
    for (const side of [-1, 1]) {
      const earOuter = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), furMat);
      earOuter.position.set(side * 0.85, 0.65, -0.1);
      earOuter.scale.set(0.6, 0.85, 0.5);
      head.add(earOuter);
      const earInner = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2020 }));
      earInner.position.set(side * 0.84, 0.66, -0.05);
      earInner.scale.set(0.5, 0.7, 0.4);
      head.add(earInner);
      // Ear fur tufts
      const earTuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 3), lightFur);
      earTuft.position.set(side * 0.82, 0.8, -0.1);
      head.add(earTuft);
    }

    // Forehead wrinkles (when angry)
    for (let w = 0; w < 3; w++) {
      const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.04), darkFur);
      wrinkle.position.set(0, 0.4 + w * 0.08, 0.7);
      wrinkle.rotation.x = -0.2;
      head.add(wrinkle);
    }

    // === LEGS — anatomically correct with joints ===
    const legs = [
      { x: -1.2, z: 1.6, front: true },  // front left
      { x: 1.2, z: 1.6, front: true },   // front right
      { x: -1.3, z: -1.7, front: false }, // back left
      { x: 1.3, z: -1.7, front: false },  // back right
    ];
    for (const lp of legs) {
      const legGroup = new THREE.Group();
      legGroup.position.set(lp.x, 3.0, lp.z);
      group.add(legGroup);

      // Upper leg (thicker, muscular)
      const upperLen = lp.front ? 1.6 : 1.8;
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.5, upperLen, 10), furMat);
      upper.position.y = -0.8;
      upper.castShadow = true;
      legGroup.add(upper);
      // Knee/elbow joint
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), furMat);
      joint.position.y = -1.5;
      legGroup.add(joint);
      // Lower leg
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 1.4, 8), furMat);
      lower.position.y = -2.3;
      lower.castShadow = true;
      legGroup.add(lower);
      // Ankle
      const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), darkFur);
      ankle.position.y = -3.0;
      legGroup.add(ankle);
      // Paw (large, splayed)
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), darkFur);
      paw.position.set(0, -3.2, 0.2);
      paw.scale.set(1.1, 0.35, 1.4);
      paw.castShadow = true;
      legGroup.add(paw);
      // Paw pads
      const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
      const mainPad = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), padMat);
      mainPad.position.set(0, -3.3, 0.1);
      mainPad.scale.set(1.2, 0.2, 0.8);
      legGroup.add(mainPad);
      // Toe pads
      for (let toe = -2; toe <= 2; toe++) {
        const toePad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), padMat);
        toePad.position.set(toe * 0.13, -3.3, 0.5);
        toePad.scale.set(1, 0.3, 0.8);
        legGroup.add(toePad);
      }
      // Claws (5 per paw, curved)
      for (let c = -2; c <= 2; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 5), clawMat);
        claw.position.set(c * 0.13, -3.25, 0.7);
        claw.rotation.x = -0.6;
        legGroup.add(claw);
      }
    }

    // === TAIL (short, stubby, realistic) ===
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), furMat);
    tail.position.set(0, 4.0, -3.2);
    tail.scale.set(0.7, 0.6, 1.0);
    group.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), darkFur);
    tailTip.position.set(0, 3.9, -3.5);
    group.add(tailTip);

    // === SHADOW on ground ===
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    group.add(shadow);

    // Scale to player size
    group.scale.setScalar(0.35);

    // Place boss far from spawn
    const bx = 0;
    const bz = 0;
    group.position.set(bx, this.getTerrainHeight(bx, bz), bz);
    this.scene3d.add(group);
    this.boss = group;

    // Health bar (big, above head)
    const hb = this.createHealthBarSprite();
    hb.sprite.position.set(0, 4.5, 0);
    hb.sprite.scale.set(3, 0.3, 1);
    group.add(hb.sprite);
    this.bossHealthBar = hb.sprite;
    this.bossHealthCtx = hb.ctx;
    this.bossHealthTex = hb.texture;

    // Collider
    this.colliders.push({ x: bx, z: bz, r: 7 });
  }

  private updateTRexEatAnim(dt: number): void {
    const ea = this.trexEatAnim;
    if (!ea.active) return;
    ea.timer += dt;
    const car = this.cars[ea.trexIndex];
    if (!car) { ea.active = false; return; }

    // Face player toward the T-Rex
    const tdx = car.mesh.position.x - this.playerPos.x;
    const tdz = car.mesh.position.z - this.playerPos.z;
    this.playerModel.rotation.y = Math.atan2(tdx, tdz);

    if (ea.phase === 'jump') {
      // Player jumps HIGH, arms and legs flail in terror
      const jumpT = Math.min(ea.timer / 0.8, 1); // 0.8s jump (slower so you see it)
      const jumpHeight = Math.sin(jumpT * Math.PI) * 4; // jump 4 units high
      this.playerModel.position.y = ea.startY + jumpHeight;

      // Arms up in horror — waving
      const wave = Math.sin(ea.timer * 20) * 0.3;
      this.pLeftUpperArm.rotation.x = -2.8 + wave;
      this.pLeftUpperArm.rotation.z = 0.9;
      this.pRightUpperArm.rotation.x = -2.8 - wave;
      this.pRightUpperArm.rotation.z = -0.9;
      this.pLeftForearm.rotation.x = -0.8 + wave;
      this.pRightForearm.rotation.x = -0.8 - wave;
      // Legs kicking in panic
      this.pLeftThigh.rotation.x = -0.5 + Math.sin(ea.timer * 15) * 0.4;
      this.pLeftThigh.rotation.z = 0.5;
      this.pRightThigh.rotation.x = -0.5 + Math.sin(ea.timer * 15 + 2) * 0.4;
      this.pRightThigh.rotation.z = -0.5;

      // T-Rex opens jaw WIDE
      if (car.jawPivot) {
        car.jawPivot.rotation.x = jumpT * 1.2; // wide open
      }

      if (ea.timer >= 0.8) {
        ea.phase = 'chomp';
        ea.timer = 0;
      }
    } else if (ea.phase === 'chomp') {
      // T-Rex snaps jaw shut — CHOMP!
      const chompT = Math.min(ea.timer / 0.15, 1);
      if (car.jawPivot) {
        car.jawPivot.rotation.x = 1.2 * (1 - chompT); // snap shut hard
      }
      // Player drops into mouth
      this.playerModel.position.y = ea.startY + 4 * (1 - chompT);
      // Keep flailing
      this.pLeftUpperArm.rotation.x = -2.8;
      this.pRightUpperArm.rotation.x = -2.8;

      if (ea.timer >= 0.15) {
        ea.phase = 'swallow';
        ea.timer = 0;
        // Hide player — eaten!
        this.playerModel.visible = false;
        // Apply damage
        this.playerHP = Math.max(0, this.playerHP - ea.damage);
        this.hpText.textContent = `HP: ${this.playerHP}`;
      }
    } else if (ea.phase === 'swallow') {
      // T-Rex chews briefly then spits out
      if (car.jawPivot) {
        // Chewing motion
        car.jawPivot.rotation.x = Math.sin(ea.timer * 12) * 0.15;
      }
      if (ea.timer >= 0.6) {
        ea.active = false;
        if (car.jawPivot) car.jawPivot.rotation.x = 0;
        // Spit player out — fling away from T-Rex
        const dx = this.playerPos.x - car.mesh.position.x;
        const dz = this.playerPos.z - car.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        this.playerPos.x += (dx / dist) * 10;
        this.playerPos.z += (dz / dist) * 10;
        this.playerModel.visible = true;
        this.playerModel.position.y = ea.startY;
        if (this.playerHP <= 0) {
          this.showGameOver('STOMPED BY A T-REX');
        }
      }
    }
  }

  private updateBearBoss(dt: number): void {
    if (this.bossDead || !this.boss || !this.bossSpawned) return;

    this.bossPhase += dt;
    this.bossAttackTimer -= dt;

    const bx = this.boss.position.x;
    const bz = this.boss.position.z;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const dx = px - bx;
    const dz = pz - bz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face player
    if (dist > 1) {
      const targetAngle = Math.atan2(dx, dz);
      let da = targetAngle - this.boss.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.boss.rotation.y += da * dt * 3;
    }

    // Move toward player when within 80 units
    if (dist < 80 && dist > 8) {
      const speed = 20 * dt; // same speed as player
      this.boss.position.x += (dx / dist) * speed;
      this.boss.position.z += (dz / dist) * speed;
      this.boss.position.y = this.getTerrainHeight(this.boss.position.x, this.boss.position.z);

      // Walking animation — bob up and down
      this.boss.position.y += Math.abs(Math.sin(this.bossPhase * 6)) * 0.8;
      // Head bob
      const head = this.boss.children.find(c => c instanceof THREE.Group) as THREE.Group | undefined;
      if (head) {
        head.rotation.x = Math.sin(this.bossPhase * 6) * 0.08;
      }
    }

    // Attack — swipe when close
    if (dist < 12 && this.bossAttackTimer <= 0) {
      this.bossAttackTimer = 1.5; // attack every 1.5 seconds
      // Damage player
      this.playerHP = Math.max(0, this.playerHP - 20);
      this.playSfx('hurt', 0.6);
      this.hpText.textContent = `HP: ${this.playerHP}`;
      // Knockback
      if (dist > 0.5) {
        this.playerPos.x += (dx / dist) * 6;
        this.playerPos.z += (dz / dist) * 6;
      }
      if (this.playerHP <= 0) {
        this.showGameOver('MAULED BY THE BEAR');
      }
    }

    // Roar when shot — terrified rage animation
    if (this.bossRoarTimer > 0) {
      this.bossRoarTimer -= dt;
      const roarIntensity = this.bossRoarTimer / 0.8;
      const head = this.boss.children.find(c => c instanceof THREE.Group) as THREE.Group | undefined;
      if (head) {
        // Head rears back and shakes
        head.rotation.x = -0.6 * roarIntensity + Math.sin(this.bossPhase * 30) * 0.15 * roarIntensity;
        head.rotation.z = Math.sin(this.bossPhase * 25) * 0.1 * roarIntensity;
      }
      // Whole body rears up
      this.boss.position.y = this.getTerrainHeight(this.boss.position.x, this.boss.position.z) + 2.0 * roarIntensity;
      // Body shakes with fury
      this.boss.rotation.z = Math.sin(this.bossPhase * 35) * 0.05 * roarIntensity;
      this.boss.rotation.x = Math.sin(this.bossPhase * 28) * 0.03 * roarIntensity;
      // Flash red when hit
      if (roarIntensity > 0.5) {
        this.boss.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive.setHex(0xff0000);
            child.material.emissiveIntensity = roarIntensity * 0.4;
          }
        });
      } else {
        this.boss.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        });
      }
      // Show roar text
      if (this.bossRoarTimer > 0.6) {
        this.showPickupMsg('ROOAARRR!!!');
      }
    } else {
      // Normal head position or attack roar
      const head = this.boss.children.find(c => c instanceof THREE.Group) as THREE.Group | undefined;
      if (this.bossAttackTimer > 1.0) {
        if (head) head.rotation.x = -0.4;
      } else if (head) {
        head.rotation.x = 0;
        head.rotation.z = 0;
      }
      this.boss.rotation.z = 0;
      this.boss.rotation.x = 0;
    }

    // Update collider position
    const ci = this.colliders.findIndex(c => c.r === 7);
    if (ci >= 0) {
      this.colliders[ci].x = this.boss.position.x;
      this.colliders[ci].z = this.boss.position.z;
    }
  }

  private createClouds(): void {
    // Layered cloud puffs — bright tops, darker bottoms
    const cloudTopMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      roughness: 1,
      emissive: 0x334455,
      emissiveIntensity: 0.05,
    });
    const cloudBottomMat = new THREE.MeshStandardMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.5,
      roughness: 1,
    });
    // Warm sunset-tint material for cloud bottoms (occasional)
    const warmCloudMat = new THREE.MeshStandardMaterial({
      color: 0xeeddcc,
      transparent: true,
      opacity: 0.45,
      roughness: 1,
    });

    for (let i = 0; i < 100; i++) {
      const group = new THREE.Group();
      const puffs = 5 + Math.floor(Math.random() * 6);
      const cloudW = 4 + Math.random() * 8;
      // Some clouds big (1.5x), some small (0.6x), most normal
      const sizeRoll = Math.random();
      const cloudScale = sizeRoll < 0.2 ? 0.6 : sizeRoll > 0.8 ? 1.5 : 1.0;
      // ~30% of clouds get warm bottom tints
      const useWarmBottom = Math.random() < 0.3;

      for (let p = 0; p < puffs; p++) {
        const isTop = p > puffs * 0.4;
        const r = 2 + Math.random() * 3;
        let puffMat: THREE.MeshStandardMaterial;
        if (isTop) {
          puffMat = cloudTopMat;
        } else {
          puffMat = useWarmBottom && Math.random() < 0.5 ? warmCloudMat : cloudBottomMat;
        }
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(r, 8, 6),
          puffMat
        );
        puff.position.set(
          (Math.random() - 0.5) * cloudW,
          isTop ? Math.random() * 2 : -Math.random() * 1.5,
          (Math.random() - 0.5) * cloudW * 0.6
        );
        puff.scale.y = 0.3 + Math.random() * 0.25;
        puff.scale.x = 0.8 + Math.random() * 0.4;
        puff.castShadow = true;
        group.add(puff);
      }
      group.scale.setScalar(cloudScale);
      group.position.set(
        (Math.random() - 0.5) * 1200,
        35 + Math.random() * 30,
        (Math.random() - 0.5) * 1200
      );
      this.scene3d.add(group);
    }
  }

  private setupTouchControls(): void {
    const isMobile = 'ontouchstart' in window;
    if (!isMobile) return;

    // Prevent all page bouncing/zooming
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';

    const el = this.threeRenderer.domElement;

    // === FLOATING JOYSTICK (appears where you touch on left half) ===
    const joystickBase = document.createElement('div');
    joystickBase.style.cssText = 'position:fixed;left:30px;bottom:40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,0.12);border:3px solid rgba(255,255,255,0.25);z-index:200;pointer-events:none;display:none;';
    document.body.appendChild(joystickBase);
    const joystickThumb = document.createElement('div');
    joystickThumb.style.cssText = 'position:absolute;left:50%;top:50%;width:65px;height:65px;border-radius:50%;background:rgba(255,255,255,0.45);border:2px solid rgba(255,255,255,0.6);transform:translate(-50%,-50%);pointer-events:none;';
    joystickBase.appendChild(joystickThumb);

    // === FIRE BUTTON (big, right side bottom) ===
    const shootBtn = document.createElement('div');
    shootBtn.style.cssText = 'position:fixed;right:20px;bottom:30px;width:100px;height:100px;border-radius:50%;background:rgba(255,40,40,0.55);border:4px solid rgba(255,100,100,0.7);z-index:200;display:flex;align-items:center;justify-content:center;font:bold 18px Arial;color:white;text-shadow:1px 1px 3px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    shootBtn.textContent = 'FIRE';
    document.body.appendChild(shootBtn);

    // === ENTER/EXIT CAR BUTTON ===
    const carBtn = document.createElement('div');
    carBtn.style.cssText = 'position:fixed;right:135px;bottom:35px;width:70px;height:70px;border-radius:50%;background:rgba(50,200,50,0.5);border:3px solid rgba(100,255,100,0.6);z-index:200;display:flex;align-items:center;justify-content:center;font:bold 13px Arial;color:white;text-shadow:1px 1px 2px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    carBtn.textContent = 'RIDE';
    this.carBtn = carBtn;
    document.body.appendChild(carBtn);

    // === JUMP BUTTON ===
    const jumpBtn = document.createElement('div');
    jumpBtn.style.cssText = 'position:fixed;right:135px;bottom:115px;width:60px;height:60px;border-radius:50%;background:rgba(50,150,255,0.45);border:2px solid rgba(100,180,255,0.6);z-index:200;display:flex;align-items:center;justify-content:center;font:bold 13px Arial;color:white;text-shadow:1px 1px 2px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    jumpBtn.textContent = 'JUMP';
    document.body.appendChild(jumpBtn);

    // === AUTO-FIRE (hold to rapid fire) ===
    let shootInterval: number | null = null;
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.tryShoot();
      shootInterval = window.setInterval(() => this.tryShoot(), 100); // faster fire rate on mobile
    }, { passive: false });
    shootBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (shootInterval) { clearInterval(shootInterval); shootInterval = null; }
    }, { passive: false });
    shootBtn.addEventListener('touchcancel', () => {
      if (shootInterval) { clearInterval(shootInterval); shootInterval = null; }
    });

    // Car button — enter/exit nearest car
    carBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const evt = new KeyboardEvent('keydown', { code: 'KeyZ' });
      window.dispatchEvent(evt);
    }, { passive: false });

    // === FLOATING JOYSTICK TOUCH HANDLING ===
    const maxR = 75; // joystick travel radius

    el.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.45 && !this.leftTouch) {
          this.leftTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY };
          // Show joystick at touch position
          joystickBase.style.display = 'block';
          joystickBase.style.left = (t.clientX - 75) + 'px';
          joystickBase.style.top = (t.clientY - 75) + 'px';
          joystickBase.style.bottom = 'auto';
          joystickThumb.style.transform = 'translate(-50%, -50%)';
        } else if (t.clientX >= window.innerWidth * 0.45 && !this.rightTouch) {
          this.rightTouch = { id: t.identifier, lastX: t.clientX, lastY: t.clientY };
        }
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.leftTouch && t.identifier === this.leftTouch.id) {
          const dx = t.clientX - this.leftTouch.startX;
          const dy = t.clientY - this.leftTouch.startY;
          const len = Math.sqrt(dx * dx + dy * dy);
          const norm = Math.min(len, maxR) / maxR;
          this.moveDir.x = (dx / (len || 1)) * norm;
          this.moveDir.z = (dy / (len || 1)) * norm;
          // Move joystick thumb (clamped)
          const clampDist = Math.min(len, 55);
          const cx = (dx / (len || 1)) * clampDist;
          const cy = (dy / (len || 1)) * clampDist;
          joystickThumb.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
        }
        if (this.rightTouch && t.identifier === this.rightTouch.id) {
          const dx = t.clientX - this.rightTouch.lastX;
          const dy = t.clientY - this.rightTouch.lastY;
          // Higher sensitivity for mobile look
          this.lookAngle -= dx * 0.008;
          this.lookPitch = Math.max(-1.2, Math.min(1.2, this.lookPitch - dy * 0.006));
          this.rightTouch.lastX = t.clientX;
          this.rightTouch.lastY = t.clientY;
        }
      }
    }, { passive: false });

    el.addEventListener('touchend', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.leftTouch && t.identifier === this.leftTouch.id) {
          this.leftTouch = null;
          this.moveDir.x = 0;
          this.moveDir.z = 0;
          joystickBase.style.display = 'none';
          joystickThumb.style.transform = 'translate(-50%, -50%)';
        }
        if (this.rightTouch && t.identifier === this.rightTouch.id) {
          this.rightTouch = null;
        }
      }
    });

    el.addEventListener('touchcancel', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.leftTouch && t.identifier === this.leftTouch.id) {
          this.leftTouch = null;
          this.moveDir.x = 0;
          this.moveDir.z = 0;
          joystickBase.style.display = 'none';
        }
        if (this.rightTouch && t.identifier === this.rightTouch.id) {
          this.rightTouch = null;
        }
      }
    });

    // Prevent double-tap zoom and pinch zoom on the whole page
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false } as EventListenerOptions);
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false } as EventListenerOptions);
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false } as EventListenerOptions);
  }

  private setupKeyboard(): void {
    const keys: Record<string, boolean> = {};
    window.addEventListener('keydown', (e) => { keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    // Mouse look
    this.threeRenderer.domElement.addEventListener('click', () => {
      this.threeRenderer.domElement.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.threeRenderer.domElement) {
        this.lookAngle -= e.movementX * 0.002;
        this.lookPitch = Math.max(-1.2, Math.min(1.2, this.lookPitch - e.movementY * 0.002));
      }
    });

    // Poll keys each frame
    const origUpdate = this.updatePlayer.bind(this);
    this.updatePlayer = (dt: number) => {
      // WASD
      let kx = 0, kz = 0;
      if (keys['KeyW'] || keys['ArrowUp']) kz = -1;
      if (keys['KeyS'] || keys['ArrowDown']) kz = 1;
      if (keys['KeyA'] || keys['ArrowLeft']) kx = -1;
      if (keys['KeyD'] || keys['ArrowRight']) kx = 1;

      // Xbox controller support
      const gamepads = navigator.getGamepads?.();
      if (gamepads) {
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (!gp) continue;
          // Left stick for looking around
          if (Math.abs(gp.axes[0]) > 0.15) this.lookAngle -= gp.axes[0] * 0.05;
          if (Math.abs(gp.axes[1]) > 0.15) this.lookPitch = Math.max(-1, Math.min(0.6, this.lookPitch - gp.axes[1] * 0.03));
          // Right stick for movement
          if (Math.abs(gp.axes[2]) > 0.15) kx = gp.axes[2];
          if (Math.abs(gp.axes[3]) > 0.15) kz = gp.axes[3];
          // R2 trigger (button 7) for forward
          if (gp.buttons[7] && gp.buttons[7].value > 0.1) kz = -gp.buttons[7].value;
          // L2 trigger (button 6) to stop
          if (gp.buttons[6] && gp.buttons[6].value > 0.1) { kx = 0; kz = 0; }
          // A button (button 0) to shoot
          if (gp.buttons[0]?.pressed) this.tryShoot();
          // Y button (button 3) for car toggle
          if (gp.buttons[3]?.pressed && !(gp as any)._prevY) this.toggleCar();
          (gp as any)._prevY = gp.buttons[3]?.pressed;
          break; // use first connected controller
        }
      }

      if (kx !== 0 || kz !== 0) {
        const len = Math.sqrt(kx * kx + kz * kz);
        this.moveDir.x = kx / len;
        this.moveDir.z = kz / len;
      } else if (!this.leftTouch) {
        this.moveDir.x = 0;
        this.moveDir.z = 0;
      }
      if (keys['KeyQ']) this.tryShoot();
      if (keys['KeyE']) {
        keys['KeyE'] = false; // one-shot
      }
      if (keys['KeyZ'] || keys['KeyC']) {
        keys['KeyZ'] = false;
        keys['KeyC'] = false;
        this.toggleCar();
      }
      if (keys['KeyR']) {
        keys['KeyR'] = false; // one-shot
      }
      origUpdate(dt);
    };
  }

  private toggleCar(): void {
    if (this.playerInCar >= 0) {
      // Exit car
      const car = this.cars[this.playerInCar];
      car.driver = 'none';
      car.vx = 0;
      car.vz = 0;
      this.playerInCar = -1;
      this.playerModel.visible = true;
      // Step out to the side
      this.playerPos.x += Math.cos(this.lookAngle) * 3;
      this.playerPos.z -= Math.sin(this.lookAngle) * 3;
      this.showPickupMsg('Exited car');
    } else {
      // Find nearest empty car
      let bestIdx = -1, bestDist = 12; // must be within 12 units
      for (let i = 0; i < this.cars.length; i++) {
        if (this.cars[i].driver !== 'none') continue;
        const dx = this.playerPos.x - this.cars[i].mesh.position.x;
        const dz = this.playerPos.z - this.cars[i].mesh.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        this.cars[bestIdx].driver = 'player';
        this.playerInCar = bestIdx;
        this.playerModel.visible = true;
        this.showPickupMsg('Riding T-Rex! Tap again to dismount');
      }
    }
  }

  private tryShoot(): void {
    if (this.shootCooldown > 0) return;
    if (this.playerGun === 'None') return;

    // Find weapon stats by name
    const wep = Object.values(WEAPONS).find(w => w.name === this.playerGun);
    const damage = wep ? wep.damage : 1;
    const cooldown = wep ? wep.cooldown : 500;
    const bulletSpeed = 80;

    this.shootCooldown = cooldown / 1000; // convert ms to seconds

    // Bullet direction from look angle + pitch
    const dx = -Math.sin(this.lookAngle) * Math.cos(this.lookPitch);
    const dy = Math.sin(this.lookPitch);
    const dz = -Math.cos(this.lookAngle) * Math.cos(this.lookPitch);

    // Spawn bullet slightly in front of player
    const spawnDist = 1.5;
    const terrainY = this.getTerrainHeight(this.playerPos.x, this.playerPos.z);
    const bx = this.playerPos.x + dx * spawnDist;
    const by = terrainY + 1.5 + dy * spawnDist;
    const bz = this.playerPos.z + dz * spawnDist;

    const geo = new THREE.SphereGeometry(0.15, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffaa00, emissiveIntensity: 2.0, roughness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx, by, bz);
    this.scene3d.add(mesh);

    const flash = new THREE.PointLight(0xffaa44, 3, 8);
    flash.position.set(bx, by, bz);
    this.scene3d.add(flash);
    setTimeout(() => this.scene3d.remove(flash), 80);

    this.bullets.push({
      mesh,
      vx: dx * bulletSpeed,
      vy: dy * bulletSpeed,
      vz: dz * bulletSpeed,
      life: 2, // seconds before despawn
      damage,
      owner: -1, // player
    });
    this.playSfx('shoot', 0.4);

    // Broadcast shot to other players
    if (this.isMultiplayer) {
      this.network.send({
        type: 'SHOOT',
        playerId: this.network.playerId,
        x: bx, y: by, z: bz,
        vx: dx * bulletSpeed,
        vy: dy * bulletSpeed,
        vz: dz * bulletSpeed,
        damage,
      });
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.life -= dt;

      let hit = false;

      // Check hit against local player (NPC bullets only; remote damage comes via PLAYER_HIT message)
      if (b.owner >= 0) {
        const dx = b.mesh.position.x - this.playerPos.x;
        const dy = b.mesh.position.y - (this.playerPos.y + 1);
        const dz = b.mesh.position.z - this.playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1.0) {
          this.playerHP = Math.max(0, this.playerHP - 5);
          this.playSfx('hurt', 0.5);
          hit = true;
          this.hpText.textContent = `HP: ${this.playerHP}`;
          if (this.playerHP <= 0) {
            this.showGameOver('SHOT BY AN ENEMY');
          }
        }
      }

      // Check hit against all NPCs (skip the shooter)
      if (!hit) {
        for (let n = 0; n < this.npcs.length; n++) {
          const npc = this.npcs[n];
          if (npc.dead || n === b.owner) continue;
          const dx = b.mesh.position.x - npc.mesh.position.x;
          const dz = b.mesh.position.z - npc.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 1.0) {
            npc.hp -= 1;
            this.playSfx('hit', 0.3);
            hit = true;
            if (npc.hp <= 0) {
              npc.dead = true;
              this.coinsEarned += 1000;
              this.showPickupMsg('+1000 coins!');
              this.spawnDeathFluff(npc.mesh.position.clone());
              this.scene3d.remove(npc.mesh);
            }
            break;
          }
        }
      }

      // Check hit against remote players (only local player's bullets)
      if (!hit && this.isMultiplayer && b.owner === -1) {
        for (const [pid, rp] of this.remotePlayers) {
          if (rp.dead) continue;
          const dx = b.mesh.position.x - rp.model.position.x;
          const dz = b.mesh.position.z - rp.model.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 1.2) {
            hit = true;
            this.playSfx('hit', 0.3);
            // Tell the other player they got hit
            this.network.send({ type: 'PLAYER_HIT', targetId: pid, damage: b.damage });
            break;
          }
        }
      }

      // Check hit against bear boss
      if (!hit && !this.bossDead && this.bossSpawned && this.boss) {
        const bx = b.mesh.position.x - this.boss.position.x;
        const by = b.mesh.position.y - (this.boss.position.y + 3);
        const bz = b.mesh.position.z - this.boss.position.z;
        const bdist = Math.sqrt(bx * bx + by * by + bz * bz);
        if (bdist < 5) {
          this.bossHP -= 10;
          hit = true;
          this.bossRoarTimer = 0.8; // trigger roar
          this.playSfx('roar', 0.7);
          if (this.bossHP <= 0) {
            this.bossDead = true;
            this.coinsEarned += 1000;
            this.spawnDeathFluff(this.boss.position.clone(), 40);
            this.scene3d.remove(this.boss);
            this.playSfx('bossDeath', 0.8);
            setTimeout(() => this.showVictory(), 1500);
          }
        }
      }

      if (hit || b.life <= 0) {
        this.scene3d.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  private updatePlayer(dt: number): void {
    // Freeze player during T-Rex eat animation
    if (this.trexEatAnim.active) return;
    const speed = 20;
    const forward = new THREE.Vector3(
      -Math.sin(this.lookAngle),
      0,
      -Math.cos(this.lookAngle)
    );
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    const move = new THREE.Vector3()
      .addScaledVector(right, this.moveDir.x)
      .addScaledVector(forward, -this.moveDir.z);

    const isMoving = move.length() > 0.01;
    if (isMoving) {
      move.normalize().multiplyScalar(speed * dt);
      this.playerPos.add(move);
    }

    // Footstep sounds
    if (isMoving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.playSfx('step', 0.2);
        this.footstepTimer = 0.35;
      }
    }

    // Collision — push out of solid objects
    const playerR = 0.4;
    for (const c of this.colliders) {
      const dx = this.playerPos.x - c.x;
      const dz = this.playerPos.z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = playerR + c.r;
      if (dist < minDist && dist > 0.001) {
        const push = (minDist - dist) / dist;
        this.playerPos.x += dx * push;
        this.playerPos.z += dz * push;
      }
    }

    // Also collide with NPCs
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const dx = this.playerPos.x - npc.mesh.position.x;
      const dz = this.playerPos.z - npc.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = playerR + 0.4;
      if (dist < minDist && dist > 0.001) {
        const push = (minDist - dist) / dist;
        this.playerPos.x += dx * push;
        this.playerPos.z += dz * push;
      }
    }

    // Clamp to world bounds (square)
    this.playerPos.x = Math.max(-490, Math.min(490, this.playerPos.x));
    this.playerPos.z = Math.max(-490, Math.min(490, this.playerPos.z));

    // Update player model position and facing — follow terrain or climb tower
    let terrainY = this.getTerrainHeight(this.playerPos.x, this.playerPos.z);

    // Eiffel Tower climbing — walk along legs + snap to platforms
    const towerScale = 0.5;
    const towerBaseSpread = 15 * towerScale;
    const distFromCenter = Math.sqrt(this.playerPos.x ** 2 + this.playerPos.z ** 2);

    // Platform definitions (height, walkable radius) — scaled
    const platforms = [
      { y: 25 * towerScale, r: 10 * towerScale },  // First floor — wide walkable area
      { y: 48 * towerScale, r: 7 * towerScale },   // Second floor
      { y: 68 * towerScale, r: 4 * towerScale },   // Top platform
    ];

    if (distFromCenter < towerBaseSpread + 2) {
      const maxClimbH = 68 * towerScale;
      const ratio = Math.max(0.001, distFromCenter / (15 * towerScale));

      // Calculate leg height at this distance
      let legY = terrainY;
      if (ratio < 1) {
        const t = Math.min(1, -Math.log(ratio) / 2.8);
        legY = t * maxClimbH;
      }

      // Check platforms from highest to lowest — snap if within radius
      // The player stays on a platform as long as they're within its radius
      // and their climbing height has reached it
      let onPlatform = false;
      for (let pi = platforms.length - 1; pi >= 0; pi--) {
        const plat = platforms[pi];
        if (distFromCenter < plat.r && legY >= plat.y - 2) {
          terrainY = Math.max(terrainY, plat.y);
          onPlatform = true;
          break;
        }
      }

      // If not on platform, follow the leg curve (climbing)
      if (!onPlatform && legY > terrainY && legY < maxClimbH + 5) {
        terrainY = Math.max(terrainY, legY);
      }
    }

    this.playerModel.position.set(this.playerPos.x, terrainY, this.playerPos.z);
    // Player always faces camera direction (like Fortnite)
    this.playerModel.rotation.y = this.lookAngle + Math.PI;

    // === PLAYER ANIMATION (same as NPCs) ===
    const targetSpeed = isMoving ? speed : 0;
    this.playerSpeed += (targetSpeed - this.playerSpeed) * Math.min(dt * 8, 1);
    const spd = this.playerSpeed;
    const runBlend = Math.min(spd / 3, 1);
    const sprintBlend = Math.max(0, (spd - 3) / 2);

    this.playerPhase += dt * (8 + spd * 1.6);
    const p = this.playerPhase;
    const sinP = Math.sin(p);
    const cosP = Math.cos(p);
    const t = this.clock.elapsedTime;

    // Hips
    const hipBob = isMoving ? Math.abs(sinP) * 0.04 * runBlend : 0;
    this.pHips.position.y = 0.95 + hipBob;
    this.pHips.rotation.z = 0;
    this.pHips.rotation.y = 0;

    // Torso — slight lean forward when running
    this.pTorso.rotation.x = isMoving ? 0.06 * runBlend : 0;
    this.pTorso.rotation.y = 0;

    // Head
    this.pHead.rotation.x = 0;

    // Legs — fast pumping run cycle
    const legSwing = 0.8 * runBlend;
    this.pLeftThigh.rotation.x = isMoving ? sinP * legSwing : 0;
    this.pLeftShin.rotation.x = isMoving ? Math.max(0, sinP) * 1.0 * runBlend : 0;
    this.pRightThigh.rotation.x = isMoving ? -sinP * legSwing : 0;
    this.pRightShin.rotation.x = isMoving ? Math.max(0, -sinP) * 1.0 * runBlend : 0;

    // Arms — big pumping swings
    const armSwing = 0.7 * runBlend;
    this.pLeftUpperArm.rotation.x = isMoving ? sinP * armSwing : 0;
    this.pLeftUpperArm.rotation.z = 0;
    this.pLeftForearm.rotation.x = isMoving ? -0.7 * runBlend : 0;
    this.pRightUpperArm.rotation.x = isMoving ? -sinP * armSwing : 0;
    this.pRightUpperArm.rotation.z = 0;
    this.pRightForearm.rotation.x = isMoving ? -0.7 * runBlend : 0;

    // === THIRD PERSON CAMERA ===
    // Intro: camera faces the player from the front
    if (this.introCamera) {
      this.introCameraTimer += dt;
      if (isMoving) {
        this.introCamera = false; // transition to behind on first move
      }
    }

    const onTRex = this.playerInCar >= 0;

    if (this.introCamera) {
      // Front-facing camera — shows your character's face
      const frontDist = 3.5;
      const frontHeight = 1.8;
      const frontX = this.playerPos.x - Math.sin(this.lookAngle) * frontDist;
      const frontZ = this.playerPos.z - Math.cos(this.lookAngle) * frontDist;
      const frontY = terrainY + frontHeight;

      this.camera.position.x += (frontX - this.camera.position.x) * Math.min(dt * 5, 1);
      this.camera.position.z += (frontZ - this.camera.position.z) * Math.min(dt * 5, 1);
      this.camera.position.y += (frontY - this.camera.position.y) * Math.min(dt * 5, 1);

      const lookTarget = new THREE.Vector3(this.playerPos.x, terrainY + 1.2, this.playerPos.z);
      this.camera.lookAt(lookTarget);
    } else {
      // Normal behind camera
      const camDist = onTRex ? 25 : 5;
      const camHeight = onTRex ? 16 : 2.5;
      const camOffsetX = onTRex ? 2 : 1;

      const behindX = this.playerPos.x + Math.sin(this.lookAngle) * camDist + Math.cos(this.lookAngle) * camOffsetX;
      const behindZ = this.playerPos.z + Math.cos(this.lookAngle) * camDist - Math.sin(this.lookAngle) * camOffsetX;
      const camTerrainY = this.getTerrainHeight(behindX, behindZ);
      const camY = Math.max(terrainY, camTerrainY) + camHeight + Math.sin(this.lookPitch) * 8;

      this.camera.position.x += (behindX - this.camera.position.x) * Math.min(dt * 10, 1);
      this.camera.position.z += (behindZ - this.camera.position.z) * Math.min(dt * 10, 1);
      this.camera.position.y += (camY - this.camera.position.y) * Math.min(dt * 10, 1);

      const lookTarget = new THREE.Vector3(
        this.playerPos.x - Math.sin(this.lookAngle) * 2,
        terrainY + 1.5 + this.lookPitch * 6,
        this.playerPos.z - Math.cos(this.lookAngle) * 2
      );
      this.camera.lookAt(lookTarget);
    }
  }

  private updateNPCs(dt: number): void {
    for (const npc of this.npcs) {
      if (npc.dead) continue;

      const npcIdx = this.npcs.indexOf(npc);
      const aggroRange = 30;
      const shootRange = 18;

      // Find nearest target — prefer other NPCs over player
      let targetX = 0, targetY = 0, targetZ = 0;
      let targetDist = 99999;
      let targetIsPlayer = false;

      // First check other NPCs
      for (let j = 0; j < this.npcs.length; j++) {
        if (j === npcIdx || this.npcs[j].dead) continue;
        const other = this.npcs[j];
        const odx = other.mesh.position.x - npc.mesh.position.x;
        const odz = other.mesh.position.z - npc.mesh.position.z;
        const odist = Math.sqrt(odx * odx + odz * odz);
        if (odist < targetDist) {
          targetDist = odist;
          targetX = other.mesh.position.x;
          targetY = other.mesh.position.y + 1;
          targetZ = other.mesh.position.z;
        }
      }

      // Only target player if no NPCs nearby or player is very close
      const dxP = this.playerPos.x - npc.mesh.position.x;
      const dzP = this.playerPos.z - npc.mesh.position.z;
      const distP = Math.sqrt(dxP * dxP + dzP * dzP);
      if (targetDist > 50 && distP < 20) {
        // No NPCs in range but player is close
        targetDist = distP;
        targetX = this.playerPos.x;
        targetY = this.playerPos.y + 1;
        targetZ = this.playerPos.z;
        targetIsPlayer = true;
      }

      if (targetDist < aggroRange) {
        // Chase target
        const chaseSpeed = 4;
        const tdx = targetX - npc.mesh.position.x;
        const tdz = targetZ - npc.mesh.position.z;
        const tlen = Math.sqrt(tdx * tdx + tdz * tdz);
        if (tlen > 0.1) {
          npc.vx = (tdx / tlen) * chaseSpeed;
          npc.vz = (tdz / tlen) * chaseSpeed;
        }

        // Shoot at target when in range
        if (targetDist < shootRange) {
          npc.timer -= dt;
          if (npc.timer <= 0) {
            npc.timer = 0.8 + Math.random() * 0.5;
            const bx = npc.mesh.position.x;
            const bz = npc.mesh.position.z;
            const by = npc.mesh.position.y + 1.5;
            const bulletSpeed = 30;
            const pdx = targetX - bx;
            const pdy = targetY - by;
            const pdz = targetZ - bz;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
            const bulletGeo = new THREE.SphereGeometry(0.08, 4, 4);
            const bulletMat = new THREE.MeshStandardMaterial({
              color: targetIsPlayer ? 0xff4400 : 0xff8800,
              emissive: targetIsPlayer ? 0xff2200 : 0xff6600,
              emissiveIntensity: 1.5,
            });
            const bullet = new THREE.Mesh(bulletGeo, bulletMat);
            bullet.position.set(bx, by, bz);
            this.scene3d.add(bullet);
            this.bullets.push({
              mesh: bullet,
              vx: (pdx / pdist) * bulletSpeed,
              vy: (pdy / pdist) * bulletSpeed,
              vz: (pdz / pdist) * bulletSpeed,
              life: 3,
              damage: 1,
              owner: npcIdx,
            });
          }
        }
      } else {
        // Normal wandering behavior
        npc.timer -= dt;
        if (npc.timer <= 0) {
          const r = Math.random();
          if (r < 0.2) {
            npc.vx = 0; npc.vz = 0;
          } else if (r < 0.7) {
            npc.vx = (Math.random() - 0.5) * 2.5;
            npc.vz = (Math.random() - 0.5) * 2.5;
          } else {
            npc.vx = (Math.random() - 0.5) * 5;
            npc.vz = (Math.random() - 0.5) * 5;
          }
          npc.timer = 2 + Math.random() * 4;
        }
      }

      npc.mesh.position.x += npc.vx * dt;
      npc.mesh.position.z += npc.vz * dt;
      npc.mesh.position.y = this.getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z);

      if (Math.abs(npc.mesh.position.x) > 450) npc.vx *= -1;
      if (Math.abs(npc.mesh.position.z) > 450) npc.vz *= -1;

      // Smooth face movement direction
      const targetSpeed = Math.sqrt(npc.vx * npc.vx + npc.vz * npc.vz);
      npc.speed += (targetSpeed - npc.speed) * Math.min(dt * 8, 1);

      if (targetSpeed > 0.1) {
        const targetAngle = Math.atan2(npc.vx, npc.vz);
        let diff = targetAngle - npc.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.mesh.rotation.y += diff * Math.min(dt * 10, 1);
      }

      // === FORTNITE-STYLE SKELETAL ANIMATION ===
      const spd = npc.speed;
      const isMoving = spd > 0.3;
      const runBlend = Math.min(spd / 3, 1); // 0=idle, 1=full run
      const sprintBlend = Math.max(0, (spd - 3) / 2); // extra intensity for sprinting

      // Advance animation phase based on speed
      npc.phase += dt * (6 + spd * 2.5);
      const p = npc.phase;
      const sinP = Math.sin(p);
      const cosP = Math.cos(p);

      // --- HIPS ---
      // Vertical bob (more when running)
      const hipBob = isMoving ? Math.abs(sinP) * 0.06 * runBlend : 0;
      npc.hips.position.y = 0.95 + hipBob + Math.sin(this.clock.elapsedTime * 1.5 + npc.phase) * 0.008; // idle breathe
      // Hip sway side to side
      npc.hips.rotation.z = isMoving ? sinP * 0.03 * runBlend : Math.sin(this.clock.elapsedTime * 0.8) * 0.01;
      // Hip twist (pelvis rotation)
      npc.hips.rotation.y = isMoving ? sinP * 0.08 * runBlend : 0;

      // --- TORSO ---
      // Forward lean when running, slight counter-twist
      npc.torso.rotation.x = runBlend * (0.08 + sprintBlend * 0.06);
      npc.torso.rotation.y = isMoving ? -sinP * 0.06 * runBlend : 0; // counter hip twist
      // Slight torso sway
      npc.torso.rotation.z = isMoving ? -sinP * 0.02 * runBlend : Math.sin(this.clock.elapsedTime * 0.6) * 0.005;

      // --- HEAD ---
      // Head stays mostly level, slight bob
      npc.head.rotation.x = isMoving ? -runBlend * 0.05 + cosP * 0.02 * runBlend : Math.sin(this.clock.elapsedTime * 0.7) * 0.015;
      npc.head.rotation.y = isMoving ? sinP * 0.03 * runBlend : Math.sin(this.clock.elapsedTime * 0.4) * 0.02;

      // --- LEGS (Fortnite style: big stride, knee bend on back leg) ---
      const legSwing = 0.6 + sprintBlend * 0.3; // max angle
      const kneeMax = 0.8 + sprintBlend * 0.4;

      // Left leg
      const leftLegAngle = sinP * legSwing * runBlend;
      npc.leftThigh.rotation.x = isMoving ? leftLegAngle : 0;
      // Knee bends when leg is behind (angle > 0 = behind)
      const leftKnee = isMoving ? Math.max(0, sinP) * kneeMax * runBlend : 0;
      npc.leftShin.rotation.x = leftKnee;

      // Right leg (opposite phase)
      const rightLegAngle = -sinP * legSwing * runBlend;
      npc.rightThigh.rotation.x = isMoving ? rightLegAngle : 0;
      const rightKnee = isMoving ? Math.max(0, -sinP) * kneeMax * runBlend : 0;
      npc.rightShin.rotation.x = rightKnee;

      // --- ARMS (pump opposite to legs, elbows bend) ---
      const armSwing = 0.5 + sprintBlend * 0.35;
      const elbowBend = 0.6 + sprintBlend * 0.3;

      // Left arm (swings with right leg)
      npc.leftUpperArm.rotation.x = isMoving ? -sinP * armSwing * runBlend : Math.sin(this.clock.elapsedTime * 0.5) * 0.02;
      npc.leftForearm.rotation.x = isMoving ? -elbowBend * runBlend - Math.abs(sinP) * 0.3 * runBlend : -0.05;

      // Right arm (swings with left leg) — holds weapon so less swing
      const weaponDamp = 0.6; // reduce swing since holding gun
      npc.rightUpperArm.rotation.x = isMoving ? sinP * armSwing * runBlend * weaponDamp : Math.sin(this.clock.elapsedTime * 0.5 + 1) * 0.02;
      npc.rightForearm.rotation.x = isMoving
        ? -elbowBend * 0.8 * runBlend - Math.abs(cosP) * 0.2 * runBlend
        : -0.3; // resting weapon hold
    }
  }

  private showGameOver(cause = 'ELIMINATED'): void {
    // Stop the game loop
    cancelAnimationFrame(this.animFrameId);
    if (document.pointerLockElement) document.exitPointerLock();

    // Persist coins
    const totalCoins = addCoins(this.coinsEarned);
    const coinHtml = this.coinsEarned > 0
      ? `<div style="color:#ffdd00;font:bold 32px Arial;text-shadow:0 0 10px #ffaa00;margin-bottom:8px">+${this.coinsEarned} coins!</div>
         <div style="color:#ffdd00;font:16px Arial;margin-bottom:30px">Total: ${totalCoins} coins</div>`
      : `<div style="color:#ffdd00;font:16px Arial;margin-bottom:30px">Total: ${totalCoins} coins</div>`;

    // Game over overlay
    const overlay = document.createElement('div');
    overlay.id = 'game-over';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div style="color:#ff2222;font:bold 72px Arial;text-shadow:0 0 20px #ff0000,0 0 40px #aa0000;margin-bottom:20px">GAME OVER</div>
      <div style="color:#cccccc;font:24px Arial;margin-bottom:20px">${cause}</div>
      ${coinHtml}
      <button id="go-retry" style="padding:15px 40px;background:#cc0000;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">PLAY AGAIN</button>
      <button id="go-quit" style="padding:15px 40px;background:#444;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">QUIT</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('go-retry')!.addEventListener('click', () => {
      overlay.remove();
      this.shutdown();
      this.scene.restart();
    });
    document.getElementById('go-quit')!.addEventListener('click', () => {
      overlay.remove();
      this.shutdown();
      this.scene.start('TitleScene');
    });
  }

  private showVictory(): void {
    cancelAnimationFrame(this.animFrameId);
    if (document.pointerLockElement) document.exitPointerLock();

    // Award bonus for winning
    this.coinsEarned += 1000;
    const totalCoins = addCoins(this.coinsEarned);

    const overlay = document.createElement('div');
    overlay.id = 'game-over';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div style="color:#44ff44;font:bold 72px Arial;text-shadow:0 0 20px #00ff00,0 0 40px #00aa00;margin-bottom:20px">VICTORY!</div>
      <div style="color:#cccccc;font:24px Arial;margin-bottom:20px">You defeated the bear!</div>
      <div style="color:#ffdd00;font:bold 32px Arial;text-shadow:0 0 10px #ffaa00;margin-bottom:8px">+${this.coinsEarned} coins!</div>
      <div style="color:#ffdd00;font:16px Arial;margin-bottom:30px">Total: ${totalCoins} coins</div>
      <button id="go-retry" style="padding:15px 40px;background:#44aa44;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">PLAY AGAIN</button>
      <button id="go-quit" style="padding:15px 40px;background:#444;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">QUIT</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('go-retry')!.addEventListener('click', () => {
      overlay.remove();
      this.shutdown();
      this.scene.restart();
    });
    document.getElementById('go-quit')!.addEventListener('click', () => {
      overlay.remove();
      this.shutdown();
      this.scene.start('TitleScene');
    });
  }

  private showPickupMsg(text: string): void {
    this.pickupMsg.textContent = text;
    this.pickupMsg.style.opacity = '1';
    setTimeout(() => { this.pickupMsg.style.opacity = '0'; }, 1500);
  }

  // ===== AUDIO SYSTEM =====
  private bakeSounds(): void {
    this.audioCtx = new AudioContext();
    const sr = this.audioCtx.sampleRate;

    const make = (dur: number, fn: (i: number, t: number) => number): AudioBuffer => {
      const len = Math.floor(sr * dur);
      const buf = this.audioCtx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        d[i] = Math.max(-1, Math.min(1, fn(i, t)));
      }
      return buf;
    };

    // Gunshot — sharp crack with decay
    this.sfx.shoot = make(0.3, (_i, t) => {
      const crack = Math.random() * 2 - 1;
      const boom = Math.sin(t * 400) * Math.exp(-t * 20);
      const snap = Math.sin(t * 2000) * Math.exp(-t * 60);
      return (crack * 0.3 + boom * 0.5 + snap * 0.4) * Math.exp(-t * 8);
    });

    // Bullet hit — thud
    this.sfx.hit = make(0.15, (_i, t) => {
      return (Math.random() * 0.4 + Math.sin(t * 300) * 0.6) * Math.exp(-t * 25);
    });

    // Footstep — crunchy step
    this.sfx.step = make(0.1, (_i, t) => {
      return (Math.random() * 0.6 + Math.sin(t * 150) * 0.3) * Math.exp(-t * 30);
    });

    // Car engine — low rumble loop
    this.sfx.engine = make(0.5, (_i, t) => {
      return (Math.sin(t * 80) * 0.4 + Math.sin(t * 160) * 0.2 + Math.random() * 0.15) *
        (0.5 + Math.sin(t * 8) * 0.3);
    });

    // Car hit — heavy impact
    this.sfx.carHit = make(0.4, (_i, t) => {
      const impact = Math.sin(t * 200) * Math.exp(-t * 12);
      const crunch = Math.random() * Math.exp(-t * 8);
      const metal = Math.sin(t * 800) * Math.exp(-t * 20);
      return impact * 0.5 + crunch * 0.4 + metal * 0.3;
    });

    // Bear roar — deep growl with harmonics
    this.sfx.roar = make(0.8, (_i, t) => {
      const growl = Math.sin(t * 120) * 0.5 + Math.sin(t * 180) * 0.3 + Math.sin(t * 60) * 0.4;
      const rumble = Math.random() * 0.2;
      const env = Math.sin(t * Math.PI / 0.8) * Math.min(t * 10, 1);
      return (growl + rumble) * env;
    });

    // Water splash
    this.sfx.splash = make(0.5, (_i, t) => {
      const splash = Math.random() * Math.exp(-t * 6);
      const bubble = Math.sin(t * 600 * Math.exp(-t * 3)) * Math.exp(-t * 8) * 0.3;
      return splash * 0.7 + bubble;
    });

    // Pickup ding
    this.sfx.pickup = make(0.3, (_i, t) => {
      return (Math.sin(t * 880) * 0.4 + Math.sin(t * 1320) * 0.3) * Math.exp(-t * 6);
    });

    // Player hurt
    this.sfx.hurt = make(0.25, (_i, t) => {
      return (Math.sin(t * 250 + Math.sin(t * 40) * 3) * 0.5 + Math.random() * 0.2) * Math.exp(-t * 10);
    });

    // Drown — gurgling
    this.sfx.drown = make(0.6, (_i, t) => {
      const gurgle = Math.sin(t * 300 + Math.sin(t * 15) * 8) * 0.4;
      const bubbles = Math.sin(t * 800 * (1 + Math.sin(t * 5))) * Math.random() * 0.3;
      return (gurgle + bubbles) * Math.exp(-t * 3);
    });

    // Boss death — big explosion
    this.sfx.bossDeath = make(1.0, (_i, t) => {
      const boom = Math.sin(t * 60) * Math.exp(-t * 3);
      const crack = Math.random() * Math.exp(-t * 2);
      const ring = Math.sin(t * 400) * Math.exp(-t * 5) * 0.3;
      return (boom * 0.6 + crack * 0.4 + ring) * Math.min(t * 20, 1);
    });

    // Win fanfare
    this.sfx.win = make(1.0, (_i, t) => {
      const n1 = Math.sin(t * 523) * (t < 0.25 ? 1 : 0);
      const n2 = Math.sin(t * 659) * (t >= 0.25 && t < 0.5 ? 1 : 0);
      const n3 = Math.sin(t * 784) * (t >= 0.5 && t < 0.75 ? 1 : 0);
      const n4 = Math.sin(t * 1047) * (t >= 0.75 ? 1 : 0);
      return (n1 + n2 + n3 + n4) * 0.4 * Math.exp(-(t % 0.25) * 4);
    });

    // Swim — water swoosh
    this.sfx.swim = make(0.3, (_i, t) => {
      return (Math.random() * 0.3 + Math.sin(t * 200 + Math.sin(t * 8) * 5) * 0.2) * Math.exp(-t * 5);
    });
  }

  /** Spawn black fluff particles at position that travel to map center (0,0,0) and vanish */
  private spawnDeathFluff(pos: THREE.Vector3, count = 20): void {
    const fluffMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 });
    const fluffGeo = new THREE.SphereGeometry(0.15, 5, 5);
    const particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(fluffGeo, fluffMat.clone());
      // Scatter around death position
      m.position.set(
        pos.x + (Math.random() - 0.5) * 1.5,
        pos.y + Math.random() * 2 + 0.5,
        pos.z + (Math.random() - 0.5) * 1.5,
      );
      m.scale.setScalar(0.5 + Math.random() * 0.8);
      this.scene3d.add(m);
      particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const duration = 1.5; // seconds to reach center
    let elapsed = 0;
    const animate = () => {
      elapsed += 0.016;
      const t = Math.min(1, elapsed / duration);

      for (const p of particles) {
        // Lerp toward center (0, 0.5, 0) with some random wobble
        p.mesh.position.x += (0 - p.mesh.position.x) * 0.04;
        p.mesh.position.y += (0.5 - p.mesh.position.y) * 0.04;
        p.mesh.position.z += (0 - p.mesh.position.z) * 0.04;
        // Wobble
        p.mesh.position.x += Math.sin(elapsed * 8 + p.life) * 0.02;
        p.mesh.position.y += Math.cos(elapsed * 6 + p.life * 2) * 0.015;
        // Fade out in last 30%
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        if (t > 0.7) {
          mat.opacity = 1 - (t - 0.7) / 0.3;
        }
        // Shrink as approaching center
        p.mesh.scale.setScalar((1 - t * 0.8) * (0.5 + Math.random() * 0.1));
        p.life += 0.016;
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Clean up
        for (const p of particles) {
          this.scene3d.remove(p.mesh);
          (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        }
        fluffGeo.dispose();
      }
    };
    animate();
  }

  private playSfx(name: string, volume = 0.5): void {
    if (!this.audioCtx || !this.sfx[name]) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const src = this.audioCtx.createBufferSource();
    src.buffer = this.sfx[name];
    const gain = this.audioCtx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.audioCtx.destination);
    src.start();
  }

  private checkPickups(): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const pickRange = 2;

    // Guns
    for (const gun of this.gunPickups) {
      if (gun.picked) continue;
      const dx = gun.group.position.x - px;
      const dz = gun.group.position.z - pz;
      if (dx * dx + dz * dz < pickRange * pickRange) {
        gun.picked = true;
        this.scene3d.remove(gun.group);
        this.playerGun = gun.name;
        this.gunText.textContent = 'Gun: ' + gun.name;
        this.gunText.style.color = '#' + gun.color.toString(16).padStart(6, '0');
        this.showPickupMsg('Picked up ' + gun.name + '!');
        this.playSfx('pickup', 0.5);
      }
    }

    // Cheese
    for (const ch of this.cheesePickups) {
      if (ch.picked) continue;
      const dx = ch.group.position.x - px;
      const dz = ch.group.position.z - pz;
      if (dx * dx + dz * dz < pickRange * pickRange) {
        ch.picked = true;
        this.scene3d.remove(ch.group);
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + 25);
        this.hpText.textContent = 'HP: ' + this.playerHP;
        if (this.playerHP >= this.playerMaxHP * 0.75) this.hpText.style.color = '#44ff44';
        else if (this.playerHP >= this.playerMaxHP * 0.4) this.hpText.style.color = '#ffcc00';
        else this.hpText.style.color = '#ff4444';
        this.showPickupMsg('+25 HP from pizza!');
        this.playSfx('pickup', 0.5);
      }
    }
  }

  private createHUD(): void {
    const hud = document.createElement('div');
    hud.id = 'hud-3d';
    hud.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000;font-family:Arial,sans-serif';
    const mob = 'ontouchstart' in window;
    const chSize = mob ? 36 : 24;
    const chW = mob ? 3 : 2;
    hud.innerHTML = `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
        <div style="width:${chSize}px;height:${chW}px;background:rgba(255,255,255,0.7);position:absolute;left:-${chSize/2}px;top:-${chW/2}px;border-radius:1px"></div>
        <div style="width:${chW}px;height:${chSize}px;background:rgba(255,255,255,0.7);position:absolute;left:-${chW/2}px;top:-${chSize/2}px;border-radius:1px"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:rgba(255,50,50,0.8);position:absolute;left:-3px;top:-3px"></div>
      </div>
      <div id="hud-hp" style="position:absolute;top:${mob?'env(safe-area-inset-top, 10px)':'15px'};left:15px;color:#44ff44;font:bold ${mob?22:26}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none">
        HP: 100
      </div>
      <div id="hud-gun" style="position:absolute;top:${mob?'calc(env(safe-area-inset-top, 10px) + 28px)':'48px'};left:15px;color:#ffcc00;font:bold ${mob?16:20}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none">
        Gun: None
      </div>
      <div id="hud-alive" style="position:absolute;top:${mob?'calc(env(safe-area-inset-top, 10px) + 52px)':'76px'};left:15px;color:#ff8844;font:bold ${mob?16:20}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none">
        Alive: 20
      </div>
      <div id="hud-pickup" style="position:absolute;top:35%;left:50%;transform:translate(-50%,0);color:#ffffff;font:bold ${mob?20:22}px Arial;text-shadow:2px 2px 6px black;opacity:0;transition:opacity 0.3s;-webkit-user-select:none">
      </div>
      <button id="hud-quit" style="position:absolute;top:${mob?'env(safe-area-inset-top, 10px)':'15px'};right:15px;padding:${mob?'8px 16px':'10px 22px'};background:rgba(200,0,0,0.7);color:white;border:2px solid white;border-radius:8px;font:bold ${mob?14:18}px Arial;cursor:pointer;z-index:100;-webkit-user-select:none;pointer-events:auto">QUIT</button>
    `;
    document.body.appendChild(hud);
    this.hudDiv = hud;
    this.hpText = document.getElementById('hud-hp') as HTMLDivElement;
    this.gunText = document.getElementById('hud-gun') as HTMLDivElement;
    this.aliveText = document.getElementById('hud-alive') as HTMLDivElement;
    this.pickupMsg = document.getElementById('hud-pickup') as HTMLDivElement;
    const quitBtn = document.getElementById('hud-quit')!;
    quitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.shutdown();
      this.scene.start('TitleScene');
    });
    // Also listen for Escape to exit pointer lock so user can click quit
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        quitBtn.style.pointerEvents = 'auto';
      }
    });
  }

  update(): void {
    // Phaser update not used — Three.js has its own loop
  }

  shutdown(): void {
    cancelAnimationFrame(this.animFrameId);
    this.threeRenderer.domElement.remove();
    this.threeRenderer.dispose();
    const hud = document.getElementById('hud-3d');
    if (hud) hud.remove();
    // Show Phaser canvas again
    this.game.canvas.style.display = '';
    // Clean up network handler
    if (this.messageHandler) {
      this.network?.removeHandler(this.messageHandler);
      this.messageHandler = null;
    }
  }

  // ══════════════════════════════════════════════════════
  // ── MULTIPLAYER METHODS ──
  // ══════════════════════════════════════════════════════

  private setupMultiplayer(): void {
    this.network = NetworkManager.getInstance();
    this.remotePlayers = new Map();

    this.messageHandler = (msg: GameMessage, senderId: string) => {
      if (senderId === this.network.playerId) return; // ignore own messages
      this.handleNetworkMessage(msg, senderId);
    };
    this.network.onMessage(this.messageHandler);

    // Create models for all remote players from lobby
    for (const p of this.multiplayerPlayers) {
      if (p.id === this.network.playerId) continue;
      this.createRemotePlayer(p);
    }
  }

  private handleNetworkMessage(msg: GameMessage, senderId: string): void {
    switch (msg.type) {
      case 'POSITION_UPDATE': {
        let rp = this.remotePlayers.get(msg.playerId);
        if (!rp) {
          // Late joiner — create their model
          this.createRemotePlayer({ id: msg.playerId, name: msg.playerId.slice(0, 8), characterKey: 'char-0' });
          rp = this.remotePlayers.get(msg.playerId);
        }
        if (rp && !rp.dead) {
          rp.targetX = msg.x;
          rp.targetY = msg.y;
          rp.targetZ = msg.z;
          rp.targetRotY = msg.rotY;
          rp.speed = msg.speed;
          rp.hp = msg.hp;
        }
        break;
      }
      case 'SHOOT': {
        // Spawn a bullet from the remote player
        const geo = new THREE.SphereGeometry(0.1, 4, 4);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.5 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(msg.x, msg.y, msg.z);
        this.scene3d.add(mesh);
        this.bullets.push({
          mesh,
          vx: msg.vx, vy: msg.vy, vz: msg.vz,
          life: 2,
          damage: msg.damage,
          owner: -2, // remote player bullet (not NPC, not local)
        });
        this.playSfx('shoot', 0.2);
        break;
      }
      case 'PLAYER_HIT': {
        // Another player says we got hit
        if (msg.targetId === this.network.playerId) {
          this.playerHP = Math.max(0, this.playerHP - msg.damage * 5);
          this.playSfx('hurt', 0.5);
          if (this.hpText) this.hpText.textContent = `HP: ${this.playerHP}`;
          if (this.playerHP <= 0) {
            this.network.send({ type: 'PLAYER_DEAD', playerId: this.network.playerId });
            this.showGameOver('KILLED BY A PLAYER');
          }
        }
        break;
      }
      case 'PLAYER_DEAD': {
        const rp = this.remotePlayers.get(msg.playerId);
        if (rp) {
          rp.dead = true;
          this.coinsEarned += 1000;
          this.showPickupMsg('+1000 coins! Player eliminated!');
          this.spawnDeathFluff(rp.model.position.clone());
          this.scene3d.remove(rp.model);
        }
        break;
      }
      case 'PLAYER_LEFT': {
        const rp = this.remotePlayers.get(msg.playerId);
        if (rp) {
          this.scene3d.remove(rp.model);
          this.remotePlayers.delete(msg.playerId);
        }
        break;
      }
    }
  }

  private createRemotePlayer(info: PlayerInfo): void {
    // Reuse NPC model builder but with unique color based on player id
    const colorIndex = Math.abs(info.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CHAR_COLORS.length;
    const visuals = CHAR_VISUALS[colorIndex % CHAR_VISUALS.length];

    const shirtMat = new THREE.MeshStandardMaterial({ color: visuals.shirt, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: visuals.skin, roughness: 0.6, metalness: 0.05 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: visuals.pants, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.1 });

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
    chest.castShadow = true;
    torso.add(chest);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), skinMat);
    neck.position.y = 0.6;
    torso.add(neck);

    // Head — simplified
    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.38, 0.32), skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: visuals.eye });
    for (const side of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
      eye.position.set(side, 0.04, 0.17);
      headGroup.add(eye);
    }
    // Hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.15, 0.34), new THREE.MeshStandardMaterial({ color: visuals.hair }));
    hair.position.y = 0.2;
    headGroup.add(hair);
    headGroup.position.y = 0.72;
    torso.add(headGroup);

    // Arms
    const leftUpperArm = new THREE.Group();
    leftUpperArm.position.set(-0.3, 0.48, 0);
    torso.add(leftUpperArm);
    leftUpperArm.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat), { position: new THREE.Vector3(0, -0.14, 0) }));
    const leftForearm = new THREE.Group();
    leftForearm.position.y = -0.28;
    leftUpperArm.add(leftForearm);
    leftForearm.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat), { position: new THREE.Vector3(0, -0.12, 0) }));

    const rightUpperArm = new THREE.Group();
    rightUpperArm.position.set(0.3, 0.48, 0);
    torso.add(rightUpperArm);
    rightUpperArm.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), shirtMat), { position: new THREE.Vector3(0, -0.14, 0) }));
    const rightForearm = new THREE.Group();
    rightForearm.position.y = -0.28;
    rightUpperArm.add(rightForearm);
    rightForearm.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), skinMat), { position: new THREE.Vector3(0, -0.12, 0) }));

    // Legs
    const leftThigh = new THREE.Group();
    leftThigh.position.set(-0.12, -0.05, 0);
    hips.add(leftThigh);
    leftThigh.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), pantsMat), { position: new THREE.Vector3(0, -0.15, 0) }));
    const leftShin = new THREE.Group();
    leftShin.position.y = -0.3;
    leftThigh.add(leftShin);
    leftShin.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), pantsMat), { position: new THREE.Vector3(0, -0.16, 0) }));
    leftShin.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat), { position: new THREE.Vector3(0, -0.35, 0.04) }));

    const rightThigh = new THREE.Group();
    rightThigh.position.set(0.12, -0.05, 0);
    hips.add(rightThigh);
    rightThigh.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), pantsMat), { position: new THREE.Vector3(0, -0.15, 0) }));
    const rightShin = new THREE.Group();
    rightShin.position.y = -0.3;
    rightThigh.add(rightShin);
    rightShin.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), pantsMat), { position: new THREE.Vector3(0, -0.16, 0) }));
    rightShin.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeMat), { position: new THREE.Vector3(0, -0.35, 0.04) }));

    // Shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    // Health bar
    const hb = this.createHealthBarSprite();
    hb.sprite.position.set(0, 2.5, 0);
    root.add(hb.sprite);

    // Name label above head
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 256;
    nameCanvas.height = 64;
    const nCtx = nameCanvas.getContext('2d')!;
    nCtx.fillStyle = 'rgba(0,0,0,0.5)';
    nCtx.fillRect(0, 0, 256, 64);
    nCtx.font = 'bold 28px Arial';
    nCtx.fillStyle = '#ffffff';
    nCtx.textAlign = 'center';
    nCtx.fillText(info.name.slice(0, 16), 128, 42);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(2, 0.5, 1);
    nameSprite.position.set(0, 2.9, 0);
    root.add(nameSprite);

    // Place at random starting position
    const x = (Math.random() - 0.5) * 400;
    const z = (Math.random() - 0.5) * 400;
    root.position.set(x, 0, z);
    this.scene3d.add(root);

    this.remotePlayers.set(info.id, {
      model: root,
      targetX: x, targetY: 0, targetZ: z,
      targetRotY: 0,
      speed: 0,
      hp: 100,
      dead: false,
      healthBar: hb.sprite,
      healthCtx: hb.ctx,
      healthTex: hb.texture,
      hips, torso, head: headGroup,
      leftUpperArm, leftForearm,
      rightUpperArm, rightForearm,
      leftThigh, leftShin,
      rightThigh, rightShin,
      phase: 0,
      nameSprite,
    });
  }

  private updateMultiplayer(dt: number): void {
    // Send own position at ~15 updates/sec
    this.networkSendTimer -= dt;
    if (this.networkSendTimer <= 0) {
      this.networkSendTimer = 1 / 15;
      const speed = Math.sqrt(this.moveDir.x * this.moveDir.x + this.moveDir.z * this.moveDir.z);
      this.network.send({
        type: 'POSITION_UPDATE',
        playerId: this.network.playerId,
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        rotY: this.lookAngle,
        speed,
        hp: this.playerHP,
        gun: this.playerGun,
      });
    }

    // Interpolate remote player positions
    for (const [_pid, rp] of this.remotePlayers) {
      if (rp.dead) continue;

      // Smooth interpolation
      const lerpSpeed = 10 * dt;
      rp.model.position.x += (rp.targetX - rp.model.position.x) * lerpSpeed;
      rp.model.position.y += (rp.targetY - rp.model.position.y) * lerpSpeed;
      rp.model.position.z += (rp.targetZ - rp.model.position.z) * lerpSpeed;

      // Smooth rotation
      let dRot = rp.targetRotY - rp.model.rotation.y;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      rp.model.rotation.y += dRot * lerpSpeed;

      // Walk animation based on speed
      if (rp.speed > 0.1) {
        rp.phase += dt * rp.speed * 8;
        const swing = Math.sin(rp.phase) * 0.5;
        rp.leftThigh.rotation.x = swing;
        rp.rightThigh.rotation.x = -swing;
        rp.leftShin.rotation.x = Math.max(0, -swing) * 0.5;
        rp.rightShin.rotation.x = Math.max(0, swing) * 0.5;
        rp.leftUpperArm.rotation.x = -swing * 0.6;
        rp.rightUpperArm.rotation.x = swing * 0.6;
      } else {
        rp.leftThigh.rotation.x = 0;
        rp.rightThigh.rotation.x = 0;
        rp.leftShin.rotation.x = 0;
        rp.rightShin.rotation.x = 0;
        rp.leftUpperArm.rotation.x = 0;
        rp.rightUpperArm.rotation.x = 0;
      }

      // Update health bar
      this.updateHealthBar(rp.healthCtx, rp.healthTex, rp.hp, 100);
      rp.healthBar.lookAt(this.camera.position);
      rp.nameSprite.lookAt(this.camera.position);
    }

    // Update alive count to include remote players
    const remoteAlive = [...this.remotePlayers.values()].filter(r => !r.dead).length;
    if (this.aliveText && remoteAlive > 0) {
      const npcAlive = this.npcs.filter(n => !n.dead).length;
      this.aliveText.textContent = `Players: ${remoteAlive} | Bots: ${npcAlive}`;
    }
  }
}
