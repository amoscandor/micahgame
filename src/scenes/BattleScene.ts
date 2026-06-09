import Phaser from 'phaser';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WEAPONS } from '../config/game.config';
import { NetworkManager } from '../network/NetworkManager';
import { GameMessage, PlayerInfo } from '../network/MessageTypes';
import { addCoins, getCoins } from '../utils/coinStore';
import { getControls, DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, type ControlScheme } from '../utils/controlBindings';
import { ARMOR_ITEMS, getEquippedArmor } from './ArmorShopScene';
import { getEquippedPets } from './PetShopScene';

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
  private paused: boolean = false;

  // Player
  private moveDir = { x: 0, z: 0 };
  private lookAngle = 0;
  private lookPitch = 0;
  private playerPos = new THREE.Vector3(0, 0, 0);
  private fountainParts: { waters: THREE.Mesh[]; spout: THREE.Mesh | null; spray: THREE.Mesh | null; jets: THREE.Mesh[]; foams: THREE.Mesh[]; droplets: { mesh: THREE.Mesh; vel: THREE.Vector3; startY: number; endY: number; cx: number; cz: number }[] } = { waters: [], spout: null, spray: null, jets: [], foams: [], droplets: [] };
  private playerModel!: THREE.Group;
  private playerPhase = 0;
  private playerSpeed = 0;
  private playerJumpY = 0;
  private playerVy = 0;
  private playerSpeedMul = 1;
  private jumpEdgePrev = false;
  private lastJumpTapTime = 0;
  private backflipActive = false;
  private backflipPhase = 0;
  private playerHP = 100;
  private playerMaxHP = 100;
  private coinsEarned = 0;
  private carBtn: HTMLDivElement | null = null;
  private playerGun = 'None';
  private playerAmmo = 0;
  private ammoText!: HTMLDivElement;
  private ammoPickups: { group: THREE.Group; picked: boolean }[] = [];
  private playerHealthBar!: THREE.Sprite;
  private playerHealthCtx!: CanvasRenderingContext2D;
  private playerHealthTex!: THREE.CanvasTexture;

  // Pickups
  private gunPickups: { group: THREE.Group; name: string; color: number; picked: boolean }[] = [];
  private cheesePickups: { group: THREE.Group; picked: boolean; name?: string }[] = [];
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

  // Sum-of-sines terrain — gentle rolling hills. Same formula is used by the ground mesh
  // and by every object that wants to sit on the terrain (NPCs, trees, rocks, pickups, etc.).
  private getTerrainHeight(wx: number, wz: number): number {
    return (
      Math.sin(wx * 0.012) * 2.6 +
      Math.cos(wz * 0.011) * 2.4 +
      Math.sin((wx + wz) * 0.018) * 1.4 +
      Math.cos((wx - wz) * 0.024) * 0.9
    );
  }
  // Skeletal joints for player
  private pHips!: THREE.Group;
  private pTorso!: THREE.Group;
  private pHead!: THREE.Group;
  private pLeftUpperArm!: THREE.Group; private pLeftForearm!: THREE.Group;
  private pRightUpperArm!: THREE.Group; private pRightForearm!: THREE.Group;
  private pThirdGun?: THREE.Group;
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
    // Combat AI state — makes bots feel more player-like
    strafeDir?: number; // -1, 0, or 1 for circle-strafing
    strafeTimer?: number; // time until next strafe direction flip
    burstTimer?: number; // time remaining in current burst
    burstCooldown?: number; // time until next burst starts
    aimErrX?: number; // aim jitter offset X
    aimErrY?: number; // aim jitter offset Y
    aimErrTimer?: number; // time until aim jitter resets
    jumpTimer?: number; // time until next bhop attempt
    jumpY?: number; // current vertical jump offset
    jumpVy?: number; // vertical jump velocity
  }[] = [];

  // Cars
  private cars: { mesh: THREE.Group; vx: number; vz: number; speed: number; driver: 'none' | 'player' | number; legPivots?: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[]; armPivots?: THREE.Group[]; tailPivots?: THREE.Group[]; jawPivot?: THREE.Group; neckBase?: THREE.Group; neckMid?: THREE.Group; bodyGroup?: THREE.Group; glbHolder?: THREE.Group; mixer?: THREE.AnimationMixer; roarAction?: THREE.AnimationAction; deathAction?: THREE.AnimationAction; roarTimer?: number; runPhase?: number; wanderAngle?: number; wanderTimer?: number; wanderSpeed?: number; wheelPivots?: THREE.Group[]; isVehicle?: boolean; seatLocalY?: number; hp?: number; maxHp?: number; healthBar?: THREE.Sprite; healthCtx?: CanvasRenderingContext2D; healthTex?: THREE.CanvasTexture; dying?: boolean }[] = [];
  private playerInCar: number = -1; // index of car player is driving, -1 = on foot

  // T-Rex eat animation
  private trexEatAnim: {
    active: boolean;
    timer: number;
    phase: 'jump' | 'chomp' | 'swallow';
    trexIndex: number;
    startY: number;
    damage: number;
  } = { active: false, timer: 0, phase: 'jump', trexIndex: -1, startY: 0, damage: 15 };

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
  private musicEl: HTMLAudioElement | null = null;
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

  // Camera mode
  private firstPerson = false;
  private fpArms?: THREE.Group;
  private fpGun?: THREE.Group;
  private fpGuns: Record<string, THREE.Group> = {};

  // Pets (up to 3)
  private pets: { mesh: THREE.Group; type: string; legs: THREE.Mesh[]; wings: THREE.Mesh[]; phase: number }[] = [];

  // Snowfall
  private snowParticles?: THREE.Points;
  private snowVelocities: number[] = [];
  // Snowmen that chase the player
  private snowmen: { mesh: THREE.Group; hp: number; throwTimer: number }[] = [];
  // Evil hedgehogs that charge the player (battleground world)
  private evilHedgehogs: { mesh: THREE.Group; body: THREE.Group; hp: number; spikeTimer: number; bobPhase: number }[] = [];

  // World/wave system: cycles through different biomes
  private currentWorld = 0; // 0=default, 1=forest, 2=desert, 3=snow
  // Carry-over from previous world when switching via the HUD world name
  private startLandX: number | null = null;
  private startLandZ: number | null = null;
  private startLookAngle: number | null = null;
  private startLookPitch: number | null = null;
  private static worldNames = ['Randomstuff', 'Forest', 'Desert', 'Snow'];
  private static worldColors = [
    { ground: 0x4a7a3a, sky: [0x5588cc, 0xffcc88], fog: 0x99bbdd },   // default
    { ground: 0x2d5a1e, sky: [0x5588cc, 0xffcc88], fog: 0x99bbdd },   // forest (blue sky like randomstuff)
    { ground: 0xd4a843, sky: [0x4488cc, 0xffdd88], fog: 0xddcc99 },   // desert (sandy)
    { ground: 0xe8e8f0, sky: [0x8899bb, 0xccddef], fog: 0xccddee },   // snow (white/blue)
  ];

  init(data: { characterKey?: string; characterName?: string; mode?: string; opponent?: string; multiplayerPlayers?: PlayerInfo[]; world?: number; landX?: number; landZ?: number; lookAngle?: number; lookPitch?: number }): void {
    if (data.characterKey) this.selectedCharKey = data.characterKey;
    if (data.characterName) this.selectedCharName = data.characterName;
    if (data.mode) this.gameMode = data.mode;
    this.isMultiplayer = data.opponent === 'players';
    this.multiplayerPlayers = data.multiplayerPlayers || [];
    if (data.world !== undefined) this.currentWorld = data.world;
    this.startLandX = data.landX ?? null;
    this.startLandZ = data.landZ ?? null;
    this.startLookAngle = data.lookAngle ?? null;
    this.startLookPitch = data.lookPitch ?? null;
  }

  create(): void {
    // Bake sound effects
    this.bakeSounds();
    this.startBattleMusic();

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
    this.playerAmmo = 0;
    this.ammoPickups = [];
    if (this.startLandX !== null && this.startLandZ !== null) {
      this.playerPos.set(this.startLandX, 0, this.startLandZ);
      this.lookAngle = this.startLookAngle ?? 0;
      this.lookPitch = this.startLookPitch ?? 0;
    } else {
      this.playerPos.set(0, 0, 0);
      this.lookAngle = 0;
      this.lookPitch = 0;
    }
    this.bullets = [];
    this.npcs = [];
    this.colliders = [];
    this.snowmen = [];
    this.evilHedgehogs = [];
    // No roads anywhere — keep the array empty so the map screen doesn't draw any.
    this.roadSegments = [];
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

    // Three.js renderer — tuned for a more "real life" look without big perf hits.
    const isMobile = 'ontouchstart' in window;
    this.threeRenderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    this.threeRenderer.setSize(window.innerWidth, window.innerHeight);
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 1.5));
    this.threeRenderer.shadowMap.enabled = true;
    this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1.25; // brighter, more cinematic
    this.threeRenderer.outputColorSpace = THREE.SRGBColorSpace; // accurate gamma -> photorealistic colors
    document.getElementById('game-container')!.appendChild(this.threeRenderer.domElement);
    this.threeRenderer.domElement.style.position = 'fixed';
    this.threeRenderer.domElement.style.top = '0';
    this.threeRenderer.domElement.style.left = '0';
    this.threeRenderer.domElement.style.zIndex = '999';

    // Scene
    this.scene3d = new THREE.Scene();
    const worldFogs = [0x9ab8d0, 0x445533, 0xddcc99, 0xccddee];
    this.scene3d.fog = new THREE.FogExp2(worldFogs[this.currentWorld % 4], 0.0012);

    // Realistic sky gradient — canvas texture on a sphere
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
    const ww = this.currentWorld % 4;
    if (ww === 0 || ww === 1) {
      // Forest shares the same blue sky as randomstuff
      skyGrad.addColorStop(0, '#1a3a6a'); skyGrad.addColorStop(0.5, '#6a9acc'); skyGrad.addColorStop(0.85, '#d8e8f0'); skyGrad.addColorStop(1, '#e8d0a0');
    } else if (ww === 2) {
      skyGrad.addColorStop(0, '#1a4488'); skyGrad.addColorStop(0.4, '#4488cc'); skyGrad.addColorStop(0.7, '#88aadd'); skyGrad.addColorStop(1, '#ffddaa');
    } else {
      skyGrad.addColorStop(0, '#3a4a6a'); skyGrad.addColorStop(0.4, '#6a7a9a'); skyGrad.addColorStop(0.7, '#aabbcc'); skyGrad.addColorStop(1, '#dde8f0');
    }
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

    // Vite base URL prefix for loading models/textures from public/.
    const baseUrl = (import.meta.env?.BASE_URL ?? '/');

    // First-person arms + guns — attached to camera so they always show.
    // Hands are placed EXACTLY at each gun's grip anchors; forearms extend down-back off-screen.
    const fpArms = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xddb88c, roughness: 0.8 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x226644, roughness: 0.9 });

    // Gun-holder defines the gun's root in camera space.
    // All guns share two anchor points (both in gun-local space):
    //   PISTOL-GRIP: (0, -0.14, -0.05)  → right hand goes here
    //   FOREGRIP:    (0, -0.03, -0.45)  → left hand goes here
    const gunHolder = new THREE.Group();
    gunHolder.position.set(0.18, -0.25, -0.2);
    gunHolder.rotation.y = -0.04;
    fpArms.add(gunHolder);
    this.fpGuns = {};

    // Hands at each grip anchor in CAMERA space (matches gunHolder position + local anchor).
    // Right hand (pistol grip): camera (0.18, -0.39, -0.25)
    // Left hand  (foregrip):    camera (0.18, -0.28, -0.65)
    const buildArm = (handX: number, handY: number, handZ: number, mirrored: boolean) => {
      const arm = new THREE.Group();
      // Hand at group origin — sits exactly on the grip.
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.11), skinMat);
      hand.position.set(0, 0, 0);
      arm.add(hand);
      // Thumb wrapping up/over the grip
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.04), skinMat);
      thumb.position.set(mirrored ? 0.05 : -0.05, 0.04, -0.02);
      arm.add(thumb);
      // Wrist just behind the hand
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.09), skinMat);
      wrist.position.set(mirrored ? -0.02 : 0.02, -0.02, 0.08);
      arm.add(wrist);
      // Forearm — tilted so it extends down and BACK (out of view under the weapon)
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.09), sleeveMat);
      fore.position.set(mirrored ? -0.05 : 0.05, -0.22, 0.22);
      fore.rotation.x = 0.55; // tilt forearm down-back
      fore.rotation.z = mirrored ? 0.35 : -0.35; // angle outward
      arm.add(fore);
      // Cuff band where skin meets sleeve
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.04, 0.095), sleeveMat);
      cuff.position.set(mirrored ? -0.015 : 0.015, -0.06, 0.1);
      arm.add(cuff);
      arm.position.set(handX, handY, handZ);
      fpArms.add(arm);
      return arm;
    };

    // Right arm → pistol grip. Left arm → foregrip (further forward).
    buildArm(0.18, -0.39, -0.25, false);
    buildArm(0.18, -0.28, -0.65, true);

    // First-person gun models — one for each weapon family
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.7 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5, metalness: 0.6 });
    const bluedMat = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.3, metalness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1a, roughness: 0.85 });
    const polymerMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.95 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.25, metalness: 0.95 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.3, metalness: 0.9 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xcc4422, roughness: 0.6 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08c44, roughness: 0.4, metalness: 0.7 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xaa2200, emissiveIntensity: 0.5, roughness: 0.6 });

    // Shared grip-anchor constants used by every gun model below.
    const GRIP_X = 0, GRIP_Y = -0.14, GRIP_Z = -0.05;
    const FORE_X = 0, FORE_Y = -0.03, FORE_Z = -0.45;

    // Helper for grip & foregrip — every rifle-style gun adds these so hands align.
    const addPistolGrip = (g: THREE.Group, mat: THREE.Material) => {
      const grip = this.makeMesh(new THREE.BoxGeometry(0.075, 0.2, 0.1), mat, GRIP_X, GRIP_Y, GRIP_Z);
      grip.rotation.x = -0.3;
      g.add(grip);
      // Trigger guard
      const guard = this.makeMesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), darkMetalMat, GRIP_X, GRIP_Y + 0.05, GRIP_Z - 0.03);
      guard.rotation.x = Math.PI / 2;
      g.add(guard);
      // Trigger
      g.add(this.makeMesh(new THREE.BoxGeometry(0.012, 0.035, 0.012), darkMetalMat, GRIP_X, GRIP_Y + 0.04, GRIP_Z - 0.02));
    };
    const addForegrip = (g: THREE.Group, mat: THREE.Material, width = 0.085) => {
      // Chunky handguard/foregrip wider than the barrel so the left hand has something to hold.
      const hg = this.makeMesh(new THREE.BoxGeometry(width, 0.09, 0.24), mat, FORE_X, FORE_Y, FORE_Z);
      g.add(hg);
      // Vertical foregrip stub for the left hand to wrap around
      const stub = this.makeMesh(new THREE.BoxGeometry(0.045, 0.09, 0.045), polymerMat, FORE_X, FORE_Y - 0.06, FORE_Z);
      g.add(stub);
    };

    // === ASSAULT RIFLE — real GLB model from Poly Pizza ===
    {
      const g = new THREE.Group();
      // Load asynchronously and add the model when ready, scaled to FP-view size.
      new GLTFLoader().load(baseUrl + 'models/ar.glb', (gltf) => {
        const ar = gltf.scene;
        const bb = new THREE.Box3().setFromObject(ar);
        const size = new THREE.Vector3();
        bb.getSize(size);
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const fit = 0.9 / longest; // ~0.9 units long, matches the procedural AR
        ar.scale.setScalar(fit);
        // Center the model around its bounding box, then nudge so the grip lands at GRIP_X,Y,Z.
        const cx = (bb.min.x + bb.max.x) / 2 * fit;
        const cy = (bb.min.y + bb.max.y) / 2 * fit;
        const cz = (bb.min.z + bb.max.z) / 2 * fit;
        ar.position.set(GRIP_X - cx, GRIP_Y - cy, GRIP_Z - 0.2 - cz);
        ar.rotation.y = Math.PI; // muzzle pointing forward (toward camera -Z)
        g.add(ar);
      });
      gunHolder.add(g);
      this.fpGuns['ar'] = g;
    }

    // === PISTOL — compact sidearm (one-handed, left hand tucked off-screen) ===
    {
      const g = new THREE.Group();
      // Slide
      g.add(this.makeMesh(new THREE.BoxGeometry(0.07, 0.08, 0.3), bluedMat, 0, 0.02, -0.12));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.065, 0.03, 0.3), darkMetalMat, 0, 0.065, -0.12));
      // Slide serrations
      for (let i = 0; i < 5; i++) g.add(this.makeMesh(new THREE.BoxGeometry(0.068, 0.06, 0.006), darkMetalMat, 0, 0.02, 0.01 - i * 0.015));
      // Barrel peeking out
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), darkMetalMat, 0, 0.025, -0.3, Math.PI / 2));
      // Frame
      g.add(this.makeMesh(new THREE.BoxGeometry(0.065, 0.06, 0.22), polymerMat, 0, -0.04, -0.06));
      // Trigger guard
      const guard = this.makeMesh(new THREE.TorusGeometry(0.035, 0.01, 6, 10, Math.PI), darkMetalMat, 0, -0.06, -0.02);
      guard.rotation.x = Math.PI / 2;
      g.add(guard);
      // Trigger
      g.add(this.makeMesh(new THREE.BoxGeometry(0.01, 0.03, 0.01), darkMetalMat, 0, -0.07, -0.01));
      // Grip — positioned so right hand lands on it
      const grip = this.makeMesh(new THREE.BoxGeometry(0.065, 0.2, 0.1), polymerMat, GRIP_X, GRIP_Y, GRIP_Z + 0.04);
      grip.rotation.x = -0.2;
      g.add(grip);
      // Mag baseplate
      g.add(this.makeMesh(new THREE.BoxGeometry(0.07, 0.015, 0.105), darkMetalMat, GRIP_X, GRIP_Y - 0.09, GRIP_Z + 0.045));
      // Sights
      g.add(this.makeMesh(new THREE.BoxGeometry(0.012, 0.022, 0.012), darkMetalMat, 0, 0.093, -0.25));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.035, 0.022, 0.012), darkMetalMat, 0, 0.093, -0.02));
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['pistol'] = g;
    }

    // === SHOTGUN — pump-action, wide barrel, wood furniture ===
    {
      const g = new THREE.Group();
      // Receiver
      g.add(this.makeMesh(new THREE.BoxGeometry(0.085, 0.11, 0.32), bluedMat, 0, 0.01, -0.18));
      // Big smooth barrel
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.038, 0.038, 0.62, 12), bluedMat, 0, 0.04, -0.62, Math.PI / 2));
      // Choke/bead sight
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.045, 0.04, 0.04, 12), darkMetalMat, 0, 0.04, -0.93, Math.PI / 2));
      g.add(this.makeMesh(new THREE.SphereGeometry(0.008, 6, 6), brassMat, 0, 0.08, -0.93));
      // Magazine tube
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.55, 10), bluedMat, 0, -0.018, -0.55, Math.PI / 2));
      // Pump handle (wood) — this IS the foregrip
      const pump = this.makeMesh(new THREE.BoxGeometry(0.09, 0.095, 0.22), woodMat, FORE_X, FORE_Y - 0.03, FORE_Z);
      g.add(pump);
      g.add(this.makeMesh(new THREE.BoxGeometry(0.095, 0.02, 0.22), darkMetalMat, FORE_X, FORE_Y - 0.085, FORE_Z));
      // Wood stock with neck
      g.add(this.makeMesh(new THREE.BoxGeometry(0.07, 0.1, 0.08), woodMat, 0, -0.02, 0.02));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.08, 0.1, 0.22), woodMat, 0, 0.02, 0.13));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.085, 0.13, 0.025), darkMetalMat, 0, 0.02, 0.24));
      // Grip — wood wrist of stock
      const grip = this.makeMesh(new THREE.BoxGeometry(0.07, 0.2, 0.11), woodMat, GRIP_X, GRIP_Y, GRIP_Z);
      grip.rotation.x = -0.25;
      g.add(grip);
      // Trigger guard
      const guard = this.makeMesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), darkMetalMat, GRIP_X, GRIP_Y + 0.05, GRIP_Z - 0.03);
      guard.rotation.x = Math.PI / 2;
      g.add(guard);
      g.add(this.makeMesh(new THREE.BoxGeometry(0.012, 0.035, 0.012), darkMetalMat, GRIP_X, GRIP_Y + 0.04, GRIP_Z - 0.02));
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['shotgun'] = g;
    }

    // === SNIPER — long bolt-action with scope ===
    {
      const g = new THREE.Group();
      // Receiver
      g.add(this.makeMesh(new THREE.BoxGeometry(0.075, 0.08, 0.3), bluedMat, 0, 0.015, -0.18));
      // Bolt handle
      const bolt = this.makeMesh(new THREE.BoxGeometry(0.015, 0.04, 0.015), silverMat, 0.05, 0.02, -0.08);
      g.add(bolt);
      g.add(this.makeMesh(new THREE.SphereGeometry(0.018, 8, 8), silverMat, 0.08, 0.04, -0.08));
      // Very long barrel
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 10), bluedMat, 0, 0.025, -0.78, Math.PI / 2));
      // Muzzle brake
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), darkMetalMat, 0, 0.025, -1.28, Math.PI / 2));
      for (let i = 0; i < 3; i++) g.add(this.makeMesh(new THREE.BoxGeometry(0.055, 0.01, 0.015), darkMetalMat, 0, 0.06, -1.24 + i * 0.03));
      // Large scope body
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.048, 0.048, 0.26, 14), darkMetalMat, 0, 0.12, -0.22, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), darkMetalMat, 0, 0.12, -0.07, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), darkMetalMat, 0, 0.12, -0.36, Math.PI / 2));
      // Lens
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 14), accentMat, 0, 0.12, -0.04, Math.PI / 2));
      // Scope rings
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.022, 12), metalMat, 0, 0.1, -0.12, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.022, 12), metalMat, 0, 0.1, -0.32, Math.PI / 2));
      // Wood stock
      g.add(this.makeMesh(new THREE.BoxGeometry(0.08, 0.12, 0.32), woodMat, 0, -0.005, 0.15));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.09, 0.15, 0.025), darkMetalMat, 0, -0.005, 0.27));
      // Wood handguard = foregrip
      const hg = this.makeMesh(new THREE.BoxGeometry(0.09, 0.09, 0.24), woodMat, FORE_X, FORE_Y, FORE_Z);
      g.add(hg);
      // Pistol grip
      const grip = this.makeMesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), woodMat, GRIP_X, GRIP_Y, GRIP_Z);
      grip.rotation.x = -0.3;
      g.add(grip);
      const guard = this.makeMesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), darkMetalMat, GRIP_X, GRIP_Y + 0.05, GRIP_Z - 0.03);
      guard.rotation.x = Math.PI / 2;
      g.add(guard);
      // Bipod legs
      const lpod = this.makeMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), darkMetalMat, -0.05, -0.08, -0.75);
      lpod.rotation.z = 0.35;
      g.add(lpod);
      const rpod = this.makeMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), darkMetalMat, 0.05, -0.08, -0.75);
      rpod.rotation.z = -0.35;
      g.add(rpod);
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['sniper'] = g;
    }

    // === MINIGUN — rotating barrel cluster ===
    {
      const g = new THREE.Group();
      // Main housing
      g.add(this.makeMesh(new THREE.BoxGeometry(0.18, 0.18, 0.4), metalMat, 0, 0, -0.17));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), metalMat, 0, 0, -0.37, Math.PI / 2));
      // Barrel cluster
      const cluster = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = this.makeMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 8), bluedMat, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.66, Math.PI / 2);
        cluster.add(b);
      }
      // Central shaft
      cluster.add(this.makeMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.58, 10), darkMetalMat, 0, 0, -0.66, Math.PI / 2));
      g.add(cluster);
      // Front ring (barrel support)
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 14), metalMat, 0, 0, -0.95, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 14), darkMetalMat, 0, 0, -0.56, Math.PI / 2));
      // Ammo belt box on the side
      g.add(this.makeMesh(new THREE.BoxGeometry(0.16, 0.16, 0.18), darkMetalMat, 0.18, -0.04, -0.1));
      // Flexible ammo belt
      for (let i = 0; i < 8; i++) g.add(this.makeMesh(new THREE.BoxGeometry(0.02, 0.012, 0.016), brassMat, 0.12 - i * 0.014, -0.05 + Math.sin(i) * 0.005, -0.05));
      // Heat shield vents
      for (let i = 0; i < 5; i++) g.add(this.makeMesh(new THREE.BoxGeometry(0.01, 0.04, 0.025), darkMetalMat, 0, 0.085, -0.1 - i * 0.05));
      // Big pistol grip on the back
      const grip = this.makeMesh(new THREE.BoxGeometry(0.085, 0.24, 0.11), polymerMat, GRIP_X, GRIP_Y - 0.03, GRIP_Z + 0.05);
      grip.rotation.x = -0.2;
      g.add(grip);
      // Front handle (left hand) — vertical grip on top of housing
      const fgrip = this.makeMesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), polymerMat, FORE_X, FORE_Y - 0.02, FORE_Z + 0.1);
      g.add(fgrip);
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['minigun'] = g;
    }

    // === RPG — rocket launcher ===
    {
      const g = new THREE.Group();
      // Big tube
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.075, 0.075, 1.05, 14), darkMetalMat, 0, 0.025, -0.42, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14), metalMat, 0, 0.025, -0.9, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14), metalMat, 0, 0.025, 0.05, Math.PI / 2));
      // Rear cone flare
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.1, 0.075, 0.08, 14), darkMetalMat, 0, 0.025, 0.11, Math.PI / 2));
      // Rocket warhead sticking out front
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.068, 0.06, 0.22, 12), orangeMat, 0, 0.025, -1.02, Math.PI / 2));
      const tip = this.makeMesh(new THREE.ConeGeometry(0.065, 0.16, 12), orangeMat, 0, 0.025, -1.2);
      tip.rotation.x = -Math.PI / 2;
      g.add(tip);
      // Warhead fins
      for (let i = 0; i < 4; i++) {
        const f = this.makeMesh(new THREE.BoxGeometry(0.005, 0.04, 0.06), darkMetalMat, 0, 0.025, -0.95);
        f.rotation.z = i * Math.PI / 2;
        g.add(f);
      }
      // Optic / iron sight on top
      g.add(this.makeMesh(new THREE.BoxGeometry(0.03, 0.08, 0.05), darkMetalMat, 0, 0.12, -0.2));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), darkMetalMat, 0, 0.17, -0.2));
      // Pistol grip
      const grip = this.makeMesh(new THREE.BoxGeometry(0.07, 0.22, 0.1), polymerMat, GRIP_X, GRIP_Y - 0.02, GRIP_Z);
      grip.rotation.x = -0.25;
      g.add(grip);
      const guard = this.makeMesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), darkMetalMat, GRIP_X, GRIP_Y + 0.05, GRIP_Z - 0.03);
      guard.rotation.x = Math.PI / 2;
      g.add(guard);
      // Front grip (vertical stub)
      const fgrip = this.makeMesh(new THREE.BoxGeometry(0.05, 0.15, 0.05), polymerMat, FORE_X, FORE_Y - 0.05, FORE_Z);
      g.add(fgrip);
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['rpg'] = g;
    }

    // === GOLD SCAR — ornate gold rifle ===
    {
      const g = new THREE.Group();
      g.add(this.makeMesh(new THREE.BoxGeometry(0.095, 0.11, 0.42), goldMat, 0, 0.005, -0.2));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.098, 0.035, 0.42), darkMetalMat, 0, 0.075, -0.2));
      for (let i = 0; i < 7; i++) g.add(this.makeMesh(new THREE.BoxGeometry(0.06, 0.008, 0.018), silverMat, 0, 0.1, -0.05 - i * 0.04));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), goldMat, 0, 0.025, -0.6, Math.PI / 2));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.036, 0.036, 0.08, 10), goldMat, 0, 0.025, -0.88, Math.PI / 2));
      // Gold flutes on barrel
      for (let i = 0; i < 6; i++) {
        const flute = this.makeMesh(new THREE.BoxGeometry(0.004, 0.05, 0.32), darkMetalMat, 0, 0.025, -0.55);
        flute.rotation.z = i * Math.PI / 3;
        g.add(flute);
      }
      // Magazine
      const mag = this.makeMesh(new THREE.BoxGeometry(0.06, 0.18, 0.09), darkMetalMat, 0, -0.18, -0.15);
      mag.rotation.x = -0.15;
      g.add(mag);
      // Grip & handguard (in darker polymer for contrast)
      addPistolGrip(g, darkMetalMat);
      addForegrip(g, goldMat);
      // Sights
      g.add(this.makeMesh(new THREE.BoxGeometry(0.022, 0.055, 0.014), darkMetalMat, 0, 0.14, -0.45));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.045, 0.045, 0.018), darkMetalMat, 0, 0.14, -0.06));
      // Stock
      g.add(this.makeMesh(new THREE.BoxGeometry(0.075, 0.1, 0.22), darkMetalMat, 0, 0, 0.12));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.085, 0.12, 0.03), darkMetalMat, 0, 0, 0.22));
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['gold_scar'] = g;
    }

    // === BB GUN — small toy rifle ===
    {
      const g = new THREE.Group();
      g.add(this.makeMesh(new THREE.BoxGeometry(0.065, 0.07, 0.3), silverMat, 0, 0.01, -0.15));
      g.add(this.makeMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), darkMetalMat, 0, 0.02, -0.44, Math.PI / 2));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.015, 0.025, 0.01), darkMetalMat, 0, 0.045, -0.58));
      // Cocking lever
      g.add(this.makeMesh(new THREE.BoxGeometry(0.02, 0.015, 0.15), silverMat, 0, -0.04, -0.25));
      // Grip + wood stock
      const grip = this.makeMesh(new THREE.BoxGeometry(0.055, 0.18, 0.085), woodMat, GRIP_X, GRIP_Y + 0.01, GRIP_Z + 0.02);
      grip.rotation.x = -0.25;
      g.add(grip);
      g.add(this.makeMesh(new THREE.BoxGeometry(0.06, 0.08, 0.18), woodMat, 0, 0.005, 0.1));
      g.add(this.makeMesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), darkMetalMat, 0, 0.005, 0.19));
      // Foregrip (wood)
      g.add(this.makeMesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), woodMat, FORE_X, FORE_Y + 0.005, FORE_Z + 0.05));
      g.visible = false;
      gunHolder.add(g);
      this.fpGuns['bb_gun'] = g;
    }

    fpArms.visible = false;
    gunHolder.visible = false; // no gun in first person — just bare arms
    this.camera.add(fpArms);
    this.scene3d.add(this.camera);
    this.fpArms = fpArms;
    this.fpGun = gunHolder;

    this.clock = new THREE.Clock();

    // === REALISTIC LIGHTING ===
    // Lower ambient = more contrast, more "real life".
    const ambient = new THREE.AmbientLight(0x506478, 0.22);
    this.scene3d.add(ambient);

    // Main sun — warm golden direct light. Strong, like real sunlight.
    const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4; // soften the edge so shadows aren't pixelated
    this.scene3d.add(sun);

    // Cool sky-blue fill light from opposite side — simulates skylight scattering.
    const fill = new THREE.DirectionalLight(0xa8c8ff, 0.35);
    fill.position.set(-30, 40, -20);
    this.scene3d.add(fill);

    // Sky/ground hemisphere — top sky-blue, bottom warm earth, gives outdoor feel.
    const hemi = new THREE.HemisphereLight(0x8fb4dd, 0x4a3a22, 0.55);
    this.scene3d.add(hemi);

    // === GROUND — flat square ===
    // Build a procedural canvas texture for the ground
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 2048;
    groundCanvas.height = 2048;
    const gCtx = groundCanvas.getContext('2d')!;
    const GC = 2048;

    // World-specific ground textures
    const w = this.currentWorld % 4;
    const paintBlotches = (count: number, variants: string[], minR: number, maxR: number, alphaMin = 0.6, alphaMax = 1) => {
      for (let i = 0; i < count; i++) {
        const gx = Math.random() * GC, gy = Math.random() * GC;
        const gr = minR + Math.random() * (maxR - minR);
        gCtx.globalAlpha = alphaMin + Math.random() * (alphaMax - alphaMin);
        gCtx.fillStyle = variants[Math.floor(Math.random() * variants.length)];
        gCtx.beginPath();
        gCtx.ellipse(gx, gy, gr, gr * (0.45 + Math.random() * 0.85), Math.random() * Math.PI, 0, Math.PI * 2);
        gCtx.fill();
      }
      gCtx.globalAlpha = 1;
    };
    const paintSpeckles = (count: number, colors: string[], sizeMin = 1, sizeMax = 3) => {
      for (let i = 0; i < count; i++) {
        gCtx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        gCtx.fillRect(Math.random() * GC, Math.random() * GC, sizeMin + Math.random() * (sizeMax - sizeMin), sizeMin + Math.random() * (sizeMax - sizeMin));
      }
    };

    if (w === 0) {
      // Battleground — lush green
      gCtx.fillStyle = '#3d6e22';
      gCtx.fillRect(0, 0, GC, GC);
      paintBlotches(1400, ['#4a7a28', '#336018', '#52872e', '#2e5a15', '#3a6820', '#5c9030', '#68a038'], 12, 90, 0.5, 0.95);
      paintBlotches(300, ['#6b5230', '#7a5e38', '#5a4020', '#8a6a40'], 10, 55, 0.4, 0.85); // dirt patches
      // Grass blades — lots, varied
      for (let i = 0; i < 2400; i++) {
        const tx = Math.random() * GC, ty = Math.random() * GC;
        const tlen = 4 + Math.random() * 14;
        gCtx.strokeStyle = ['#2a5a10', '#5a9030', '#3a7018', '#78a048'][Math.floor(Math.random() * 4)];
        gCtx.lineWidth = 0.8 + Math.random() * 0.8;
        gCtx.beginPath();
        gCtx.moveTo(tx, ty);
        gCtx.lineTo(tx + (Math.random() - 0.5) * 6, ty - tlen);
        gCtx.stroke();
      }
      paintSpeckles(1200, ['#1a3a08', '#0e2805', '#886640'], 1, 2); // tiny debris
    } else if (w === 1) {
      // Forest — mossy, leafy, mottled
      gCtx.fillStyle = '#1a3a0e';
      gCtx.fillRect(0, 0, GC, GC);
      paintBlotches(1600, ['#1e4412', '#2a5518', '#163810', '#224a14', '#0f2a08', '#2e6020', '#3a7028'], 15, 110, 0.45, 0.9);
      paintBlotches(500, ['#5a3a1a', '#6e4a22', '#3a2a10'], 6, 28, 0.3, 0.75); // dead leaves
      paintBlotches(260, ['#3a5a20', '#2a4418'], 4, 22, 0.3, 0.65); // moss
      // Twigs and blades
      for (let i = 0; i < 1400; i++) {
        const tx = Math.random() * GC, ty = Math.random() * GC;
        const tlen = 3 + Math.random() * 10;
        gCtx.strokeStyle = Math.random() > 0.5 ? '#2a4010' : '#5a4020';
        gCtx.lineWidth = 0.6 + Math.random() * 0.8;
        const angle = Math.random() * Math.PI;
        gCtx.beginPath();
        gCtx.moveTo(tx, ty);
        gCtx.lineTo(tx + Math.cos(angle) * tlen, ty + Math.sin(angle) * tlen);
        gCtx.stroke();
      }
      paintSpeckles(900, ['#0a1a04', '#3a2810'], 1, 2);
    } else if (w === 2) {
      // Desert — warm sand with ripples & pebbles
      gCtx.fillStyle = '#c8a050';
      gCtx.fillRect(0, 0, GC, GC);
      paintBlotches(1200, ['#d4aa58', '#ba9040', '#e0b868', '#a88038', '#ccaa55', '#ddc070', '#ba9648'], 14, 120, 0.4, 0.9);
      // Wavy dune ripples
      for (let i = 0; i < 180; i++) {
        const cx = Math.random() * GC, cy = Math.random() * GC;
        const len = 40 + Math.random() * 160;
        gCtx.globalAlpha = 0.18 + Math.random() * 0.25;
        gCtx.strokeStyle = Math.random() > 0.5 ? '#a07830' : '#dfc088';
        gCtx.lineWidth = 1.5 + Math.random() * 2.5;
        const ang = Math.random() * Math.PI;
        gCtx.beginPath();
        for (let t = 0; t <= 1; t += 0.1) {
          gCtx.lineTo(cx + Math.cos(ang) * len * t, cy + Math.sin(ang) * len * t + Math.sin(t * 6) * 6);
        }
        gCtx.stroke();
      }
      gCtx.globalAlpha = 1;
      paintBlotches(160, ['#8a7050', '#6e5638'], 5, 20, 0.35, 0.7); // rocky patches
      paintSpeckles(1600, ['#704828', '#9a7040', '#3a2814'], 1, 2); // pebbles
    } else {
      // Snow — bright, icy, wind-swept. Pure white/blue-tinted only — no dirt or earth showing through.
      gCtx.fillStyle = '#e8e8f0';
      gCtx.fillRect(0, 0, GC, GC);
      paintBlotches(1200, ['#dde0ea', '#f0f0f8', '#ccd0dd', '#e0e4ee', '#d0d8e8', '#f4f4fa', '#ffffff'], 15, 110, 0.55, 1);
      paintBlotches(160, ['#aaccee', '#88b0dd', '#cceeff'], 12, 50, 0.2, 0.45); // ice patches
      // Wind streaks
      for (let i = 0; i < 260; i++) {
        const sx = Math.random() * GC, sy = Math.random() * GC;
        const len = 20 + Math.random() * 80;
        gCtx.globalAlpha = 0.15 + Math.random() * 0.2;
        gCtx.strokeStyle = '#ffffff';
        gCtx.lineWidth = 1 + Math.random() * 1.5;
        gCtx.beginPath();
        gCtx.moveTo(sx, sy);
        gCtx.lineTo(sx + len, sy + (Math.random() - 0.5) * 6);
        gCtx.stroke();
      }
      gCtx.globalAlpha = 1;
      paintSpeckles(600, ['#ffffff', '#c0d0e0'], 1, 2); // sparkles
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(12, 12);

    // Hilly terrain — segmented plane displaced by getTerrainHeight() so the ground rolls.
    const groundGeo = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      // After we rotate the plane by -PI/2 around X, local (x, y, z) becomes world (x, z, -y).
      // So the world coordinates that this vertex will sit at are: worldX = x, worldZ = -y.
      const lx = positions.getX(i);
      const ly = positions.getY(i);
      const h = this.getTerrainHeight(lx, -ly);
      positions.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
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

    // Real photo textures per biome — gives each world a "real life" feel.
    const loader = new THREE.TextureLoader();
    if (w === 0 || w === 1) {
      // Grass — single photo, tiled.
      loader.load(baseUrl + 'textures/grass.jpg', (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(60, 60);
        tex.colorSpace = THREE.SRGBColorSpace;
        groundMat.map = tex;
        groundMat.color.set(0xffffff);
        groundMat.needsUpdate = true;
      });
    } else if (w === 2) {
      // Sand — color + normal map.
      loader.load(baseUrl + 'textures/sand.jpg', (tex) => {
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(25, 25);
        tex.colorSpace = THREE.SRGBColorSpace;
        groundMat.map = tex;
        groundMat.color.set(0xffffff);
        groundMat.needsUpdate = true;
      });
      loader.load(baseUrl + 'textures/sand_normal.jpg', (nrm) => {
        nrm.wrapS = THREE.RepeatWrapping; nrm.wrapT = THREE.RepeatWrapping;
        nrm.repeat.set(25, 25);
        groundMat.normalMap = nrm;
        groundMat.normalScale = new THREE.Vector2(1.2, 1.2);
        groundMat.needsUpdate = true;
      });
    } else {
      // Snow world — pure snow ground, no grass.
      loader.load(baseUrl + 'textures/snow.jpg?v=2', (tex) => {
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(22, 22);
        tex.colorSpace = THREE.SRGBColorSpace;
        groundMat.map = tex;
        groundMat.color.set(0xffffff);
        groundMat.needsUpdate = true;
      });
      loader.load(baseUrl + 'textures/snow_normal.jpg?v=2', (nrm) => {
        nrm.wrapS = THREE.RepeatWrapping; nrm.wrapT = THREE.RepeatWrapping;
        nrm.repeat.set(22, 22);
        groundMat.normalMap = nrm;
        groundMat.normalScale = new THREE.Vector2(0.9, 0.9);
        groundMat.needsUpdate = true;
      });
    }

    // Dirt patches — 20 patches with varied sizes and tones. Skipped in the snow world.
    if (w !== 3) {
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

    // === WORLD-SPECIFIC MAP OBJECTS ===
    const worldIdx = this.currentWorld % 4;

    if (worldIdx === 0) {
      // BATTLEGROUND — original map (no roads)
      this.createTrees();
      this.createEiffelTower();
      this.createRocks();
      this.createBushes();
      this.createLogs();
      this.createGrass();
      this.createMountains();
    } else if (worldIdx === 1) {
      // FOREST — dense trees, lots of logs and bushes, no roads, dark and thick
      this.createTrees();
      this.createTrees();
      this.createTrees();
      this.createTrees();
      this.createTrees(); // tons of trees for thick forest
      this.createRocks();
      this.createBushes();
      this.createBushes(); // extra bushes
      this.createLogs();
      this.createLogs(); // extra fallen logs
      this.createGrass();
      this.createGrass(); // thick undergrowth
      this.createMountains();
      this.createWorldExtras();
    } else if (worldIdx === 2) {
      // DESERT — rocks, no trees, no river, cacti and sand dunes (no roads)
      this.createRocks();
      this.createRocks(); // extra boulders
      this.createMountains();
      this.createWorldExtras();
      this.createDirtBikeStatue();
    } else {
      // SNOW — some trees, ice rocks, snowmen. NO grass — it's all snow.
      this.createTrees();
      this.createRocks();
      this.createMountains();
      this.createWorldExtras();
      this.createSnowfall();
      this.createChristmasTree();
    }

    // === PICKUPS & ENTITIES (all worlds) ===
    // Health pickups: pizza in Randomstuff, chocolate-chip cookies in Snow.
    if (this.currentWorld % 4 === 0) this.createCheese();
    if (this.currentWorld % 4 === 3) this.createCookies();
    // Bullet boxes scattered everywhere — every world.
    this.createAmmo();
    this.createGuns();
    this.createCars();
    // Bot count is set from Settings (15–100, default 50)
    const storedBots = parseInt(localStorage.getItem('fw-bot-count') || '50', 10);
    const botCount = Math.max(15, Math.min(100, isNaN(storedBots) ? 50 : storedBots));
    this.createNPCs(this.isMultiplayer ? 0 : botCount);

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

    if (this.startLandX !== null && this.startLandZ !== null) {
      // Carrying over from previous world — drop in at the same spot
      const lx = this.startLandX;
      const lz = this.startLandZ;
      this.playerPos.set(lx, this.getTerrainHeight(lx, lz), lz);
      if (this.playerModel) this.playerModel.position.set(lx, this.getTerrainHeight(lx, lz), lz);
      this.startGameLoop();
    } else {
      // Show map screen — player picks landing spot
      this.showMapScreen(() => {
        this.startGameLoop();
      });
    }
  }

  private showMapScreen(onLand: () => void): void {
    // On phones (short screens), overlay the title/subtitle/legend on TOP of the map so the map gets the full screen.
    const isShort = window.innerHeight < 500;
    const titleSize = isShort ? 12 : 28;
    const subtitleSize = isShort ? 9 : 16;
    const titleMargin = isShort ? 2 : 15;
    const subtitleMargin = isShort ? 2 : 15;
    const legendSize = isShort ? 9 : 12;
    const legendMargin = isShort ? 4 : 10;

    // Create fullscreen map overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;${isShort ? 'gap:0;' : ''}`;

    const title = document.createElement('div');
    title.textContent = 'CHOOSE YOUR LANDING SPOT';
    title.style.cssText = `color:#fff;font-family:sans-serif;font-size:${titleSize}px;font-weight:bold;margin-bottom:${titleMargin}px;text-shadow:0 0 10px #0af;letter-spacing:${isShort ? 1 : 3}px;${isShort ? 'position:absolute;top:4px;left:50%;transform:translateX(-50%);z-index:2;background:rgba(0,0,0,0.55);padding:2px 8px;border-radius:4px;pointer-events:none;' : ''}`;
    overlay.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Tap, click, or use Xbox stick + A to land';
    subtitle.style.cssText = `color:#aaa;font-family:sans-serif;font-size:${subtitleSize}px;margin-bottom:${subtitleMargin}px;${isShort ? 'position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:2;background:rgba(0,0,0,0.45);padding:1px 6px;border-radius:3px;pointer-events:none;' : ''}`;
    overlay.appendChild(subtitle);

    // Map canvas — on phones, fill the full short dimension (usually height); on desktop, subtract vertical chrome.
    const chromeV = isShort ? 8 : (titleSize + titleMargin) + (subtitleSize + subtitleMargin) + (legendSize + legendMargin) + 12;
    const chromeH = isShort ? 8 : 40;
    const mapSize = Math.min(window.innerWidth - chromeH, window.innerHeight - chromeV, 1200);
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

    // Draw ground background — per-world texture with organic blotches
    const wIdx = this.currentWorld % 4;
    const palettes: { base: string; variants: string[]; speckles: string[]; wash: string }[] = [
      { base: '#3d6e22', variants: ['#4a7a28', '#336018', '#52872e', '#2e5a15', '#3a6820', '#5c9030', '#68a038'], speckles: ['#2a5a10', '#6b5230', '#88a050'], wash: '#2a5018' }, // battleground
      { base: '#1a3a0e', variants: ['#1e4412', '#2a5518', '#163810', '#224a14', '#0f2a08', '#2e6020', '#3a7028'], speckles: ['#5a3a1a', '#0f2a08', '#6e4a22'], wash: '#0e2805' }, // forest
      { base: '#c8a050', variants: ['#d4aa58', '#ba9040', '#e0b868', '#a88038', '#ccaa55', '#ddc070', '#eac88a'], speckles: ['#8a7050', '#b8924a', '#704828'], wash: '#a07830' }, // desert
      { base: '#e8e8f0', variants: ['#dde0ea', '#f0f0f8', '#ccd0dd', '#e0e4ee', '#d0d8e8', '#f4f4fa', '#ffffff'], speckles: ['#aaccee', '#7a7060', '#b0c8e0'], wash: '#bed0e8' }, // snow
    ];
    const pal = palettes[wIdx];
    ctx.fillStyle = pal.base;
    ctx.fillRect(0, 0, mapSize, mapSize);
    // Soft large organic blotches for biome mottling
    for (let i = 0; i < 500; i++) {
      const bx = Math.random() * mapSize;
      const by = Math.random() * mapSize;
      const br = 10 + Math.random() * 90;
      ctx.globalAlpha = 0.3 + Math.random() * 0.45;
      ctx.fillStyle = pal.variants[Math.floor(Math.random() * pal.variants.length)];
      ctx.beginPath();
      ctx.ellipse(bx, by, br, br * (0.5 + Math.random() * 0.9), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Meandering paths/cracks/rivulets (biome-appropriate)
    for (let i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.2;
      ctx.strokeStyle = pal.wash;
      ctx.lineWidth = 1.5 + Math.random() * 3;
      ctx.beginPath();
      let cx = Math.random() * mapSize, cy = Math.random() * mapSize;
      ctx.moveTo(cx, cy);
      const segs = 6 + Math.floor(Math.random() * 8);
      let ang = Math.random() * Math.PI * 2;
      for (let s = 0; s < segs; s++) {
        ang += (Math.random() - 0.5) * 1.1;
        cx += Math.cos(ang) * (15 + Math.random() * 40);
        cy += Math.sin(ang) * (15 + Math.random() * 40);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // Tiny speckles (grass blades / ice / pebbles)
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 1400; i++) {
      const sx = Math.random() * mapSize;
      const sy = Math.random() * mapSize;
      ctx.fillStyle = pal.speckles[Math.floor(Math.random() * pal.speckles.length)];
      ctx.fillRect(sx, sy, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    ctx.globalAlpha = 1;
    // Soft vignette for depth
    const grad = ctx.createRadialGradient(mapSize / 2, mapSize / 2, mapSize * 0.3, mapSize / 2, mapSize / 2, mapSize * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
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

    // Legend — overlaid on phones so it doesn't eat map space.
    const legend = document.createElement('div');
    legend.style.cssText = `color:#ccc;font-family:sans-serif;font-size:${legendSize}px;margin-top:${legendMargin}px;display:flex;gap:${isShort ? 8 : 15}px;flex-wrap:wrap;justify-content:center;${isShort ? 'position:absolute;bottom:4px;left:50%;transform:translateX(-50%);z-index:2;background:rgba(0,0,0,0.55);padding:2px 6px;border-radius:4px;margin-top:0;pointer-events:none;' : ''}`;
    legend.innerHTML = [
      '<span style="color:#5a6a5a">● Mountains</span>',
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

    // --- Xbox controller: move crosshair with stick/D-pad, A to land ---
    let gpRaf = 0;
    let gpConfirmPrev = false;
    const redrawAtMarker = () => {
      ctx.putImageData(cleanMap, 0, 0);
      drawMarker();
    };
    redrawAtMarker();
    const gpPoll = () => {
      const pads = navigator.getGamepads?.();
      if (pads) {
        for (const gp of pads) {
          if (!gp) continue;
          const ax = gp.axes[0] || 0;
          const ay = gp.axes[1] || 0;
          const dx = (Math.abs(ax) > 0.2 ? ax : 0)
            + (gp.buttons[15]?.pressed ? 1 : 0)
            - (gp.buttons[14]?.pressed ? 1 : 0);
          const dy = (Math.abs(ay) > 0.2 ? ay : 0)
            + (gp.buttons[13]?.pressed ? 1 : 0)
            - (gp.buttons[12]?.pressed ? 1 : 0);
          if (dx !== 0 || dy !== 0) {
            const speed = 6;
            markerX = Math.max(0, Math.min(mapSize, markerX + dx * speed));
            markerY = Math.max(0, Math.min(mapSize, markerY + dy * speed));
            redrawAtMarker();
          }
          const confirm = !!gp.buttons[0]?.pressed || !!gp.buttons[9]?.pressed;
          if (confirm && !gpConfirmPrev) {
            const rect = canvas.getBoundingClientRect();
            cancelAnimationFrame(gpRaf);
            land(rect.left + markerX, rect.top + markerY);
            return;
          }
          gpConfirmPrev = confirm;
          break;
        }
      }
      gpRaf = requestAnimationFrame(gpPoll);
    };
    gpRaf = requestAnimationFrame(gpPoll);
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

    // === REAL TINY T-REX ARMS — comically small ===
    const armPivots: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.55, 2.95, 1.1);
      trex.add(armPivot);
      // Slim shoulder stub
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.08), mat(bodyLight));
      upperArm.position.y = -0.09;
      armPivot.add(upperArm);
      // Slimmer forearm
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.06), mat(bodyMid));
      forearm.position.set(0, -0.24, 0.03);
      armPivot.add(forearm);
      // 2-fingered hand (T-Rex had 2 fingers!)
      for (const f of [-1, 1]) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), mat(bodyDark));
        finger.position.set(f * 0.025, -0.33, 0.03);
        armPivot.add(finger);
        const fClaw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 3), smoothMat(clawCol, 0.3));
        fClaw.position.set(f * 0.025, -0.38, 0.03);
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
      if (this.paused) {
        this.threeRenderer.render(this.scene3d, this.camera);
        return;
      }
      this.updatePlayer(dt);
      this.updateNPCs(dt);
      this.updateBullets(dt);
      this.updateCars(dt);
      this.updateTRexEatAnim(dt);
      if (this.isMultiplayer) this.updateMultiplayer(dt);
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      if (this.carToggleCooldown > 0) this.carToggleCooldown -= dt;
      this.checkPickups();
      // Update health bars
      this.updateHealthBar(this.playerHealthCtx, this.playerHealthTex, this.playerHP, this.playerMaxHP);
      for (const npc of this.npcs) {
        if (!npc.dead) {
          this.updateHealthBar(npc.healthCtx, npc.healthTex, npc.hp, 8);
          // Make health bar face camera
          npc.healthBar.lookAt(this.camera.position);
        }
      }
      this.playerHealthBar.lookAt(this.camera.position);
      // Spawn NPCs based on game mode (no boss — there's no boss in this game).
      const aliveCount = this.npcs.filter(n => !n.dead).length;
      const isSnowWorld = this.currentWorld % 4 === 3;
      const aliveSnowmen = isSnowWorld ? this.snowmen.filter(s => s.hp > 0).length : 0;
      const totalAlive = aliveCount + aliveSnowmen;
      if (this.aliveText) {
        this.aliveText.textContent = `Alive: ${totalAlive}`;
      }
      // Win when all NPCs (and snowmen in the snow world) are dead
      if (totalAlive === 0) {
        this.showVictory();
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

      // Update pet position — follow player or sit on mount
      this.updatePet(dt);

      // Snowfall animation
      this.updateSnowfall(dt);
      // Snowmen chase
      this.updateSnowmen(dt);
      // Evil hedgehogs charge
      this.updateEvilHedgehogs(dt);

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

  private createSnowfall(): void {
    // Heavy, real-life snowfall — many large flakes drifting down.
    const count = 8000;
    const positions = new Float32Array(count * 3);
    this.snowVelocities = [];
    const spread = 120;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = px + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * 40 + 2;
      positions[i * 3 + 2] = pz + (Math.random() - 0.5) * spread;
      this.snowVelocities.push(0.8 + Math.random() * 1.4);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.55,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.snowParticles = new THREE.Points(geometry, material);
    this.scene3d.add(this.snowParticles);
  }

  private updateSnowfall(dt: number): void {
    if (!this.snowParticles) return;
    const positions = this.snowParticles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const spread = 80;
    const halfSpread = spread / 2;

    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3 + 1] -= this.snowVelocities[i] * dt;
      // Gentle wind drift
      arr[i * 3] += Math.sin(Date.now() * 0.0008 + i * 0.1) * 0.01;
      arr[i * 3 + 2] += Math.cos(Date.now() * 0.0006 + i * 0.15) * 0.008;

      // Reset if below ground or too far from player
      const dx = arr[i * 3] - px;
      const dz = arr[i * 3 + 2] - pz;
      if (arr[i * 3 + 1] < 0 || Math.abs(dx) > halfSpread || Math.abs(dz) > halfSpread) {
        arr[i * 3] = px + (Math.random() - 0.5) * spread;
        arr[i * 3 + 1] = 25 + Math.random() * 10;
        arr[i * 3 + 2] = pz + (Math.random() - 0.5) * spread;
      }
    }

    positions.needsUpdate = true;
  }

  /** Make an NPC lie on the floor with X eyes instead of removing them */
  private killNpc(npc: { mesh: THREE.Group; head: THREE.Group; dead: boolean; hp: number }): void {
    npc.dead = true;
    npc.hp = 0;
    // Lay on back
    npc.mesh.rotation.x = -Math.PI / 2;
    npc.mesh.position.y = this.getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z) + 0.3;
    // X eyes
    const xMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const s of [-1, 1]) {
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), xMat);
      bar1.rotation.z = Math.PI / 4;
      bar1.position.set(s * 0.08, 0.05, 0.23);
      npc.head.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), xMat);
      bar2.rotation.z = -Math.PI / 4;
      bar2.position.set(s * 0.08, 0.05, 0.23);
      npc.head.add(bar2);
    }
  }

  private snowballTimer = 0;
  private updateSnowmen(dt: number): void {
    const speed = 12;
    this.snowballTimer -= dt;

    for (let i = this.snowmen.length - 1; i >= 0; i--) {
      const s = this.snowmen[i];
      if (s.hp <= 0) continue;

      // Find closest target — player or NPC
      let targetX = this.playerPos.x;
      let targetZ = this.playerPos.z;
      let targetY = this.playerPos.y + 1;
      const dx = targetX - s.mesh.position.x;
      const dz = targetZ - s.mesh.position.z;
      let dist = Math.sqrt(dx * dx + dz * dz);

      // Also check NPCs — attack the closest one
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        const ndx = npc.mesh.position.x - s.mesh.position.x;
        const ndz = npc.mesh.position.z - s.mesh.position.z;
        const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
        if (ndist < dist) {
          dist = ndist;
          targetX = npc.mesh.position.x;
          targetZ = npc.mesh.position.z;
          targetY = npc.mesh.position.y + 1;
        }
      }

      const tdx = targetX - s.mesh.position.x;
      const tdz = targetZ - s.mesh.position.z;

      // Chase target
      if (dist > 5 && dist < 60) {
        s.mesh.position.x += (tdx / dist) * speed * dt;
        s.mesh.position.z += (tdz / dist) * speed * dt;
        s.mesh.position.y = this.getTerrainHeight(s.mesh.position.x, s.mesh.position.z);
        s.mesh.rotation.y = Math.atan2(tdx, tdz);
        s.mesh.rotation.z = Math.sin(Date.now() * 0.003) * 0.05;
      }

      // Throw snowballs when in range
      if (dist < 30 && dist > 2) {
        s.mesh.rotation.y = Math.atan2(tdx, tdz);
        if (!s.throwTimer || s.throwTimer <= 0) {
          // Throw a snowball
          const snowball = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.3 })
          );
          const sx = s.mesh.position.x;
          const sy = s.mesh.position.y + 2.5;
          const sz = s.mesh.position.z;
          snowball.position.set(sx, sy, sz);
          this.scene3d.add(snowball);

          const bSpeed = 20;
          const dirX = tdx / dist;
          const dirZ = tdz / dist;
          // Calculate arc: account for gravity so snowball lands on target
          const travelTime = dist / bSpeed;
          const dirY = ((targetY - sy) / dist) + (4.9 * travelTime) / bSpeed;

          this.bullets.push({
            mesh: snowball,
            vx: dirX * bSpeed,
            vy: dirY * bSpeed,
            vz: dirZ * bSpeed,
            life: 3,
            damage: 8,
            owner: 9999, // special snowman owner — hits player and NPCs
          });

          s.throwTimer = 0.8 + Math.random() * 0.6; // throw every 0.8-1.4s
        }
        s.throwTimer -= dt;
      }
    }
  }

  private createEvilHedgehogs(): void {
    // Shared materials — matched to the plush: golden-tan face, grey spikes, black paws/nose
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.95 });
    const fluffMat = new THREE.MeshStandardMaterial({ color: 0xb89060, roughness: 1.0 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.35 });
    // Fur tones: cream base, mid tan, dark grey-brown tip — picked to mimic the mottled wispy back fur
    const spikeMatBase = new THREE.MeshStandardMaterial({ color: 0xd9c4a0, roughness: 1.0 });
    const spikeMatMid = new THREE.MeshStandardMaterial({ color: 0xa89074, roughness: 1.0 });
    const spikeMatDark = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1.0 });
    const spikeMatWisp = new THREE.MeshStandardMaterial({ color: 0xeeddc0, roughness: 1.0 });
    const spikeMats = [spikeMatBase, spikeMatMid, spikeMatDark, spikeMatWisp];
    const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const fangMat = new THREE.MeshStandardMaterial({ color: 0xfafaf0, roughness: 0.3 });
    const browMat = new THREE.MeshStandardMaterial({ color: 0x1a0a05, roughness: 0.8 });
    const pawMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });

    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;
      const root = new THREE.Group();
      const body = new THREE.Group(); // body bobs separately

      // Squat round body — wider than tall, sits low to ground (matches plush proportions)
      const trunk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), faceMat);
      trunk.scale.set(1.25, 0.75, 1.35);
      trunk.position.y = 0.85;
      body.add(trunk);

      // Big rounded face — front of body, lighter color, no pointy snout
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), faceMat);
      face.scale.set(0.95, 0.85, 0.7);
      face.position.set(0, 0.85, 1.05);
      body.add(face);

      // Bushy fur ring around the face — short cones radiating out (the wispy fluff in the photo)
      const fluffCount = 24;
      for (let f = 0; f < fluffCount; f++) {
        const a = (f / fluffCount) * Math.PI * 2;
        const r = 0.85;
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), fluffMat);
        const px = Math.cos(a) * r * 0.95;
        const py = 0.85 + Math.sin(a) * r * 0.85;
        const pz = 1.05 + Math.cos(a * 0.5) * 0.05;
        tuft.position.set(px, py, pz);
        tuft.lookAt(px * 2, py + (py - 0.85) * 1.5, pz - 0.5);
        tuft.rotateX(Math.PI / 2);
        body.add(tuft);
      }

      // BIG oval black nose — prominent, front and center
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), noseMat);
      nose.scale.set(1.2, 1.0, 0.85);
      nose.position.set(0, 0.78, 1.6);
      body.add(nose);

      // Small black beady eyes (with red glow on top to keep evil vibe)
      for (const sgn of [-1, 1] as const) {
        const eyeBlack = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), noseMat);
        eyeBlack.position.set(sgn * 0.28, 1.08, 1.42);
        body.add(eyeBlack);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeGlowMat);
        eye.position.set(sgn * 0.28, 1.08, 1.48);
        body.add(eye);
        // Angry brow ridge — tilted dark wedge
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.07), browMat);
        brow.position.set(sgn * 0.28, 1.22, 1.42);
        brow.rotation.z = sgn * 0.55;
        body.add(brow);
      }

      // Mouth + two fangs (evil twist)
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), noseMat);
      mouth.position.set(0, 0.6, 1.55);
      body.add(mouth);
      for (const sgn of [-1, 1] as const) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), fangMat);
        fang.rotation.x = Math.PI;
        fang.position.set(sgn * 0.06, 0.55, 1.55);
        body.add(fang);
      }

      // Tiny BLACK rounded ears — small, on top of head, peeking up out of the spikes
      for (const sgn of [-1, 1] as const) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), pawMat);
        ear.scale.set(1, 1, 0.55);
        ear.position.set(sgn * 0.42, 1.5, 0.5);
        body.add(ear);
      }

      // Wispy fur-spikes — InstancedMesh per color so we can spawn HUGE numbers cheaply
      // Unit cone: radius 1, height 1; per-instance scale picks thickness & length
      const spikeCount = 1500;
      const dummy = new THREE.Object3D();
      const buckets: { mat: THREE.Material; transforms: THREE.Matrix4[] }[] = [
        { mat: spikeMats[0], transforms: [] },
        { mat: spikeMats[1], transforms: [] },
        { mat: spikeMats[2], transforms: [] },
        { mat: spikeMats[3], transforms: [] },
      ];
      for (let s = 0; s < spikeCount; s++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.62;
        const r = Math.random();
        const len = r < 0.3 ? 0.35 + Math.random() * 0.25
                  : r < 0.8 ? 0.7 + Math.random() * 0.4
                            : 1.1 + Math.random() * 0.5;
        const thickness = r < 0.3 ? 0.08 : (r < 0.8 ? 0.05 : 0.035);
        const matIdx = r < 0.2 ? 3 : r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
        const px = Math.sin(phi) * Math.cos(theta) * 1.1 * 1.25;
        const py = Math.cos(phi) * 1.1 * 0.75;
        const pz = Math.sin(phi) * Math.sin(theta) * 1.1 * 1.35;
        dummy.position.set(px, 0.85 + py, pz);
        const wob = 0.25;
        dummy.lookAt(
          px * 3 + (Math.random() - 0.5) * wob,
          0.85 + py * 3 + (Math.random() - 0.5) * wob,
          pz * 3 + (Math.random() - 0.5) * wob
        );
        dummy.rotateX(Math.PI / 2);
        // Scale unit cone: x/z = thickness, y = length
        dummy.scale.set(thickness, len, thickness);
        dummy.updateMatrix();
        buckets[matIdx].transforms.push(dummy.matrix.clone());
      }
      // Unit cone geometry shared across all hedgehogs' instanced meshes
      const unitCone = new THREE.ConeGeometry(1, 1, 4);
      for (const b of buckets) {
        if (b.transforms.length === 0) continue;
        const im = new THREE.InstancedMesh(unitCone, b.mat, b.transforms.length);
        for (let k = 0; k < b.transforms.length; k++) {
          im.setMatrixAt(k, b.transforms[k]);
        }
        im.instanceMatrix.needsUpdate = true;
        body.add(im);
      }

      // 4 little BLACK paws — flat ovals sticking out
      for (const lx of [-0.55, 0.55]) {
        for (const lz of [-0.55, 0.55]) {
          const paw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), pawMat);
          paw.scale.set(1.0, 0.45, 1.0);
          paw.position.set(lx, 0.18, lz);
          body.add(paw);
        }
      }

      root.add(body);
      root.position.set(x, this.getTerrainHeight(x, z), z);
      this.scene3d.add(root);
      this.evilHedgehogs.push({
        mesh: root,
        body,
        hp: 30,
        spikeTimer: Math.random() * 2,
        bobPhase: Math.random() * Math.PI * 2,
      });
      this.colliders.push({ x, z, r: 1.4 });
    }
  }

  private updateEvilHedgehogs(dt: number): void {
    const speed = 9;
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.85 });

    for (let i = this.evilHedgehogs.length - 1; i >= 0; i--) {
      const h = this.evilHedgehogs[i];
      if (h.hp <= 0) continue;

      // Find closest target — player or NPC
      let targetX = this.playerPos.x;
      let targetZ = this.playerPos.z;
      let targetY = this.playerPos.y + 0.8;
      const dx0 = targetX - h.mesh.position.x;
      const dz0 = targetZ - h.mesh.position.z;
      let dist = Math.sqrt(dx0 * dx0 + dz0 * dz0);
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        const ndx = npc.mesh.position.x - h.mesh.position.x;
        const ndz = npc.mesh.position.z - h.mesh.position.z;
        const nd = Math.sqrt(ndx * ndx + ndz * ndz);
        if (nd < dist) {
          dist = nd;
          targetX = npc.mesh.position.x;
          targetZ = npc.mesh.position.z;
          targetY = npc.mesh.position.y + 0.8;
        }
      }
      const tdx = targetX - h.mesh.position.x;
      const tdz = targetZ - h.mesh.position.z;

      // Charge target (closer than snowman, more aggressive)
      if (dist > 2 && dist < 70) {
        h.mesh.position.x += (tdx / dist) * speed * dt;
        h.mesh.position.z += (tdz / dist) * speed * dt;
        h.mesh.position.y = this.getTerrainHeight(h.mesh.position.x, h.mesh.position.z);
        h.mesh.rotation.y = Math.atan2(tdx, tdz);
        // Bobbing waddle
        h.bobPhase += dt * 8;
        h.body.position.y = Math.abs(Math.sin(h.bobPhase)) * 0.08;
        h.body.rotation.z = Math.sin(h.bobPhase * 0.5) * 0.08;
      } else {
        h.body.position.y *= 0.9;
        h.body.rotation.z *= 0.9;
      }

      // Spit spikes when in range
      if (dist < 25 && dist > 1.5) {
        h.spikeTimer -= dt;
        if (h.spikeTimer <= 0) {
          const spikeProj = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), spikeMat);
          const sx = h.mesh.position.x + (tdx / dist) * 1.4;
          const sy = h.mesh.position.y + 1.0;
          const sz = h.mesh.position.z + (tdz / dist) * 1.4;
          spikeProj.position.set(sx, sy, sz);
          // Orient spike along travel direction
          spikeProj.lookAt(targetX, targetY, targetZ);
          spikeProj.rotateX(Math.PI / 2);
          this.scene3d.add(spikeProj);

          const bSpeed = 22;
          const dirX = tdx / dist;
          const dirZ = tdz / dist;
          const travelTime = dist / bSpeed;
          const dirY = ((targetY - sy) / dist) + (4.9 * travelTime) / bSpeed;
          this.bullets.push({
            mesh: spikeProj,
            vx: dirX * bSpeed,
            vy: dirY * bSpeed,
            vz: dirZ * bSpeed,
            life: 3,
            damage: 6,
            owner: 9999,
          });
          h.spikeTimer = 1.0 + Math.random() * 0.5;
        }
      }
    }
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
    const isSnow = this.currentWorld % 4 === 3;
    const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeef4, roughness: 0.9 });
    const pineLeafMat = new THREE.MeshStandardMaterial({ color: isSnow ? 0x1a4a1a : 0x1a3a0a });
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
          // Snow cap on each pine layer
          if (isSnow) {
            const snowCap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, 0.5, 7), snowMaterial);
            snowCap.position.y = trunkH * 0.4 + l * 1.2 + 0.7;
            group.add(snowCap);
            // Extra snow draping on edges
            const snowDrape = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.12, 4, 8), snowMaterial);
            snowDrape.rotation.x = Math.PI / 2;
            snowDrape.position.y = trunkH * 0.4 + l * 1.2 + 0.3;
            group.add(snowDrape);
          }
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
            // Snow on branches
            if (isSnow) {
              const branchSnow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 1.2, 5), snowMaterial);
              branchSnow.position.y = branch.position.y + 0.08;
              branchSnow.position.x = branch.position.x;
              branchSnow.rotation.z = branch.rotation.z;
              group.add(branchSnow);
            }
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
          // Snow on top of canopy
          if (isSnow) {
            const snowTop = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), snowMaterial);
            snowTop.position.y = leaf.position.y + r * 0.35;
            snowTop.position.x = leaf.position.x;
            snowTop.position.z = leaf.position.z;
            snowTop.scale.y = 0.4;
            group.add(snowTop);
            // Extra snow clumps on sides
            if (Math.random() > 0.4) {
              const clump = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 5, 4), snowMaterial);
              clump.position.y = leaf.position.y;
              clump.position.x = leaf.position.x + (Math.random() - 0.5) * r;
              clump.position.z = leaf.position.z + (Math.random() - 0.5) * r;
              group.add(clump);
            }
          }
        }

        // Fallen autumn leaves / snow patches on ground under trees
        if (isSnow) {
          // Snow mounds around base of tree
          const snowPatchCount = 3 + Math.floor(Math.random() * 4);
          for (let sp = 0; sp < snowPatchCount; sp++) {
            const sr = 0.4 + Math.random() * 0.8;
            const snowPatch = new THREE.Mesh(new THREE.SphereGeometry(sr, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), snowMaterial);
            snowPatch.rotation.x = 0;
            snowPatch.position.x = (Math.random() - 0.5) * 3;
            snowPatch.position.z = (Math.random() - 0.5) * 3;
            snowPatch.position.y = 0;
            snowPatch.scale.y = 0.3;
            group.add(snowPatch);
          }
        } else if (Math.random() > 0.55) {
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
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xfafcff, roughness: 0.45, metalness: 0.05, emissive: 0x111122, emissiveIntensity: 0.15 });
    const snowShadowMat = new THREE.MeshStandardMaterial({ color: 0xc8d4e8, roughness: 0.55 });
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

      // Snow cap — conical peak that hugs the mountain shape, plus drip-down streaks
      // Cap fraction: how far down the mountain snow extends (top 30-45%)
      const capFrac = 0.30 + Math.random() * 0.15;
      const capH = h * capFrac;
      const capR = r * capFrac * 0.95;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(capR, capH, 12), snowMat);
      // Position: snow sits on top of mountain, peak aligned with mountain peak
      cap.position.set(x, mtnY + h - capH / 2 - 1.5, z);
      cap.castShadow = true;
      this.scene3d.add(cap);

      // Soft snow shadow base — slightly darker blueish ring at the snowline (gives depth)
      const shadowRing = new THREE.Mesh(
        new THREE.ConeGeometry(capR * 1.05, capH * 0.15, 12, 1, true),
        snowShadowMat
      );
      shadowRing.position.set(x, mtnY + h - capH - 1.5, z);
      this.scene3d.add(shadowRing);

      // Bumpy peak — a few small snow lumps on top to break the perfect cone silhouette
      const numLumps = 3 + Math.floor(Math.random() * 3);
      for (let lp = 0; lp < numLumps; lp++) {
        const lumpR = 0.6 + Math.random() * 1.2;
        const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(lumpR, 0), snowMat);
        const la = Math.random() * Math.PI * 2;
        const ld = capR * 0.2 * Math.random();
        lump.position.set(
          x + Math.cos(la) * ld,
          mtnY + h - 1 + lumpR * 0.3,
          z + Math.sin(la) * ld
        );
        lump.scale.y = 0.55 + Math.random() * 0.2;
        lump.rotation.y = Math.random() * Math.PI;
        this.scene3d.add(lump);
      }

      // Snow streaks dripping down the slopes (filling crevices)
      const numStreaks = 5 + Math.floor(Math.random() * 4);
      for (let s = 0; s < numStreaks; s++) {
        const sa = (s / numStreaks) * Math.PI * 2 + Math.random() * 0.4;
        const streakLen = capH * (0.6 + Math.random() * 0.8);
        const streakW = 0.6 + Math.random() * 1.2;
        // Streaks taper down the mountain surface
        const streak = new THREE.Mesh(
          new THREE.ConeGeometry(streakW, streakLen, 5),
          snowMat
        );
        // Place streak following mountain slope: top of streak just below cap
        const slopeFrac = 0.55 + Math.random() * 0.2; // height along mountain
        const streakRadius = r * (1 - slopeFrac) * 0.95;
        streak.position.set(
          x + Math.cos(sa) * streakRadius,
          mtnY + h * slopeFrac,
          z + Math.sin(sa) * streakRadius
        );
        // Tilt streak so its tip points downhill (away from peak)
        streak.lookAt(x + Math.cos(sa) * (streakRadius + 5), mtnY, z + Math.sin(sa) * (streakRadius + 5));
        streak.rotateX(Math.PI / 2);
        this.scene3d.add(streak);
      }

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

  private createWorldExtras(): void {
    const w = this.currentWorld % 4;

    if (w === 1) {
      // FOREST — mushrooms, spider webs, hollow stumps, fireflies
      // Giant mushrooms
      for (let i = 0; i < 20; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const mush = new THREE.Group();
        const stemH = 0.5 + Math.random() * 1.5;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, stemH, 6), new THREE.MeshStandardMaterial({ color: 0xeeddcc }));
        stem.position.y = stemH / 2;
        mush.add(stem);
        const capR = 0.4 + Math.random() * 0.8;
        const capColor = [0xcc2222, 0xdd6622, 0x8844aa, 0xeedd44][Math.floor(Math.random() * 4)];
        const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: capColor }));
        cap.position.y = stemH;
        mush.add(cap);
        // White spots on red mushrooms
        if (capColor === 0xcc2222) {
          for (let s = 0; s < 5; s++) {
            const spot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            const angle = Math.random() * Math.PI * 2;
            const tilt = Math.random() * 0.8;
            spot.position.set(Math.cos(angle) * capR * 0.7 * Math.sin(tilt), stemH + Math.cos(tilt) * capR * 0.5, Math.sin(angle) * capR * 0.7 * Math.sin(tilt));
            spot.lookAt(mush.position.clone().add(new THREE.Vector3(0, stemH + 2, 0)));
            mush.add(spot);
          }
        }
        mush.position.set(x, 0, z);
        this.scene3d.add(mush);
      }
      // Tree stumps
      for (let i = 0; i < 12; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const r = 0.8 + Math.random() * 1.2;
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 1 + Math.random(), 8), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }));
        stump.position.set(x, 0.5, z);
        this.scene3d.add(stump);
        this.colliders.push({ x, z, r: r + 0.3 });
      }
      // Firefly lights
      for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const y = 1 + Math.random() * 4;
        const light = new THREE.PointLight(0xaaff44, 0.5, 8);
        light.position.set(x, y, z);
        this.scene3d.add(light);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), new THREE.MeshBasicMaterial({ color: 0xccff66 }));
        dot.position.copy(light.position);
        this.scene3d.add(dot);
      }
    } else if (w === 2) {
      // DESERT — cacti, sand dunes, ruins, skulls
      // Cacti
      for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const cactus = new THREE.Group();
        const h = 2 + Math.random() * 4;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 8), new THREE.MeshStandardMaterial({ color: 0x2d8a4e, roughness: 0.8 }));
        body.position.y = h / 2;
        cactus.add(body);
        // Arms
        if (Math.random() > 0.3) {
          const armH = 1 + Math.random() * 2;
          const armY = h * 0.4 + Math.random() * h * 0.3;
          const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, armH, 6), new THREE.MeshStandardMaterial({ color: 0x2d8a4e }));
          arm1.position.set(0.6, armY, 0);
          arm1.rotation.z = -0.8;
          cactus.add(arm1);
          const arm1Top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, armH * 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x2d8a4e }));
          arm1Top.position.set(1.1, armY + armH * 0.5, 0);
          cactus.add(arm1Top);
        }
        if (Math.random() > 0.5) {
          const armH = 1 + Math.random() * 1.5;
          const armY = h * 0.3 + Math.random() * h * 0.3;
          const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, armH, 6), new THREE.MeshStandardMaterial({ color: 0x2d8a4e }));
          arm2.position.set(-0.6, armY, 0);
          arm2.rotation.z = 0.8;
          cactus.add(arm2);
        }
        cactus.position.set(x, 0, z);
        this.scene3d.add(cactus);
        this.colliders.push({ x, z, r: 1 });
      }
      // (flat desert — no hills)
      // Ruins — broken columns
      for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 300;
        const ruin = new THREE.Group();
        const colH = 3 + Math.random() * 5;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, colH, 8), new THREE.MeshStandardMaterial({ color: 0xccbbaa, roughness: 0.9 }));
        col.position.y = colH / 2;
        ruin.add(col);
        // Broken top
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), new THREE.MeshStandardMaterial({ color: 0xccbbaa }));
        top.position.y = colH;
        top.rotation.y = Math.random() * Math.PI;
        ruin.add(top);
        // Fallen blocks nearby
        for (let b = 0; b < 3; b++) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.8, 0.4 + Math.random() * 0.5, 0.5 + Math.random() * 0.8), new THREE.MeshStandardMaterial({ color: 0xbbaa99 }));
          block.position.set((Math.random() - 0.5) * 4, 0.2, (Math.random() - 0.5) * 4);
          block.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
          ruin.add(block);
        }
        ruin.position.set(x, 0, z);
        this.scene3d.add(ruin);
        this.colliders.push({ x, z, r: 1.5 });
      }
      // Skulls scattered around
      for (let i = 0; i < 15; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const skull = new THREE.Group();
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshStandardMaterial({ color: 0xeeddcc }));
        head.scale.set(1, 0.9, 1.1);
        skull.add(head);
        // Eye sockets
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat);
        eye1.position.set(0.1, 0.05, 0.25);
        skull.add(eye1);
        const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat);
        eye2.position.set(-0.1, 0.05, 0.25);
        skull.add(eye2);
        skull.position.set(x, 0.2, z);
        skull.rotation.y = Math.random() * Math.PI * 2;
        this.scene3d.add(skull);
      }
    } else {
      // SNOW — snowmen, ice crystals, frozen cabins, aurora lights
      // Shared materials (one set for all snowmen — saves memory and draw calls)
      const evilSnowMat = new THREE.MeshStandardMaterial({ color: 0x8a8a95, roughness: 0.4 });
      const darkSnowMat = new THREE.MeshStandardMaterial({ color: 0x606068, roughness: 0.5 });
      const bloodMat = new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.6 });
      const iceMat = new THREE.MeshStandardMaterial({ color: 0x99bbff });
      const glowRedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
      // Evil Snowmen
      for (let i = 0; i < 12; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const snowman = new THREE.Group();

        // Bottom ball — big, cracked, dark
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), evilSnowMat);
        bottom.position.y = 1; bottom.scale.y = 0.85; snowman.add(bottom);
        // Middle ball — darker
        const mid = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), darkSnowMat);
        mid.position.y = 2.3; snowman.add(mid);
        // Head — menacing
        const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), evilSnowMat);
        headBall.position.y = 3.2; snowman.add(headBall);

        // Blood drips on body
        for (let bd = 0; bd < 6; bd++) {
          const drip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2 + Math.random() * 0.3, 0.04), bloodMat);
          const bAngle = Math.random() * Math.PI * 2;
          drip.position.set(Math.sin(bAngle) * 0.7, 1.8 + Math.random() * 0.8, Math.cos(bAngle) * 0.7);
          snowman.add(drip);
        }

        // DEMONIC HORNS — two curved ice horns
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), iceMat);
          horn.position.set(s * 0.35, 3.7, -0.1);
          horn.rotation.z = s * -0.4;
          horn.rotation.x = -0.2;
          snowman.add(horn);
          const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
          hornTip.position.set(s * 0.48, 3.95, -0.15);
          hornTip.rotation.z = s * -0.5;
          snowman.add(hornTip);
        }

        // Sharp icicle nose — longer, deadlier
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.0, 4), iceMat);
        nose.position.set(0, 3.15, 0.6); nose.rotation.x = Math.PI / 2; snowman.add(nose);

        // HUGE GLOWING RED EYES with dark sockets
        for (const s of [-1, 1]) {
          // Dark eye socket
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), darkMat);
          socket.position.set(s * 0.2, 3.3, 0.45); snowman.add(socket);
          // Glowing red eye
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glowRedMat);
          eye.position.set(s * 0.2, 3.32, 0.48); snowman.add(eye);
          // Angry V-shaped brow — thicker
          const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), darkMat);
          brow.position.set(s * 0.2, 3.5, 0.47); brow.rotation.z = s * 0.5; snowman.add(brow);
        }

        // JAGGED MOUTH — open with teeth and glowing red inside
        // Dark mouth hole — oval shape
        const mouthHole = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0x220000 }));
        mouthHole.scale.set(1.2, 0.5, 0.4);
        mouthHole.position.set(0, 2.95, 0.5); snowman.add(mouthHole);
        // Big sharp icicle teeth — top row
        for (let t = 0; t < 7; t++) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22 + Math.random() * 0.1, 4), iceMat);
          fang.position.set((t - 3) * 0.07, 3.05, 0.53);
          fang.rotation.x = Math.PI; snowman.add(fang);
        }
        // Bottom row
        for (let t = 0; t < 7; t++) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.18 + Math.random() * 0.08, 4), iceMat);
          fang.position.set((t - 3) * 0.07, 2.87, 0.53); snowman.add(fang);
        }
        // Two massive vampire fangs
        for (const s of [-1, 1]) {
          const bigFang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.35, 4),
            new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.9 }));
          bigFang.position.set(s * 0.2, 2.78, 0.53); bigFang.rotation.x = Math.PI; snowman.add(bigFang);
        }

        // CLAW ARMS — thicker, more threatening
        const stickMat = new THREE.MeshStandardMaterial({ color: 0x2a1808 });
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 5), stickMat);
          arm.position.set(s * 1.1, 2.4, 0); arm.rotation.z = s * -0.8; snowman.add(arm);
          // 4 icicle claws per arm — longer and sharper
          for (let c = 0; c < 4; c++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.5, 4), iceMat);
            claw.position.set(s * (1.8 + c * 0.08), 2.8 - c * 0.08, (c - 1.5) * 0.08);
            claw.rotation.z = s * -0.3; claw.rotation.x = 0.2; snowman.add(claw);
          }
        }

        // Evil top hat — taller, more crooked, with skull emblem
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
        const hat1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), hatMat);
        hat1.position.y = 3.75; hat1.rotation.z = 0.15; snowman.add(hat1);
        const hat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.9, 8), hatMat);
        hat2.position.y = 4.2; hat2.rotation.z = 0.15; snowman.add(hat2);
        // Blood red band
        const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 8),
          new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
        hatBand.position.y = 3.85; hatBand.rotation.z = 0.15; snowman.add(hatBand);
        // Skull on hat
        const skullMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.3 });
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), skullMat);
        skull.position.set(0, 3.85, 0.36); skull.scale.set(1, 1.2, 0.5); snowman.add(skull);
        // Skull eye holes
        for (const s of [-1, 1]) {
          const hole = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), darkMat);
          hole.position.set(s * 0.04, 3.87, 0.38); snowman.add(hole);
        }

        // Deep cracks with red glow inside
        const crackMat = new THREE.MeshBasicMaterial({ color: 0x441111 });
        for (let cr = 0; cr < 8; cr++) {
          const crack = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.5 + Math.random() * 0.4, 0.025), crackMat);
          const angle = Math.random() * Math.PI * 2;
          const yy = 1.0 + Math.random() * 1.8;
          crack.position.set(Math.sin(angle) * (yy > 2 ? 0.55 : 0.85), yy, Math.cos(angle) * (yy > 2 ? 0.55 : 0.85));
          crack.rotation.z = (Math.random() - 0.5) * 0.6; snowman.add(crack);
        }

        // Spiky ice shards sticking out of body
        for (let sp = 0; sp < 5; sp++) {
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + Math.random() * 0.3, 4), iceMat);
          const spAngle = Math.random() * Math.PI * 2;
          const spY = 1.2 + Math.random() * 1.5;
          const spR = spY > 2.3 ? 0.65 : 0.9;
          shard.position.set(Math.sin(spAngle) * spR, spY, Math.cos(spAngle) * spR);
          shard.rotation.z = Math.sin(spAngle) * 0.5;
          shard.rotation.x = Math.cos(spAngle) * 0.5;
          snowman.add(shard);
        }

        // Small rock buttons — 3 down the front of the chest (mid ball)
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
        const rockMatDk = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95 });
        const buttonY = [1.85, 2.25, 2.65];
        const buttonZ = [0.78, 0.82, 0.78];
        for (let cb = 0; cb < 3; cb++) {
          const rock = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), cb % 2 === 0 ? rockMat : rockMatDk);
          rock.scale.set(1.1, 0.9, 1.0);
          rock.rotation.set(Math.random(), Math.random(), Math.random());
          rock.position.set(0, buttonY[cb], buttonZ[cb]); snowman.add(rock);
        }
        snowman.position.set(x, this.getTerrainHeight(x, z), z);
        this.scene3d.add(snowman);
        this.snowmen.push({ mesh: snowman, hp: 50, throwTimer: Math.random() * 2 });
      }
      // Ice crystals
      for (let i = 0; i < 20; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        const h = 1 + Math.random() * 3;
        const crystal = new THREE.Mesh(
          new THREE.ConeGeometry(0.3 + Math.random() * 0.5, h, 5),
          new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.3 })
        );
        crystal.position.set(x, h / 2, z);
        this.scene3d.add(crystal);
        // Cluster of smaller crystals
        for (let c = 0; c < 3; c++) {
          const ch = h * (0.3 + Math.random() * 0.4);
          const cc = new THREE.Mesh(
            new THREE.ConeGeometry(0.15 + Math.random() * 0.25, ch, 5),
            new THREE.MeshStandardMaterial({ color: 0xbbddff, transparent: true, opacity: 0.6, roughness: 0.1 })
          );
          cc.position.set(x + (Math.random() - 0.5) * 1.5, ch / 2, z + (Math.random() - 0.5) * 1.5);
          cc.rotation.z = (Math.random() - 0.5) * 0.4;
          this.scene3d.add(cc);
        }
        this.colliders.push({ x, z, r: 1 });
      }
      // Frozen cabins
      for (let i = 0; i < 5; i++) {
        const x = (Math.random() - 0.5) * 350;
        const z = (Math.random() - 0.5) * 350;
        const cabin = new THREE.Group();
        // Walls
        const walls = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 1 }));
        walls.position.y = 1.5;
        cabin.add(walls);
        // Roof
        const roofGeo = new THREE.ConeGeometry(4, 2, 4);
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xeeeef4 }));
        roof.position.y = 4;
        roof.rotation.y = Math.PI / 4;
        cabin.add(roof);
        // Snow on roof
        const snowRoof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 4.2), new THREE.MeshStandardMaterial({ color: 0xf0f0f8 }));
        snowRoof.position.y = 3.1;
        cabin.add(snowRoof);
        // Door
        const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
        door.position.set(0, 1.1, 2.05);
        cabin.add(door);
        // Window light
        const windowLight = new THREE.PointLight(0xffaa44, 1, 10);
        windowLight.position.set(0, 2, 0);
        cabin.add(windowLight);
        cabin.position.set(x, 0, z);
        cabin.rotation.y = Math.random() * Math.PI * 2;
        this.scene3d.add(cabin);
        this.colliders.push({ x, z, r: 4 });
      }
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

    // Always sync the latest drawn skin into the legacy key so the user
    // doesn't have to re-open the Draw-on-Skin scene every match.
    // Priority: active skin id -> first skin in list -> leave legacy key as-is.
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

    // Attach a 3rd-person AR rifle to the torso (chest level) — visible only when the player
    // has an AR equipped. Same position as the title-scene bots so it matches.
    const p3rdGunGroup = new THREE.Group();
    p3rdGunGroup.position.set(0.15, 0.35, 0.45);
    p3rdGunGroup.rotation.y = Math.PI;
    p3rdGunGroup.visible = false;
    new GLTFLoader().load(((import.meta.env?.BASE_URL ?? '/')) + 'models/ar.glb', (gltf) => {
      const ar = gltf.scene;
      const bb = new THREE.Box3().setFromObject(ar);
      const sz = new THREE.Vector3();
      bb.getSize(sz);
      const longest = Math.max(sz.x, sz.y, sz.z) || 1;
      const fit = 1.5 / longest;
      ar.scale.setScalar(fit);
      const cx = (bb.min.x + bb.max.x) / 2 * fit;
      const cy = (bb.min.y + bb.max.y) / 2 * fit;
      const cz = (bb.min.z + bb.max.z) / 2 * fit;
      ar.position.set(-cx, -cy, -cz);
      p3rdGunGroup.add(ar);
    });
    torso.add(p3rdGunGroup);
    this.pThirdGun = p3rdGunGroup;

    // Attach equipped armor meshes
    this.attachArmorMeshes(torso, headGroup, hips, leftThigh, rightThigh, leftShin, rightShin, leftUpperArm, rightUpperArm);

    // Health bar above player
    const { sprite, ctx, texture } = this.createHealthBarSprite();
    sprite.position.set(0, 2.5, 0);
    root.add(sprite);
    this.playerHealthBar = sprite;
    this.playerHealthCtx = ctx;
    this.playerHealthTex = texture;

    // Spawn pet if equipped
    this.spawnPet();
  }

  private spawnPet(): void {
    const equippedTypes = getEquippedPets();
    if (equippedTypes.length === 0) return;
    this.pets = [];
    for (const petType of equippedTypes) {
      this.spawnSinglePet(petType);
    }
  }

  private spawnSinglePet(petType: string): void {
    const pet = new THREE.Group();
    const petLegs: THREE.Mesh[] = [];
    const petWings: THREE.Mesh[] = [];
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });

    const addLegs = (pet: THREE.Group, mat: THREE.MeshStandardMaterial, w: number, h: number, sx: number, y: number, fz: number, bz: number) => {
      for (const s of [-1, 1]) {
        for (const fb of [bz, fz]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
          leg.position.set(s * sx, y, fb);
          pet.add(leg);
          petLegs.push(leg);
        }
      }
    };

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
      addLegs(pet, mat, 0.07, 0.2, 0.12, -0.22, 0.15, -0.15);
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
      addLegs(pet, mat, 0.05, 0.18, 0.08, -0.19, 0.14, -0.14);
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
        petWings.push(wing);
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
        petLegs.push(foot);
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
        petWings.push(wing);
      }
      addLegs(pet, mat, 0.06, 0.15, 0.1, -0.18, 0.12, -0.12);
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
      // Round body
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), mat));
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), mat);
      head.position.set(0, 0.1, 0.2); pet.add(head);
      // Long ears
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), mat);
        ear.position.set(s * 0.06, 0.3, 0.18); ear.rotation.z = s * 0.1; pet.add(ear);
        const earInner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02),
          new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
        earInner.position.set(s * 0.06, 0.3, 0.2); earInner.rotation.z = s * 0.1; pet.add(earInner);
      }
      // Big back legs, small front legs
      for (const s of [-1, 1]) {
        const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), mat);
        frontLeg.position.set(s * 0.08, -0.17, 0.1); pet.add(frontLeg); petLegs.push(frontLeg);
        const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), mat);
        backLeg.position.set(s * 0.1, -0.18, -0.1); pet.add(backLeg); petLegs.push(backLeg);
      }
      // Fluffy tail
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), mat);
      tail.position.set(0, 0.02, -0.18); pet.add(tail);
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
        eye.position.set(s * 0.06, 0.13, 0.29); pet.add(eye);
      }
      // Nose
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
      nose.position.set(0, 0.06, 0.29); pet.add(nose);
    } else if (petType === 'turtle') {
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x2a6e2a, roughness: 0.6 });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0x6aaa4a, roughness: 0.8 });
      // Shell — dome shape from flat box
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.4), shellMat);
      shell.position.set(0, 0.04, 0); pet.add(shell);
      // Shell top
      const shellTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.32), shellMat);
      shellTop.position.set(0, 0.14, 0); pet.add(shellTop);
      // Shell pattern
      const patternMat = new THREE.MeshStandardMaterial({ color: 0x1a5a1a });
      for (let i = -1; i <= 1; i++) {
        const hex = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), patternMat);
        hex.position.set(i * 0.1, 0.2, 0); pet.add(hex);
      }
      // Head — poking out front
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), skinMat);
      head.position.set(0, 0.0, 0.26); pet.add(head);
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.04, 0.04, 0.33); pet.add(eye);
      }
      // Short stubby legs
      for (const s of [-1, 1]) {
        for (const fb of [-0.12, 0.12]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.08), skinMat);
          leg.position.set(s * 0.16, -0.1, fb); pet.add(leg); petLegs.push(leg);
        }
      }
      // Tail
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), skinMat);
      tail.position.set(0, -0.04, -0.22); pet.add(tail);
    } else if (petType === 'fox') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe06020, roughness: 0.8 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
      // Body
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.45), mat));
      // White belly
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), whiteMat);
      belly.position.set(0, -0.08, 0.02); pet.add(belly);
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), mat);
      head.position.set(0, 0.06, 0.3); pet.add(head);
      // Pointy snout
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), whiteMat);
      snout.position.set(0, 0.0, 0.42); pet.add(snout);
      // Nose
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), darkMat);
      nose.position.set(0, 0.02, 0.49); pet.add(nose);
      // Big pointy ears
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), mat);
        ear.position.set(s * 0.08, 0.2, 0.28); pet.add(ear);
        const earInner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), darkMat);
        earInner.position.set(s * 0.08, 0.2, 0.3); pet.add(earInner);
      }
      addLegs(pet, mat, 0.05, 0.18, 0.1, -0.19, 0.14, -0.14);
      // Big fluffy tail — white tip
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.25), mat);
      tail.position.set(0, 0.08, -0.32); tail.rotation.x = 0.6; pet.add(tail);
      const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), whiteMat);
      tailTip.position.set(0, 0.18, -0.42); pet.add(tailTip);
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.06, 0.1, 0.4); pet.add(eye);
      }
    } else if (petType === 'penguin') {
      const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
      const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff8822 });
      // Body — black
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), blackMat));
      // White belly
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.02), whiteMat);
      belly.position.set(0, -0.01, 0.1); pet.add(belly);
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), blackMat);
      head.position.set(0, 0.2, 0); pet.add(head);
      // Eyes — white patches
      for (const s of [-1, 1]) {
        const patch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), whiteMat);
        patch.position.set(s * 0.05, 0.22, 0.09); pet.add(patch);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), darkMat);
        eye.position.set(s * 0.05, 0.22, 0.1); pet.add(eye);
      }
      // Beak
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), orangeMat);
      beak.position.set(0, 0.16, 0.11); pet.add(beak);
      // Flippers (wings)
      for (const s of [-1, 1]) {
        const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.1), blackMat);
        flipper.position.set(s * 0.12, 0.0, 0); flipper.rotation.z = s * 0.2; pet.add(flipper);
        petWings.push(flipper);
      }
      // Feet
      for (const s of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.1), orangeMat);
        foot.position.set(s * 0.06, -0.17, 0.03); pet.add(foot);
        petLegs.push(foot);
      }
    } else if (petType === 'hamster') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xddaa66, roughness: 0.9 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.9 });
      // Round chubby body
      pet.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), mat));
      // White belly
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), whiteMat);
      belly.position.set(0, -0.05, 0.02); pet.add(belly);
      // Big round head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.16), mat);
      head.position.set(0, 0.1, 0.14); pet.add(head);
      // Puffy cheeks
      for (const s of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), whiteMat);
        cheek.position.set(s * 0.1, 0.06, 0.16); pet.add(cheek);
      }
      // Tiny round ears
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.03), mat);
        ear.position.set(s * 0.08, 0.22, 0.12); pet.add(ear);
      }
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
        eye.position.set(s * 0.05, 0.13, 0.22); pet.add(eye);
      }
      // Nose
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffaaaa }));
      nose.position.set(0, 0.08, 0.22); pet.add(nose);
      // Tiny legs
      for (const s of [-1, 1]) {
        for (const fb of [-0.06, 0.06]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), mat);
          leg.position.set(s * 0.08, -0.12, fb); pet.add(leg); petLegs.push(leg);
        }
      }
      // Tiny tail
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat);
      tail.position.set(0, 0.0, -0.12); pet.add(tail);
    } else if (petType === 'snake') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x44aa22, roughness: 0.6 });
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xaacc44 });
      // Segmented body — chain of boxes
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat);
        seg.position.set(Math.sin(i * 0.4) * 0.06, 0, -i * 0.09);
        pet.add(seg);
      }
      // Head — slightly bigger
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), mat);
      head.position.set(0, 0.02, 0.1); pet.add(head);
      // Eyes
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        eye.position.set(s * 0.04, 0.06, 0.16); pet.add(eye);
      }
      // Tongue
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xff2222 }));
      tongue.position.set(0, 0.0, 0.2); pet.add(tongue);
      // Belly stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.5), bellyMat);
      stripe.position.set(0, -0.04, -0.15); pet.add(stripe);
    }

    pet.scale.set(0.8, 0.8, 0.8);
    pet.position.copy(this.playerPos);
    this.scene3d.add(pet);
    this.pets.push({ mesh: pet, type: petType, legs: petLegs, wings: petWings, phase: 0 });
  }

  private updatePet(dt: number): void {
    if (this.pets.length === 0) return;

    // Spread angles so pets fan out behind/beside the player
    const angleOffsets = [0, -0.8, 0.8];

    for (let pi = 0; pi < this.pets.length; pi++) {
      const p = this.pets[pi];
      const prevX = p.mesh.position.x;
      const prevZ = p.mesh.position.z;

      if (this.playerInCar >= 0) {
        const car = this.cars[this.playerInCar];
        if (car) {
          const dinoScale = car.mesh.scale.y;
          const bodyY = car.bodyGroup ? car.bodyGroup.position.y : 2.0;
          const bodyHalfH = 0.7;
          const seatHeight = (bodyY + bodyHalfH) * dinoScale;
          const offsetBack = 0.5 + pi * 0.4;
          const sideOffset = angleOffsets[pi] || 0;
          const angle = car.mesh.rotation.y;
          p.mesh.position.set(
            car.mesh.position.x + Math.sin(angle) * offsetBack + Math.sin(angle + Math.PI / 2) * sideOffset,
            car.mesh.position.y + seatHeight + 0.3,
            car.mesh.position.z + Math.cos(angle) * offsetBack + Math.cos(angle + Math.PI / 2) * sideOffset,
          );
          p.mesh.rotation.y = angle;
        }
      } else {
        const followDist = 1.5 + pi * 0.5;
        // Forward is (-sin, -cos) of lookAngle, so behind is (+sin, +cos).
        const behindAngle = this.lookAngle + (angleOffsets[pi] || 0) * 0.5;
        const targetX = this.playerPos.x + Math.sin(behindAngle) * followDist;
        const targetZ = this.playerPos.z + Math.cos(behindAngle) * followDist;
        const targetY = this.getTerrainHeight(targetX, targetZ) + 0.3;

        const speed = 6 * dt;
        p.mesh.position.x += (targetX - p.mesh.position.x) * Math.min(speed, 1);
        p.mesh.position.z += (targetZ - p.mesh.position.z) * Math.min(speed, 1);
        p.mesh.position.y += (targetY - p.mesh.position.y) * Math.min(speed, 1);

        const dx = this.playerPos.x - p.mesh.position.x;
        const dz = this.playerPos.z - p.mesh.position.z;
        if (dx * dx + dz * dz > 0.01) {
          p.mesh.rotation.y = Math.atan2(dx, dz);
        }

        if (p.type === 'bird') p.mesh.position.y += 1.2;
        if (p.type === 'dragon') p.mesh.position.y += 0.6;
        if (p.type === 'penguin') p.mesh.position.y += 0.1;
      }

      // Animate legs and wings
      const movedX = p.mesh.position.x - prevX;
      const movedZ = p.mesh.position.z - prevZ;
      const moveSpeed = Math.sqrt(movedX * movedX + movedZ * movedZ);
      const isMoving = moveSpeed > 0.005;

      if (isMoving) {
        p.phase += dt * 12;
      } else {
        p.phase *= 0.9;
      }

      const swing = Math.sin(p.phase) * 0.5;
      for (let i = 0; i < p.legs.length; i++) {
        const leg = p.legs[i];
        const sign = i % 2 === 0 ? 1 : -1;
        if (p.type === 'turtle') {
          leg.rotation.x = swing * sign * 0.3;
        } else if (p.type === 'snake') {
          // no legs
        } else {
          leg.rotation.x = swing * sign;
        }
      }

      if (p.wings.length > 0) {
        const flap = Math.sin(p.phase * 1.5) * 0.6;
        for (let i = 0; i < p.wings.length; i++) {
          const wing = p.wings[i];
          const side = i === 0 ? 1 : -1;
          wing.rotation.z = side * (-0.3 + flap);
        }
      }

      if (p.type === 'snake') {
        const t = this.clock.elapsedTime;
        const children = p.mesh.children;
        for (let i = 0; i < Math.min(6, children.length); i++) {
          children[i].position.x = Math.sin(t * 3 + i * 0.8) * 0.06;
        }
      }
    }
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
      this.cheesePickups.push({ group, picked: false, name: 'pizza' });
    }
  }

  private updateAmmoText(): void {
    if (!this.ammoText) return;
    if (this.playerGun === 'None') {
      this.ammoText.textContent = 'Bullets: —';
      this.ammoText.style.color = '#888';
      return;
    }
    const wep = Object.values(WEAPONS).find(w => w.name === this.playerGun);
    if (!wep || wep.type === 'melee') {
      this.ammoText.textContent = 'Bullets: ∞'; // melee weapons don't use ammo
      this.ammoText.style.color = '#ffeebb';
      return;
    }
    this.ammoText.textContent = 'Bullets: ' + this.playerAmmo;
    this.ammoText.style.color = this.playerAmmo === 0 ? '#ff6644'
      : this.playerAmmo < 8 ? '#ffaa44'
      : '#ffeebb';
  }

  private createAmmo(): void {
    // Bullet box: a small wooden crate with brass bullet tips poking out the top.
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4828, roughness: 0.85 });
    const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.3, metalness: 0.85 });
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.4, metalness: 0.7 });

    for (let i = 0; i < 150; i++) {
      const group = new THREE.Group();

      // Crate body
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), woodMat);
      crate.position.y = 0.2;
      crate.castShadow = true;
      group.add(crate);

      // Dark trim along edges
      for (const ex of [-0.31, 0.31]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.47), woodDarkMat);
        edge.position.set(ex, 0.2, 0);
        group.add(edge);
      }

      // Bullet rounds standing up on top
      const rows = 3;
      const cols = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = (c - (cols - 1) / 2) * 0.1;
          const bz = (r - (rows - 1) / 2) * 0.1;

          // Brass casing
          const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6), brassMat);
          casing.position.set(bx, 0.46, bz);
          group.add(casing);

          // Lead tip
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.05, 6), leadMat);
          tip.position.set(bx, 0.545, bz);
          group.add(tip);
        }
      }

      // Yellow "AMMO" tag (small flag) so it's spottable from a distance
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0xffcc22, emissive: 0x885500, emissiveIntensity: 0.6 }));
      tag.position.set(0, 0.7, 0.23);
      group.add(tag);

      const ax = (Math.random() - 0.5) * 900;
      const az = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(ax, az)) continue;
      group.position.set(ax, this.getTerrainHeight(ax, az), az);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene3d.add(group);
      this.ammoPickups.push({ group, picked: false });
    }
  }

  private createCookies(): void {
    // Chocolate-chip cookie — round dough disc with darker chips on top
    const doughMat = new THREE.MeshStandardMaterial({ color: 0xd9a868, roughness: 0.85 });
    const doughDarkMat = new THREE.MeshStandardMaterial({ color: 0xb6884a, roughness: 0.85 });
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x2a160a, roughness: 0.5 });

    for (let i = 0; i < 200; i++) {
      const group = new THREE.Group();
      const sc = 0.8 + Math.random() * 0.4;

      // Dough disc, slightly thicker in middle
      const dough = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.34, 0.08, 14, 1),
        doughMat,
      );
      dough.castShadow = true;
      group.add(dough);

      // Slightly darker bottom (baked underside)
      const bottom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.36, 0.012, 14, 1),
        doughDarkMat,
      );
      bottom.position.y = -0.04;
      group.add(bottom);

      // Random browning spots on top
      for (let s = 0; s < 6; s++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), doughDarkMat);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.26;
        spot.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
        spot.scale.y = 0.25;
        group.add(spot);
      }

      // Chocolate chips poking out of the top
      const chipCount = 7 + Math.floor(Math.random() * 4);
      for (let c = 0; c < chipCount; c++) {
        const chip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 5), chipMat);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.26;
        chip.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
        chip.rotation.x = (Math.random() - 0.5) * 0.4;
        chip.rotation.z = (Math.random() - 0.5) * 0.4;
        group.add(chip);
      }

      group.scale.setScalar(sc);
      const cx = (Math.random() - 0.5) * 900;
      const cz = (Math.random() - 0.5) * 900;
      if (this.isOnRoad(cx, cz)) continue;
      group.position.set(cx, this.getTerrainHeight(cx, cz) + 0.08, cz);
      group.rotation.y = Math.random() * Math.PI * 2;
      group.rotation.x = (Math.random() - 0.5) * 0.1;
      group.rotation.z = (Math.random() - 0.5) * 0.1;
      this.scene3d.add(group);
      this.cheesePickups.push({ group, picked: false, name: 'cookie' });
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

      // Place in world — keep NPCs at least 80 units away from the player's landing spot
      // so they don't spawn right on top of you.
      const safePx = this.startLandX ?? 0;
      const safePz = this.startLandZ ?? 0;
      let x = 0, z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = (Math.random() - 0.5) * 800;
        z = (Math.random() - 0.5) * 800;
        const dx = x - safePx;
        const dz = z - safePz;
        if (dx * dx + dz * dz > 80 * 80) break; // far enough — done
      }
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
        hp: 8,
        dead: false,
        healthBar: hb.sprite,
        healthCtx: hb.ctx,
        healthTex: hb.texture,
      });
    }
  }

  private createCars(): void {
    const worldType = this.currentWorld % 4;
    if (worldType === 2) { this.createDesertAnimals(); return; }
    if (worldType === 3) { this.createSnowAnimals(); return; }
    if (worldType === 1) { this.createForestAnimals(); return; }
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

    // Real iguana-skin photograph used for all T-Rexes — gives them authentic scales.
    const baseUrl = (import.meta.env?.BASE_URL ?? '/');
    const trexSkin = new THREE.TextureLoader().load(baseUrl + 'textures/trex_skin.jpg');
    trexSkin.wrapS = trexSkin.wrapT = THREE.RepeatWrapping;
    trexSkin.repeat.set(3, 3);
    trexSkin.colorSpace = THREE.SRGBColorSpace;

    // Real 3D T-Rex model (.glb from Poly Pizza, rigged with Walk/Run/Idle animations).
    // Once loaded, we clone the rig onto each T-Rex and play the Walk animation so the legs move.
    const glbT_RexHolders: THREE.Group[] = [];
    const proceduralT_RexParts: THREE.Group[] = [];
    const carsWaitingForGlb: typeof this.cars = [];
    new GLTFLoader().load(baseUrl + 'models/trex.glb', (gltf) => {
      const src = gltf.scene;
      const animations = gltf.animations;
      const walkClip = animations.find(a => /walk/i.test(a.name)) ?? animations[0];
      // Attack clip = mouth-opening lunge; we play it as a one-shot when the T-Rex roars.
      const attackClip = animations.find(a => /attack|roar|bite/i.test(a.name));
      const deathClip = animations.find(a => /death|die/i.test(a.name));

      const bb = new THREE.Box3().setFromObject(src);
      const size = new THREE.Vector3();
      bb.getSize(size);
      const longest = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 9;
      const fitScale = targetSize / longest;
      const offsetY = -bb.min.y * fitScale;

      for (let i = 0; i < glbT_RexHolders.length; i++) {
        const holder = glbT_RexHolders[i];
        // SkeletonUtils.clone() preserves rigging properly (a regular .clone() shares bones).
        const clone = cloneSkinned(src) as THREE.Object3D;
        clone.scale.setScalar(fitScale);
        clone.position.y = offsetY;
        holder.add(clone);
        // Hook up animation playback for THIS clone.
        if (walkClip) {
          const mixer = new THREE.AnimationMixer(clone);
          const walkAction = mixer.clipAction(walkClip);
          walkAction.play();
          mixer.setTime(Math.random() * walkClip.duration);
          const car = carsWaitingForGlb[i];
          if (car) {
            car.mixer = mixer;
            // Set up the roar (attack) action — slowed way down so the mouth stays
            // open for the whole length of the actual roar audio.
            if (attackClip) {
              const roarAction = mixer.clipAction(attackClip);
              roarAction.setLoop(THREE.LoopOnce, 1);
              roarAction.clampWhenFinished = false;
              roarAction.timeScale = 0.35; // ~3x slower so the roar lingers
              car.roarAction = roarAction;
            }
            // Death animation — played when the T-Rex's HP runs out.
            if (deathClip) {
              const deathAction = mixer.clipAction(deathClip);
              deathAction.setLoop(THREE.LoopOnce, 1);
              deathAction.clampWhenFinished = true; // stay collapsed
              car.deathAction = deathAction;
            }
            // Stagger first roar so all 8 don't roar at once.
            car.roarTimer = 1 + Math.random() * 6;
          }
        }
      }
      for (const proc of proceduralT_RexParts) proc.visible = false;
    });

    // T-Rexes (8)
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const rc = rexColors[i % rexColors.length];

      // Each T-Rex shares the photo skin but tints it with a different base color.
      const makeSkinTex = (_base: number, _variation = 0.15) => trexSkin;

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

      // === REAL TINY T-REX ARMS — comically small, just like the real thing ===
      const carArmPivots: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const armPivot = new THREE.Group();
        armPivot.position.set(side * 0.55, 2.95, 1.1); group.add(armPivot);
        // Slim shoulder stub
        const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.08), dmat(bodyLight));
        upperArm.position.y = -0.09; armPivot.add(upperArm);
        // Even slimmer forearm
        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.06), dmat(bodyMid));
        forearm.position.set(0, -0.24, 0.03); armPivot.add(forearm);
        // Two tiny fingers with little claws
        for (const f of [-1, 1]) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), dmat(bodyDark));
          finger.position.set(f * 0.025, -0.33, 0.03); armPivot.add(finger);
          const fClaw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 3), smoothMat2(clawCol, 0.3));
          fClaw.position.set(f * 0.025, -0.38, 0.03); fClaw.rotation.x = Math.PI; armPivot.add(fClaw);
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

      // Register this T-Rex with the GLB loader. Once the real model loads, every T-Rex's
      // procedural pieces (body, neck, head, tail, etc.) get hidden and the real model
      // appears in the holder Group at the same position/scale.
      const glbHolder = new THREE.Group();
      group.add(glbHolder);
      glbT_RexHolders.push(glbHolder);
      // Collect every top-level Group/Mesh of this T-Rex so we can hide them when the GLB loads.
      // (We added: bodyGroup + a bunch of pivots + ridge meshes via group.add().)
      for (const child of group.children) {
        if (child !== glbHolder) proceduralT_RexParts.push(child as THREE.Group);
      }

      // Place T-Rex
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 25; // slower than cars — they're dinosaurs
      const cx = (Math.random() - 0.5) * 800;
      const cz = (Math.random() - 0.5) * 800;
      group.position.set(cx, this.getTerrainHeight(cx, cz), cz);
      group.rotation.y = angle;
      this.scene3d.add(group);

      // T-Rex health bar floating above the head.
      const trexHb = this.createHealthBarSprite();
      trexHb.sprite.position.set(0, 4.5, 0);
      trexHb.sprite.scale.set(3, 0.35, 1);
      group.add(trexHb.sprite);

      const carEntry = {
        mesh: group,
        vx: 0,
        vz: 0,
        speed,
        driver: 'none' as const,
        legPivots: carLegPivots,
        armPivots: carArmPivots,
        tailPivots: carTailPivots,
        jawPivot,
        neckBase,
        neckMid,
        bodyGroup,
        glbHolder,
        runPhase: Math.random() * Math.PI * 2,
        hp: 30,
        maxHp: 30,
        healthBar: trexHb.sprite,
        healthCtx: trexHb.ctx,
        healthTex: trexHb.texture,
      };
      this.cars.push(carEntry);
      carsWaitingForGlb.push(carEntry);
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

  private createAnimalRide(animalType: string, bodyColor: number, bellyColor: number, scale: number, speed: number): void {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 1.2;
    group.add(bodyGroup);

    // BODY — box stretched to animal shape, looks clean
    let bW = 0.9, bH = 0.8, bL = 2.0;
    if (animalType === 'buffalo') { bW = 1.1; bH = 0.9; }
    else if (animalType === 'camel') { bH = 0.7; bL = 2.4; }
    else if (animalType === 'bear') { bW = 1.2; bH = 1.0; bL = 2.2; }
    else if (animalType === 'wolf') { bW = 0.6; bH = 0.6; bL = 2.0; }
    else if (animalType === 'deer' || animalType === 'reindeer') { bW = 0.7; bH = 0.7; bL = 1.8; }
    const body = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bL), mat);
    bodyGroup.add(body);
    // Belly
    const bellyM = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.8, bH * 0.3, bL * 0.7), bellyMat);
    bellyM.position.y = -bH * 0.35; bodyGroup.add(bellyM);

    // LEGS — 4 simple tapered boxes
    const legPivots: { thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }[] = [];
    let legH = 0.65, legW = 0.16;
    if (animalType === 'camel') { legH = 1.0; }
    else if (animalType === 'zebra') { legH = 0.85; }
    else if (animalType === 'buffalo') { legW = 0.22; }
    else if (animalType === 'bear') { legH = 0.55; legW = 0.24; }
    else if (animalType === 'wolf') { legH = 0.7; legW = 0.1; }
    else if (animalType === 'deer') { legH = 0.9; legW = 0.1; }
    else if (animalType === 'reindeer') { legH = 0.85; legW = 0.11; }
    for (const side of [-1, 1]) {
      for (const fb of [-1, 1]) {
        const thighPivot = new THREE.Group();
        thighPivot.position.set(side * bW * 0.35, -bH * 0.5, fb * bL * 0.35);
        bodyGroup.add(thighPivot);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW * 1.2), mat);
        thigh.position.y = -legH * 0.5; thighPivot.add(thigh);
        const shinPivot = new THREE.Group();
        shinPivot.position.y = -legH; thighPivot.add(shinPivot);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(legW * 0.8, legH * 0.8, legW), mat);
        shin.position.y = -legH * 0.4; shinPivot.add(shin);
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(legW * 1.1, 0.1, legW * 1.3), darkMat);
        hoof.position.y = -legH * 0.8; shinPivot.add(hoof);
        legPivots.push({ thighPivot, shinPivot, side });
      }
    }

    // NECK
    const neckBase = new THREE.Group();
    let neckH = 0.5, neckW = 0.3, neckAng = -0.2;
    if (animalType === 'camel') { neckH = 1.4; }
    else if (animalType === 'zebra') { neckH = 0.8; neckAng = -0.35; }
    else if (animalType === 'lion') { neckW = 0.4; neckAng = -0.4; }
    else if (animalType === 'buffalo') { neckW = 0.5; }
    else if (animalType === 'bear') { neckH = 0.35; neckW = 0.5; neckAng = -0.15; }
    else if (animalType === 'wolf') { neckH = 0.45; neckW = 0.25; neckAng = -0.35; }
    else if (animalType === 'deer') { neckH = 0.7; neckW = 0.2; neckAng = -0.3; }
    else if (animalType === 'reindeer') { neckH = 0.65; neckW = 0.22; neckAng = -0.3; }
    neckBase.position.set(0, bH * 0.3, bL * 0.45);
    neckBase.rotation.x = neckAng;
    bodyGroup.add(neckBase);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(neckW, neckH, neckW * 0.8), mat);
    neck.position.y = neckH * 0.5; neckBase.add(neck);

    // HEAD
    const neckMid = new THREE.Group();
    neckMid.position.y = neckH; neckBase.add(neckMid);
    let jawPivot: THREE.Group | undefined;
    const tailPivots: THREE.Group[] = [];

    let hdW = 0.35, hdH = 0.3, hdL = 0.5;
    if (animalType === 'buffalo') { hdW = 0.6; hdH = 0.4; }
    else if (animalType === 'lion') { hdW = 0.55; hdH = 0.4; }
    else if (animalType === 'camel') { hdL = 0.7; }
    else if (animalType === 'zebra') { hdL = 0.6; }
    else if (animalType === 'bear') { hdW = 0.55; hdH = 0.45; hdL = 0.45; }
    else if (animalType === 'wolf') { hdW = 0.3; hdH = 0.25; hdL = 0.5; }
    else if (animalType === 'deer') { hdW = 0.25; hdH = 0.25; hdL = 0.45; }
    else if (animalType === 'reindeer') { hdW = 0.28; hdH = 0.25; hdL = 0.45; }
    const head = new THREE.Mesh(new THREE.BoxGeometry(hdW, hdH, hdL), mat);
    head.position.z = hdL * 0.3; neckMid.add(head);

    // Snout
    const snW = hdW * 0.7; const snH = hdH * 0.6;
    let snL = 0.25;
    if (animalType === 'camel') snL = 0.4;
    else if (animalType === 'zebra') snL = 0.35;
    else if (animalType === 'bear') snL = 0.25;
    else if (animalType === 'wolf') snL = 0.35;
    else if (animalType === 'deer' || animalType === 'reindeer') snL = 0.25;
    if (animalType !== 'bear') {
      const snout = new THREE.Mesh(new THREE.BoxGeometry(snW, snH, snL), mat);
      snout.position.set(0, -hdH * 0.15, hdL * 0.5 + snL * 0.4); neckMid.add(snout);
    }

    // Eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
      eye.position.set(s * hdW * 0.48, hdH * 0.1, hdL * 0.35); neckMid.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4),
        new THREE.MeshBasicMaterial({ color: animalType === 'lion' ? 0x886622 : 0x111100 }));
      pupil.position.set(s * hdW * 0.5, hdH * 0.1, hdL * 0.35 + 0.025); neckMid.add(pupil);
    }

    // Ears
    for (const s of [-1, 1]) {
      const earH = animalType === 'zebra' ? 0.18 : animalType === 'camel' ? 0.08 :
        animalType === 'bear' ? 0.08 : animalType === 'wolf' ? 0.14 :
        (animalType === 'deer' || animalType === 'reindeer') ? 0.12 : 0.1;
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, earH, 0.06), mat);
      ear.position.set(s * hdW * 0.4, hdH * 0.5 + earH * 0.3, hdL * 0.1); neckMid.add(ear);
    }

    // Nose (bear has its own nose in its section)
    if (animalType !== 'bear') {
      const nosePad = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.6, snH * 0.3, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 0.5 }));
      nosePad.position.set(0, -hdH * 0.1, hdL * 0.5 + snL * 0.85); neckMid.add(nosePad);
    }

    // === PER-ANIMAL FEATURES ===

    if (animalType === 'lion') {
      // Mane — big dark brown ring around head, like a real lion
      const maneCol = bodyColor > 0x888888 ? 0x444444 : 0x5a2e0a;
      const maneMat = new THREE.MeshStandardMaterial({ color: maneCol, roughness: 0.95 });
      for (let m = 0; m < 14; m++) {
        const angle = (m / 14) * Math.PI * 2;
        const mane = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.18), maneMat);
        mane.position.set(Math.cos(angle) * 0.38, Math.sin(angle) * 0.35, hdL * 0.0);
        mane.rotation.z = angle; neckMid.add(mane);
      }
      // Lighter chin/face
      const chinMat = new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.8 });
      const chin = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.8, 0.1, snL * 0.7), chinMat);
      chin.position.set(0, -hdH * 0.25, hdL * 0.5 + snL * 0.2); neckMid.add(chin);
      // Jaw
      jawPivot = new THREE.Group();
      jawPivot.position.set(0, -hdH * 0.4, hdL * 0.4); neckMid.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.9, 0.08, snL * 0.9), mat);
      jawPivot.add(jaw);
      // Tail
      const tp = new THREE.Group(); tp.position.set(0, 0, -bL * 0.5); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), mat);
      tail.position.y = -0.5; tp.add(tail);
      const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), maneMat);
      tuft.position.y = -1.0; tp.add(tuft);
      tailPivots.push(tp);

    } else if (animalType === 'camel') {
      // Two humps
      const hump1 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat);
      hump1.position.set(0, bH * 0.65, bL * 0.12); hump1.scale.set(0.6, 0.9, 0.7); bodyGroup.add(hump1);
      const hump2 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat);
      hump2.position.set(0, bH * 0.6, -bL * 0.15); hump2.scale.set(0.6, 0.85, 0.7); bodyGroup.add(hump2);
      // Tail
      const tp = new THREE.Group(); tp.position.set(0, 0, -bL * 0.5); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), mat);
      tail.position.y = -0.3; tp.add(tail);
      tailPivots.push(tp);

    } else if (animalType === 'zebra') {
      // Stripes — black boxes across the body
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
      for (let i = -4; i <= 4; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(bW * 1.02, 0.05, bH * 1.02), stripeMat);
        stripe.position.set(0, 0, i * (bL / 10));
        stripe.rotation.x = Math.PI / 2;
        bodyGroup.add(stripe);
      }
      // Mane — short upright
      const maneMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      for (let i = 0; i < 8; i++) {
        const mane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), maneMat);
        mane.position.set(0, neckH * 0.15 + i * (neckH * 0.1), neckW * 0.3);
        neckBase.add(mane);
      }
      // Tail
      const tp = new THREE.Group(); tp.position.set(0, 0, -bL * 0.5); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), mat);
      tail.position.y = -0.35; tp.add(tail);
      tailPivots.push(tp);

    } else if (animalType === 'bear') {
      // Bears are big and round — shoulder hump, small round ears, short tail
      const hump = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.7, 0.3, 0.6), mat);
      hump.position.set(0, bH * 0.55, bL * 0.2); bodyGroup.add(hump);
      // Big round lighter muzzle — takes up most of the face like a real bear
      const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.8 });
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(hdW * 0.45, 10, 8), muzzleMat);
      muzzle.scale.set(1, 0.8, 1.1);
      muzzle.position.set(0, -hdH * 0.15, hdL * 0.35); neckMid.add(muzzle);
      // Small black nose at top of muzzle
      const bearNose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), darkMat);
      bearNose.position.set(0, hdH * 0.0, hdL * 0.35 + hdW * 0.45); neckMid.add(bearNose);
      // Jaw
      jawPivot = new THREE.Group();
      jawPivot.position.set(0, -hdH * 0.35, hdL * 0.35); neckMid.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.9, 0.08, snL * 0.8), muzzleMat);
      jawPivot.add(jaw);
      // Short stubby tail
      const tp = new THREE.Group(); tp.position.set(0, 0, -bL * 0.48); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), mat);
      tail.position.y = -0.05; tp.add(tail);
      tailPivots.push(tp);

    } else if (animalType === 'wolf') {
      // Wolves are lean — pointy ears, long snout, bushy tail
      // Pointed ears already handled by ear size above
      // Jaw
      jawPivot = new THREE.Group();
      jawPivot.position.set(0, -hdH * 0.35, hdL * 0.35); neckMid.add(jawPivot);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(snW * 0.85, 0.06, snL * 0.9), mat);
      jawPivot.add(jaw);
      // Bushy tail — curves up
      const tp = new THREE.Group(); tp.position.set(0, 0.1, -bL * 0.48); bodyGroup.add(tp);
      tp.rotation.x = 0.4;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), mat);
      tail.position.y = -0.35; tp.add(tail);
      const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), bellyMat);
      tailTip.position.y = -0.7; tp.add(tailTip);
      tailPivots.push(tp);

    } else if (animalType === 'deer') {
      // Deer — slender, antlers on males, white tail
      // Antlers
      const antlerMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.5 });
      for (const s of [-1, 1]) {
        // Main beam going up
        const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), antlerMat);
        a1.position.set(s * hdW * 0.35, hdH * 0.5 + 0.17, 0); neckMid.add(a1);
        // Forward tine
        const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), antlerMat);
        a2.position.set(s * hdW * 0.35, hdH * 0.5 + 0.3, 0.1);
        a2.rotation.x = -0.5; neckMid.add(a2);
        // Side tine
        const a3 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.03), antlerMat);
        a3.position.set(s * (hdW * 0.35 + 0.08), hdH * 0.5 + 0.25, -0.05);
        a3.rotation.z = s * -0.4; neckMid.add(a3);
      }
      // White tail
      const tp = new THREE.Group(); tp.position.set(0, 0.05, -bL * 0.48); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
      tail.position.y = -0.05; tp.add(tail);
      tailPivots.push(tp);

    } else if (animalType === 'reindeer') {
      // Reindeer — like deer but bigger antlers, thicker body
      const antlerMat = new THREE.MeshStandardMaterial({ color: 0x7a6a4a, roughness: 0.5 });
      for (const s of [-1, 1]) {
        // Main beam — tall
        const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.45, 0.045), antlerMat);
        a1.position.set(s * hdW * 0.35, hdH * 0.5 + 0.22, -0.02);
        a1.rotation.z = s * -0.15; neckMid.add(a1);
        // Forward palm/tine
        const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.03), antlerMat);
        a2.position.set(s * hdW * 0.3, hdH * 0.5 + 0.35, 0.12);
        a2.rotation.x = -0.4; neckMid.add(a2);
        // Back tine
        const a3 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), antlerMat);
        a3.position.set(s * (hdW * 0.4 + 0.1), hdH * 0.5 + 0.35, -0.08);
        a3.rotation.z = s * -0.5; neckMid.add(a3);
        // Small brow tine near base
        const a4 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), antlerMat);
        a4.position.set(s * hdW * 0.35, hdH * 0.5 + 0.05, 0.1);
        a4.rotation.x = -0.6; neckMid.add(a4);
      }
      // Short tail
      const tp = new THREE.Group(); tp.position.set(0, 0.05, -bL * 0.48); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), mat);
      tail.position.y = -0.05; tp.add(tail);
      tailPivots.push(tp);

    } else { // buffalo
      // Shoulder hump
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat);
      hump.position.set(0, bH * 0.55, bL * 0.2); hump.scale.set(1, 0.7, 1); bodyGroup.add(hump);
      // Horns — curved outward and up
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 0.4 });
      for (const s of [-1, 1]) {
        const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.35, 6), hornMat);
        h1.position.set(s * 0.4, hdH * 0.3, hdL * 0.05); h1.rotation.z = s * 1.2; neckMid.add(h1);
        const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.25, 6), hornMat);
        h2.position.set(s * 0.55, hdH * 0.5, hdL * 0.05); h2.rotation.z = s * 0.4; neckMid.add(h2);
      }
      // Tail
      const tp = new THREE.Group(); tp.position.set(0, 0, -bL * 0.5); bodyGroup.add(tp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), mat);
      tail.position.y = -0.4; tp.add(tail);
      tailPivots.push(tp);
    }

    group.scale.set(scale, scale, scale);
    const cx2 = (Math.random() - 0.5) * 800;
    const cz2 = (Math.random() - 0.5) * 800;
    group.position.set(cx2, this.getTerrainHeight(cx2, cz2), cz2);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene3d.add(group);
    this.cars.push({ mesh: group, vx: 0, vz: 0, speed, driver: 'none', legPivots, tailPivots, neckBase, neckMid, bodyGroup, jawPivot, runPhase: Math.random() * Math.PI * 2 });
  }

  private createDesertAnimals(): void {
    for (let i = 0; i < 5; i++) this.createAnimalRide('lion', 0xc8a050, 0xe0c880, 2.2, 20);
    for (let i = 0; i < 5; i++) this.createAnimalRide('camel', 0xc4a060, 0xd8c090, 2.5, 14);
    for (let i = 0; i < 5; i++) this.createAnimalRide('zebra', 0xeeeeee, 0xdddddd, 2.0, 22);
    for (let i = 0; i < 5; i++) this.createAnimalRide('buffalo', 0x3a2a1a, 0x5a4a3a, 2.3, 16);
    // Dirt bikes
    const bikeColors = [0xcc2200, 0x0066cc, 0xff6600, 0x22aa22, 0xeeee00, 0x8800cc];
    for (let i = 0; i < 6; i++) this.createDirtBike(bikeColors[i]);
  }

  private createDirtBike(color: number): void {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

    // === WHEELS — thick cylinders on their side ===
    // Front wheel
    const frontWheelGrp = new THREE.Group();
    frontWheelGrp.position.set(0, 0.4, 1.1);
    const fTire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), tireMat);
    fTire.rotation.z = Math.PI / 2;
    frontWheelGrp.add(fTire);
    const fRim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), chromeMat);
    fRim.rotation.z = Math.PI / 2;
    frontWheelGrp.add(fRim);
    const fHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), chromeMat);
    fHub.rotation.z = Math.PI / 2;
    frontWheelGrp.add(fHub);
    group.add(frontWheelGrp);

    // Rear wheel
    const rearWheelGrp = new THREE.Group();
    rearWheelGrp.position.set(0, 0.4, -0.7);
    const rTire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 12), tireMat);
    rTire.rotation.z = Math.PI / 2;
    rearWheelGrp.add(rTire);
    const rRim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12), chromeMat);
    rRim.rotation.z = Math.PI / 2;
    rearWheelGrp.add(rRim);
    const rHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), chromeMat);
    rHub.rotation.z = Math.PI / 2;
    rearWheelGrp.add(rHub);
    group.add(rearWheelGrp);

    // === FRAME — diagonal bar connecting wheels ===
    const frameBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.9), frameMat);
    frameBar.position.set(0, 0.7, 0.2);
    frameBar.rotation.x = 0.15;
    group.add(frameBar);

    // === FRONT FORK — angled down to front wheel ===
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.08), chromeMat);
    fork.position.set(0, 0.7, 1.0);
    fork.rotation.x = -0.25;
    group.add(fork);

    // === REAR SWINGARM — frame to rear wheel ===
    const swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), chromeMat);
    swingarm.position.set(0, 0.45, -0.3);
    group.add(swingarm);

    // === HANDLEBARS ===
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), chromeMat);
    handlebar.position.set(0, 1.15, 0.9);
    group.add(handlebar);
    // Grips
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), blackMat);
      grip.position.set(s * 0.35, 1.15, 0.9);
      group.add(grip);
    }

    // === GAS TANK ===
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), frameMat);
    tank.position.set(0, 0.95, 0.45);
    group.add(tank);

    // === SEAT ===
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.55), seatMat);
    seat.position.set(0, 0.9, -0.05);
    group.add(seat);
    // Seat tail rising up slightly
    const seatTail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.25), seatMat);
    seatTail.position.set(0, 0.95, -0.35);
    seatTail.rotation.x = 0.3;
    group.add(seatTail);

    // === ENGINE ===
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.35), blackMat);
    engine.position.set(0, 0.5, 0.2);
    group.add(engine);
    // Cylinder head
    const cylinder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 }));
    cylinder.position.set(0.18, 0.55, 0.2);
    group.add(cylinder);

    // === EXHAUST ===
    const exhaust1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), chromeMat);
    exhaust1.position.set(0.18, 0.35, -0.2);
    group.add(exhaust1);
    const exhaustEnd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), blackMat);
    exhaustEnd.position.set(0.18, 0.35, -0.6);
    group.add(exhaustEnd);

    // === FENDERS ===
    const fFender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), frameMat);
    fFender.position.set(0, 0.85, 1.1);
    group.add(fFender);
    const rFender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.4), frameMat);
    rFender.position.set(0, 0.82, -0.65);
    group.add(rFender);

    // === NUMBER PLATE ===
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    plate.position.set(0, 1.25, 1.05);
    plate.rotation.x = -0.2;
    group.add(plate);
    const numStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.035), frameMat);
    numStripe.position.set(0, 1.24, 1.06);
    numStripe.rotation.x = -0.2;
    group.add(numStripe);

    // === FOOT PEGS ===
    for (const s of [-1, 1]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.06), chromeMat);
      peg.position.set(s * 0.22, 0.35, 0.05);
      group.add(peg);
    }

    group.scale.set(1.8, 1.8, 1.8);
    const cx2 = (Math.random() - 0.5) * 600;
    const cz2 = (Math.random() - 0.5) * 600;
    group.position.set(cx2, this.getTerrainHeight(cx2, cz2), cz2);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene3d.add(group);
    this.cars.push({ mesh: group, vx: 0, vz: 0, speed: 30, driver: 'none', runPhase: 0, isVehicle: true });
  }

  private createChristmasTree(): void {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x0a3a0a, roughness: 0.8 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xeeeef4, roughness: 0.9 });

    // Big trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 6, 8), trunkMat);
    trunk.position.y = 3;
    group.add(trunk);

    // Pine layers — 7 layers getting smaller toward top
    for (let l = 0; l < 7; l++) {
      const r = 8 - l * 1.0;
      const h = 3.5 - l * 0.2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), leafMat);
      cone.position.y = 7 + l * 3.5;
      group.add(cone);
      // Snow on each layer
      const snowCap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, 0.8, 10), snowMat);
      snowCap.position.y = 7 + l * 3.5 + h * 0.35;
      group.add(snowCap);
    }

    // Star on top
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.8 });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), starMat);
    star.position.y = 32;
    star.rotation.y = Math.PI / 4;
    group.add(star);

    // Ornaments — colorful balls scattered on the tree
    const ornamentColors = [0xff0000, 0x0044ff, 0xffdd00, 0xff00ff, 0x00ccff, 0xff6600, 0x44ff44];
    for (let i = 0; i < 40; i++) {
      const layer = Math.floor(Math.random() * 7);
      const r = 7 - layer * 1.0;
      const angle = Math.random() * Math.PI * 2;
      const dist = r * 0.7 * (0.5 + Math.random() * 0.4);
      const color = ornamentColors[Math.floor(Math.random() * ornamentColors.length)];
      const ornMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.5 });
      const orn = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 6, 6), ornMat);
      orn.position.set(
        Math.cos(angle) * dist,
        7 + layer * 3.5 + (Math.random() - 0.5) * 1.5,
        Math.sin(angle) * dist
      );
      group.add(orn);
    }

    // Tinsel / garland — rings wrapping around the tree
    const tinselMat = new THREE.MeshStandardMaterial({ color: 0xccaa00, emissive: 0x554400, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.3 });
    for (let l = 0; l < 5; l++) {
      const r = 7 - l * 1.2;
      const tinsel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.65, 0.12, 6, 20), tinselMat);
      tinsel.position.y = 8.5 + l * 3.5;
      tinsel.rotation.x = Math.PI / 2;
      tinsel.rotation.z = l * 0.3;
      group.add(tinsel);
    }

    // Presents around the base
    const presentColors = [0xcc0000, 0x0066cc, 0x00aa44, 0xffcc00, 0xff44aa];
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0x665500, emissiveIntensity: 0.2 });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 3 + Math.random() * 4;
      const w = 0.8 + Math.random() * 1.2;
      const h = 0.6 + Math.random() * 1.0;
      const d = 0.8 + Math.random() * 1.2;
      const pColor = presentColors[Math.floor(Math.random() * presentColors.length)];
      const pMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.6 });
      const present = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pMat);
      present.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      present.rotation.y = Math.random() * Math.PI;
      group.add(present);
      // Ribbon cross on top
      const ribbon1 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.08, 0.12), ribbonMat);
      ribbon1.position.set(present.position.x, h + 0.04, present.position.z);
      ribbon1.rotation.y = present.rotation.y;
      group.add(ribbon1);
      const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, d * 1.05), ribbonMat);
      ribbon2.position.set(present.position.x, h + 0.04, present.position.z);
      ribbon2.rotation.y = present.rotation.y;
      group.add(ribbon2);
    }

    group.position.set(0, this.getTerrainHeight(0, 0), 0);
    this.scene3d.add(group);
    this.colliders.push({ x: 0, z: 0, r: 10 });
  }

  private createDirtBikeStatue(): void {
    const group = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.85, roughness: 0.2, emissive: 0x111111, emissiveIntensity: 0.05 });
    const darkSilver = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.15, emissive: 0x0a0a0a, emissiveIntensity: 0.05 });

    // Bike sub-group — tilted back for wheelie
    const bike = new THREE.Group();

    // Wheels
    const frontWheelGrp = new THREE.Group();
    frontWheelGrp.position.set(0, 0.4, 1.1);
    frontWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), darkSilver).rotateZ(Math.PI / 2));
    frontWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), silver).rotateZ(Math.PI / 2));
    frontWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), silver).rotateZ(Math.PI / 2));
    bike.add(frontWheelGrp);

    const rearWheelGrp = new THREE.Group();
    rearWheelGrp.position.set(0, 0.4, -0.7);
    rearWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 12), darkSilver).rotateZ(Math.PI / 2));
    rearWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12), silver).rotateZ(Math.PI / 2));
    rearWheelGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), silver).rotateZ(Math.PI / 2));
    bike.add(rearWheelGrp);

    // Frame
    const frameBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.9), silver);
    frameBar.position.set(0, 0.7, 0.2); frameBar.rotation.x = 0.15; bike.add(frameBar);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.08), silver);
    fork.position.set(0, 0.7, 1.0); fork.rotation.x = -0.25; bike.add(fork);
    const swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), silver);
    swingarm.position.set(0, 0.45, -0.3); bike.add(swingarm);

    // Handlebars
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), silver);
    handlebar.position.set(0, 1.15, 0.9); bike.add(handlebar);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), darkSilver);
      grip.position.set(s * 0.35, 1.15, 0.9); bike.add(grip);
    }

    // Tank, seat, engine
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), silver);
    tank.position.set(0, 0.95, 0.45); bike.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.55), darkSilver);
    seat.position.set(0, 0.9, -0.05); bike.add(seat);
    const seatTail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.25), darkSilver);
    seatTail.position.set(0, 0.95, -0.35); seatTail.rotation.x = 0.3; bike.add(seatTail);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.35), darkSilver);
    engine.position.set(0, 0.5, 0.2); bike.add(engine);
    const cylinder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), silver);
    cylinder.position.set(0.18, 0.55, 0.2); bike.add(cylinder);

    // Exhaust
    const exhaust1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), silver);
    exhaust1.position.set(0.18, 0.35, -0.2); bike.add(exhaust1);
    const exhaustEnd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), darkSilver);
    exhaustEnd.position.set(0.18, 0.35, -0.6); bike.add(exhaustEnd);

    // Fenders
    const fFender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), silver);
    fFender.position.set(0, 0.85, 1.1); bike.add(fFender);
    const rFender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.4), silver);
    rFender.position.set(0, 0.82, -0.65); bike.add(rFender);

    // Foot pegs
    for (const s of [-1, 1]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.06), silver);
      peg.position.set(s * 0.22, 0.35, 0.05); bike.add(peg);
    }

    // Wheelie — pivot from rear wheel, tilt back ~45 degrees
    bike.position.set(0, 0, 0.3); // shift so bike is centered on pedestal
    bike.rotation.x = -0.75; // tilt back for wheelie

    const bikeWrapper = new THREE.Group();
    bikeWrapper.position.set(0, 0.35, 0); // rear wheel bottom sits on pedestal top
    bikeWrapper.add(bike);
    group.add(bikeWrapper);

    // === PEDESTAL ===
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.85, roughness: 0.2, emissive: 0x111111, emissiveIntensity: 0.05 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), pedestalMat);
    base.position.y = -0.3;
    group.add(base);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), pedestalMat);
    mid.position.y = -0.8;
    group.add(mid);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 2.5), pedestalMat);
    bottom.position.y = -1.2;
    group.add(bottom);

    // Scale it big and place at center
    group.scale.set(3.5, 3.5, 3.5);
    group.position.set(0, this.getTerrainHeight(0, 0) + 5.5, 0);
    this.scene3d.add(group);
    this.colliders.push({ x: 0, z: 0, r: 8 });
  }

  private createForestAnimals(): void {
    for (let i = 0; i < 5; i++) this.createAnimalRide('bear', 0x5a3a1a, 0x7a5a3a, 2.2, 14);
    for (let i = 0; i < 5; i++) this.createAnimalRide('wolf', 0x6a6a6a, 0x9a9a9a, 1.8, 24);
    for (let i = 0; i < 5; i++) this.createAnimalRide('deer', 0x9a7040, 0xc8a870, 2.0, 22);
    // Quads (ATVs) — parked around the forest, mount with C key.
    const quadColors = [0xcc2222, 0x2266cc, 0x44aa44, 0xee9911, 0x222222, 0xaa22cc, 0xffdd44, 0x44ddff, 0xff66bb, 0x88ff44, 0xffffff, 0x884422];
    for (let i = 0; i < 16; i++) this.createQuad(quadColors[i % quadColors.length]);
  }

  private createQuad(bodyColor: number): void {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.5 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.3, metalness: 0.85 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
    const seatStitchMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffcc44, emissiveIntensity: 1.2 });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.7 });
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.9 });

    // Main body group — y is wheel-axle height
    const body = new THREE.Group();
    body.position.y = 0.45;
    group.add(body);

    // Skid plate / underside (low, between wheels)
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.6), trimMat);
    skid.position.y = -0.05;
    body.add(skid);

    // Main chassis — shaped tank-style with sloped front and rear
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.35, 1.65), bodyMat);
    chassis.position.y = 0.18;
    chassis.castShadow = true;
    body.add(chassis);

    // Sloped fuel-tank hump in front of seat
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.55), bodyMat);
    tank.position.set(0, 0.45, 0.25);
    tank.rotation.x = -0.15;
    body.add(tank);

    // Front fender — wraps over front wheels
    const frontFenderL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.7), bodyMat);
    frontFenderL.position.set(-0.55, 0.32, 0.7);
    body.add(frontFenderL);
    const frontFenderR = frontFenderL.clone();
    frontFenderR.position.x = 0.55;
    body.add(frontFenderR);
    // Curved fender top across the front
    const fenderTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.3), bodyMat);
    fenderTop.position.set(0, 0.42, 0.95);
    fenderTop.rotation.x = -0.2;
    body.add(fenderTop);

    // Rear fenders
    const rearFenderL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.7), bodyMat);
    rearFenderL.position.set(-0.55, 0.32, -0.7);
    body.add(rearFenderL);
    const rearFenderR = rearFenderL.clone();
    rearFenderR.position.x = 0.55;
    body.add(rearFenderR);

    // Cargo rack (rear)
    const rearRack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.55), trimMat);
    rearRack.position.set(0, 0.5, -0.7);
    body.add(rearRack);
    for (const sx of [-0.43, 0.43]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.55), trimMat);
      rail.position.set(sx, 0.6, -0.7);
      body.add(rail);
    }

    // Number plate (front)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.04), trimMat);
    plate.position.set(0, 0.45, 1.1);
    plate.rotation.x = -0.25;
    body.add(plate);

    // Headlights (twin)
    for (const sx of [-0.28, 0.28]) {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), trimMat);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(sx, 0.55, 1.05);
      body.add(housing);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), lightMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx, 0.55, 1.08);
      body.add(lens);
    }

    // Tail lights
    for (const sx of [-0.34, 0.34]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.04), taillightMat);
      tail.position.set(sx, 0.42, -1.05);
      body.add(tail);
    }

    // Seat — long, slightly raised toward rear
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.85), seatMat);
    seat.position.set(0, 0.55, -0.15);
    body.add(seat);
    // Seat stitching (decorative line down middle)
    const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.85), seatStitchMat);
    stitch.position.set(0, 0.55, -0.15);
    body.add(stitch);
    // Seat backrest
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.08), seatMat);
    seatBack.position.set(0, 0.66, -0.55);
    body.add(seatBack);

    // Handlebar post + bars
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), trimMat);
    post.position.set(0, 0.7, 0.55);
    post.rotation.x = -0.25;
    body.add(post);
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), trimMat);
    bars.rotation.z = Math.PI / 2;
    bars.position.set(0, 0.92, 0.6);
    body.add(bars);
    for (const sx of [-0.4, 0.4]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), seatMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(sx, 0.92, 0.6);
      body.add(grip);
      // brake/throttle lever
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.12), trimMat);
      lever.position.set(sx * 0.85, 0.86, 0.65);
      lever.rotation.y = sx > 0 ? -0.4 : 0.4;
      body.add(lever);
    }
    // Speedometer cluster
    const cluster = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), trimMat);
    cluster.rotation.x = Math.PI / 2;
    cluster.position.set(0, 0.86, 0.62);
    body.add(cluster);

    // Footrests (rider rests feet here)
    for (const sx of [-0.55, 0.55]) {
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.32), trimMat);
      peg.position.set(sx, 0.0, -0.05);
      body.add(peg);
    }

    // Exhaust pipe (right side, sweeping back)
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.55, 0.18, -0.4);
    body.add(exhaust);
    const exhaustTip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10), exhaustMat);
    exhaustTip.rotation.x = Math.PI / 2;
    exhaustTip.position.set(0.55, 0.18, -1.1);
    body.add(exhaustTip);

    // 4 wheels — each in its own pivot Group so we can spin them.
    // Local Y of axle is 0.45 (matches body.position.y), wheel radius 0.45.
    const wheelPivots: THREE.Group[] = [];
    const wheelOffsets = [
      { x: -0.65, z:  0.78 },
      { x:  0.65, z:  0.78 },
      { x: -0.65, z: -0.78 },
      { x:  0.65, z: -0.78 },
    ];
    for (const off of wheelOffsets) {
      const pivot = new THREE.Group();
      pivot.position.set(off.x, 0.45, off.z);
      group.add(pivot);
      // tire
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.36, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      pivot.add(tire);
      // rim hub
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 10), rimMat);
      rim.rotation.z = Math.PI / 2;
      pivot.add(rim);
      // hub cap (raised center)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), trimMat);
      hub.rotation.z = Math.PI / 2;
      pivot.add(hub);
      // tread blocks
      for (let s = 0; s < 8; s++) {
        const tread = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), blackMat);
        const a = (s / 8) * Math.PI * 2;
        tread.position.set(0, Math.sin(a) * 0.4, Math.cos(a) * 0.4);
        tread.rotation.x = a;
        pivot.add(tread);
      }
      wheelPivots.push(pivot);
    }

    const qx = (Math.random() - 0.5) * 800;
    const qz = (Math.random() - 0.5) * 800;
    group.position.set(qx, this.getTerrainHeight(qx, qz), qz);
    group.rotation.y = Math.random() * Math.PI * 2;
    group.scale.set(2.6, 2.6, 2.6); // BIG quads
    this.scene3d.add(group);

    // The seat-top in this model is at local y ≈ 1.06 (body 0.45 + seat 0.55 + half-thickness 0.06).
    // Player model origin is at the FEET; the hips are 0.95 above origin in player-local space.
    // To put the rider's hips at the seat-top in world space, we use seatLocalY = (1.06 - 0.95/scale).
    // With scale 2.6, that's about 0.69.
    this.cars.push({
      mesh: group,
      vx: 0,
      vz: 0,
      speed: 45,
      driver: 'none',
      runPhase: 0,
      wheelPivots,
      bodyGroup: body,
      isVehicle: true,
      seatLocalY: 0.69,
    });
  }

  private createSnowAnimals(): void {
    for (let i = 0; i < 5; i++) this.createAnimalRide('bear', 0xf0f0f0, 0xffffff, 2.4, 14);
    for (let i = 0; i < 5; i++) this.createAnimalRide('wolf', 0xd8d8d8, 0xf0f0f0, 1.8, 24);
    for (let i = 0; i < 5; i++) this.createAnimalRide('reindeer', 0x8a6a4a, 0xb09070, 2.1, 20);
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
          // Keep the NPC visible — we'll place them on the seat so the player can see who's riding.
          break;
        }
      }
    }

    // Player enter/exit car — check E key or proximity auto-detect handled in keyboard
    // (E key handling added in setupKeyboard)

    for (let ci = 0; ci < this.cars.length; ci++) {
      const car = this.cars[ci];

      // Dying T-Rexes just play their death animation and don't move/stomp.
      if (car.dying) {
        if (car.mixer) car.mixer.update(dt);
        continue;
      }

      if (car.driver === 'player') {
        // Player drives — car follows look direction, with strafe from moveDir.x
        const spd = car.speed;
        const fwdX = -Math.sin(this.lookAngle);
        const fwdZ = -Math.cos(this.lookAngle);
        const rightX = -fwdZ;
        const rightZ = fwdX;
        const fwdAmt = Math.max(-this.moveDir.z, 0);
        const strafeAmt = this.moveDir.x;
        car.vx = (fwdX * fwdAmt + rightX * strafeAmt) * spd;
        car.vz = (fwdZ * fwdAmt + rightZ * strafeAmt) * spd;
        car.mesh.rotation.y = this.lookAngle + Math.PI;
        car.mesh.position.x += car.vx * dt;
        car.mesh.position.z += car.vz * dt;
        car.mesh.position.y = this.getTerrainHeight(car.mesh.position.x, car.mesh.position.z);
        // Sync player pos to car — show player sitting on top
        this.playerPos.set(car.mesh.position.x, car.mesh.position.y, car.mesh.position.z);
        this.playerModel.visible = !this.firstPerson;
        const seatBounce = Math.abs(Math.sin((car.runPhase || 0))) * 0.15;
        // Seat height — sit right on the back / seat. seatLocalY is the seat's Y in the model's local space.
        const dinoScale = car.mesh.scale.y;
        let seatHeight: number;
        if (typeof car.seatLocalY === 'number') {
          seatHeight = car.seatLocalY * dinoScale;
        } else {
          const bodyY = car.bodyGroup ? car.bodyGroup.position.y : 2.0;
          const bodyHalfH = 0.7; // half the body mesh height roughly
          seatHeight = (bodyY + bodyHalfH) * dinoScale;
        }
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
        // NPC drives — chase nearest enemy (other NPCs OR the player)
        const npc = this.npcs[car.driver];
        if (!npc || npc.dead) {
          car.driver = 'none';
          car.vx = 0;
          car.vz = 0;
          continue;
        }

        // Pick the nearest enemy: other NPCs (not in cars) and the player.
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
        // T-Rex/quad riders only chase OTHER NPCs — not the player.

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

        // Place the NPC rider visibly on the seat (same math as the player rider).
        const dinoScale = car.mesh.scale.y;
        let seatHeight: number;
        if (typeof car.seatLocalY === 'number') {
          seatHeight = car.seatLocalY * dinoScale;
        } else {
          const bodyY = car.bodyGroup ? car.bodyGroup.position.y : 2.0;
          const bodyHalfH = 0.7;
          seatHeight = (bodyY + bodyHalfH) * dinoScale;
        }
        const npcSeatBounce = Math.abs(Math.sin((car.runPhase || 0))) * 0.15;
        npc.mesh.visible = true;
        npc.mesh.position.set(car.mesh.position.x, car.mesh.position.y + seatHeight + npcSeatBounce, car.mesh.position.z);
        npc.mesh.rotation.y = car.mesh.rotation.y;
        // Riding pose for the NPC — sitting with bent legs, arms forward holding reins.
        npc.leftThigh.rotation.x = -1.4;
        npc.rightThigh.rotation.x = -1.4;
        npc.leftShin.rotation.x = 1.2;
        npc.rightShin.rotation.x = 1.2;
        npc.leftUpperArm.rotation.x = -0.8;
        npc.leftForearm.rotation.x = -0.6;
        npc.rightUpperArm.rotation.x = -0.8;
        npc.rightForearm.rotation.x = -0.6;
      } else if (car.isVehicle) {
        // Quads, dirt bikes, etc. — sit still until a player mounts them.
        car.vx = 0;
        car.vz = 0;
      } else {
        // No driver — wild T-Rex / animal wanders peacefully, waiting to be ridden
        car.wanderTimer = (car.wanderTimer ?? 0) - dt;
        if (car.wanderTimer <= 0 || car.wanderAngle === undefined) {
          car.wanderAngle = Math.random() * Math.PI * 2;
          car.wanderTimer = 3 + Math.random() * 4;
          car.wanderSpeed = 12 + Math.random() * 10; // T-Rex stomping along, not strolling
        }
        const wSpd = car.wanderSpeed ?? 5;
        car.vx = Math.sin(car.wanderAngle) * wSpd;
        car.vz = Math.cos(car.wanderAngle) * wSpd;
        car.mesh.position.x += car.vx * dt;
        car.mesh.position.z += car.vz * dt;
        car.mesh.position.y = this.getTerrainHeight(car.mesh.position.x, car.mesh.position.z);
        car.mesh.rotation.y = Math.atan2(car.vx, car.vz);
        // Turn around if approaching world edge
        if (Math.abs(car.mesh.position.x) > 400 || Math.abs(car.mesh.position.z) > 400) {
          car.wanderAngle += Math.PI;
          car.wanderTimer = 3 + Math.random() * 4;
        }
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

      // T-Rex / quad ride only stomps things when SOMEONE (player or NPC) is riding it.
      // Wild rides are peaceful.
      if (car.driver !== 'none') {
        for (let ni = 0; ni < this.npcs.length; ni++) {
          const npc = this.npcs[ni];
          if (npc.dead || ni === car.driver) continue;
          // Don't eat NPCs that are riding T-Rexes
          if (this.cars.some(c => c.driver === ni)) continue;
          const ndx = npc.mesh.position.x - car.mesh.position.x;
          const ndz = npc.mesh.position.z - car.mesh.position.z;
          const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
          if (ndist < 2.5) {
            // Stomp damages instead of insta-killing — takes 20 stomps to kill (0.4 dmg × 20 = 8 hp).
            npc.hp -= 0.4;
            this.playSfx('hit', 0.4);
            if (npc.hp <= 0) {
              this.killNpc(npc);
              this.showPickupMsg('SQUISHED!');
              this.spawnDeathFluff(npc.mesh.position.clone());
            } else {
              this.updateHealthBar(npc.healthCtx, npc.healthTex, npc.hp, 8);
            }
          }
        }

        // T-Rexes / quads no longer stomp the player — they only stomp NPCs.
      }

      // Running animation — works for all dino types
      const spd = Math.sqrt(car.vx * car.vx + car.vz * car.vz);

      // Advance any rigged GLB animation (T-Rex legs, etc.). Time scale tracks ground speed
      // so legs move faster when running, slower when standing still.
      if (car.mixer) {
        const animSpeed = Math.max(0.4, Math.min(2, spd / 12));
        car.mixer.update(dt * animSpeed);
      }

      // T-Rex roar — random timer per car triggers a mouth-open attack animation + roar sound.
      if (car.roarAction && typeof car.roarTimer === 'number') {
        car.roarTimer -= dt;
        if (car.roarTimer <= 0) {
          car.roarAction.reset();
          car.roarAction.play();
          // Audible up to 200 units away. Closer = louder, plus you can SEE it on screen.
          const rdx = car.mesh.position.x - this.playerPos.x;
          const rdz = car.mesh.position.z - this.playerPos.z;
          const dist = Math.sqrt(rdx * rdx + rdz * rdz);
          if (dist < 200) {
            const vol = Math.max(0.2, 1 - dist / 200) * 0.95;
            this.playSfx('roar', vol);
            // Pop a "🦖 ROAAR!" message on screen if the T-Rex is reasonably close.
            if (dist < 120) this.showPickupMsg('🦖 ROAAAAR!');
          }
          car.roarTimer = 3 + Math.random() * 7; // next roar in 3–10 seconds (much more often)
        }
      }

      // Quad wheel spin (works whether moving or stopped — only visible while moving)
      if (car.wheelPivots) {
        const wheelSpinSpeed = spd * 1.2;
        for (const wheel of car.wheelPivots) {
          wheel.rotation.x += wheelSpinSpeed * dt;
        }
      }

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

        // GLB T-Rexes use their built-in walk animation (mixer above) — no fake bob needed.

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
    joystickBase.style.cssText = 'position:fixed;left:30px;bottom:40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,0.12);border:3px solid rgba(255,255,255,0.25);z-index:1500;pointer-events:none;display:none;';
    document.body.appendChild(joystickBase);
    const joystickThumb = document.createElement('div');
    joystickThumb.style.cssText = 'position:absolute;left:50%;top:50%;width:65px;height:65px;border-radius:50%;background:rgba(255,255,255,0.45);border:2px solid rgba(255,255,255,0.6);transform:translate(-50%,-50%);pointer-events:none;';
    joystickBase.appendChild(joystickThumb);

    // === FIRE BUTTON (big, right side bottom) ===
    const shootBtn = document.createElement('div');
    shootBtn.style.cssText = 'position:fixed;right:20px;bottom:30px;width:100px;height:100px;border-radius:50%;background:rgba(255,40,40,0.55);border:4px solid rgba(255,100,100,0.7);z-index:1500;display:flex;align-items:center;justify-content:center;font:bold 18px Arial;color:white;text-shadow:1px 1px 3px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    shootBtn.textContent = 'FIRE';
    document.body.appendChild(shootBtn);

    // === ENTER/EXIT CAR BUTTON ===
    const carBtn = document.createElement('div');
    carBtn.style.cssText = 'position:fixed;right:135px;bottom:35px;width:70px;height:70px;border-radius:50%;background:rgba(50,200,50,0.5);border:3px solid rgba(100,255,100,0.6);z-index:1500;display:flex;align-items:center;justify-content:center;font:bold 13px Arial;color:white;text-shadow:1px 1px 2px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    carBtn.textContent = 'RIDE';
    this.carBtn = carBtn;
    document.body.appendChild(carBtn);

    // === JUMP BUTTON ===
    const jumpBtn = document.createElement('div');
    jumpBtn.style.cssText = 'position:fixed;right:135px;bottom:115px;width:60px;height:60px;border-radius:50%;background:rgba(50,150,255,0.45);border:2px solid rgba(100,180,255,0.6);z-index:1500;display:flex;align-items:center;justify-content:center;font:bold 13px Arial;color:white;text-shadow:1px 1px 2px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    jumpBtn.textContent = 'JUMP';
    document.body.appendChild(jumpBtn);

    // === FIRST/THIRD PERSON TOGGLE (shows the view you'd switch TO) ===
    const viewBtn = document.createElement('div');
    viewBtn.id = 'fp-toggle-btn';
    viewBtn.style.cssText = 'position:fixed;top:60px;right:15px;width:130px;height:38px;border-radius:10px;background:rgba(80,120,200,0.55);border:2px solid rgba(130,170,240,0.7);z-index:1500;display:flex;align-items:center;justify-content:center;font:bold 12px Arial;color:white;text-shadow:1px 1px 2px black;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
    viewBtn.textContent = this.firstPerson ? 'THIRD PERSON' : 'FIRST PERSON';
    document.body.appendChild(viewBtn);

    viewBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.firstPerson = !this.firstPerson;
      if (this.playerModel) this.playerModel.visible = !this.firstPerson;
      if (this.fpArms) this.fpArms.visible = this.firstPerson;
      viewBtn.textContent = this.firstPerson ? 'THIRD PERSON' : 'FIRST PERSON';
    }, { passive: false });

    // JUMP — edge-triggered tap
    jumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })), 80);
    }, { passive: false });

    // === TOGGLE AUTO-FIRE (tap to start, tap again to stop) ===
    // This frees your thumb so you can walk + aim while the game keeps shooting.
    let shootInterval: number | null = null;
    const stopFiring = () => {
      if (shootInterval) { clearInterval(shootInterval); shootInterval = null; }
      shootBtn.style.background = 'rgba(255,40,40,0.55)';
      shootBtn.style.borderColor = 'rgba(255,100,100,0.7)';
      shootBtn.textContent = 'FIRE';
    };
    const startFiring = () => {
      this.tryShoot();
      shootInterval = window.setInterval(() => this.tryShoot(), 100);
      shootBtn.style.background = 'rgba(255,200,40,0.75)';
      shootBtn.style.borderColor = 'rgba(255,230,80,0.9)';
      shootBtn.textContent = 'STOP';
    };
    // Debounce taps so iOS doesn't double-fire (which can leave you stuck "firing" when you meant to stop).
    let lastShootTap = 0;
    const toggleFire = () => {
      const now = Date.now();
      if (now - lastShootTap < 280) return;
      lastShootTap = now;
      if (shootInterval) stopFiring();
      else startFiring();
    };
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFire();
    }, { passive: false });
    // Swallow the touchend so it doesn't bubble into a synthetic click that re-toggles.
    shootBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    shootBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFire();
    });

    // Car/dino button — enter/exit nearest ride. Keyboard binding is KeyC.
    carBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' })), 80);
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

    // Load user control bindings, but always merge with defaults so every action is bound
    const kbControls: ControlScheme = { ...DEFAULT_KEYBOARD, ...getControls('keyboard') };
    const gpControls: ControlScheme = { ...DEFAULT_GAMEPAD, ...getControls('gamepad') };
    // If any field is somehow undefined (e.g. corrupted localStorage), patch it with the default
    (Object.keys(DEFAULT_GAMEPAD) as (keyof ControlScheme)[]).forEach((k) => {
      if (!gpControls[k] || !(gpControls[k] as any).code) gpControls[k] = DEFAULT_GAMEPAD[k];
      if (!kbControls[k] || !(kbControls[k] as any).code) kbControls[k] = DEFAULT_KEYBOARD[k];
    });

    // Helper to read a gamepad binding (null-safe for missing/remapped bindings)
    const readGpBinding = (gp: Gamepad, binding: { type: string; code: string } | undefined): number => {
      if (!binding || !binding.code) return 0;
      if (binding.type === 'gamepad-button') {
        const idx = parseInt(binding.code.split('-')[1]);
        return gp.buttons[idx]?.pressed ? 1 : 0;
      }
      if (binding.type === 'gamepad-trigger') {
        const idx = parseInt(binding.code.split('-')[1]);
        const v = gp.buttons[idx]?.value ?? 0;
        // 0.5 threshold filters trigger drift / resting-finger bleed
        return v > 0.5 ? v : 0;
      }
      if (binding.type === 'gamepad-axis') {
        const parts = binding.code.split('-'); // axis-0-neg
        const axisIdx = parseInt(parts[1]);
        const dir = parts[2]; // 'pos' or 'neg'
        const val = gp.axes[axisIdx] || 0;
        // 0.25 deadzone prevents worn-stick drift from firing unintended input
        if (dir === 'pos' && val > 0.25) return val;
        if (dir === 'neg' && val < -0.25) return -val;
        return 0;
      }
      return 0;
    };

    // Poll keys each frame
    const origUpdate = this.updatePlayer.bind(this);
    const gpPrev: Record<string, boolean> = {};
    this.updatePlayer = (dt: number) => {
      let kx = 0, kz = 0;

      // Keyboard controls (user-configurable)
      if (keys[kbControls.moveForward.code] || keys['ArrowUp']) kz = -1;
      if (keys[kbControls.moveBackward.code] || keys['ArrowDown']) kz = 1;
      if (keys[kbControls.moveLeft.code] || keys['ArrowLeft']) kx = -1;
      if (keys[kbControls.moveRight.code] || keys['ArrowRight']) kx = 1;
      if (keys[kbControls.stop.code]) { kx = 0; kz = 0; }

      // Gamepad controls (user-configurable)
      const gamepads = navigator.getGamepads?.();
      if (gamepads) {
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (!gp) continue;

          // Movement
          const fwd = readGpBinding(gp, gpControls.moveForward);
          if (fwd > 0) kz = -fwd;
          const bwd = readGpBinding(gp, gpControls.moveBackward);
          if (bwd > 0) kz = bwd;
          const left = readGpBinding(gp, gpControls.moveLeft);
          if (left > 0) kx = -left;
          const right = readGpBinding(gp, gpControls.moveRight);
          if (right > 0) kx = right;

          // Looking
          const lookL = readGpBinding(gp, gpControls.lookLeft);
          if (lookL > 0) this.lookAngle += lookL * 0.05;
          const lookR = readGpBinding(gp, gpControls.lookRight);
          if (lookR > 0) this.lookAngle -= lookR * 0.05;
          const lookU = readGpBinding(gp, gpControls.lookUp);
          if (lookU > 0) this.lookPitch = Math.max(-1, Math.min(0.6, this.lookPitch + lookU * 0.03));
          const lookD = readGpBinding(gp, gpControls.lookDown);
          if (lookD > 0) this.lookPitch = Math.max(-1, Math.min(0.6, this.lookPitch - lookD * 0.03));

          // Stop
          const stopVal = readGpBinding(gp, gpControls.stop);
          if (stopVal > 0) { kx = 0; kz = 0; }

          // Shoot (continuous)
          if (readGpBinding(gp, gpControls.shoot) > 0) this.tryShoot();

          // Car toggle (one-shot)
          const carVal = readGpBinding(gp, gpControls.enterCar) > 0;
          if (carVal && !gpPrev['car']) this.toggleCar();
          gpPrev['car'] = carVal;

          // Quit (one-shot)
          const quitVal = readGpBinding(gp, gpControls.quit) > 0;
          if (quitVal && !gpPrev['quit']) {
            this.shutdown();
            this.scene.start('TitleScene');
          }
          gpPrev['quit'] = quitVal;

          // Menu / Start button (9) — toggle pause (one-shot)
          const pauseVal = !!gp.buttons[9]?.pressed;
          if (pauseVal && !gpPrev['pause']) this.togglePause();
          gpPrev['pause'] = pauseVal;

          // X button (2) — toggle first/third-person (one-shot)
          const fpVal = !!gp.buttons[2]?.pressed;
          if (fpVal && !gpPrev['fp']) {
            this.firstPerson = !this.firstPerson;
            if (this.playerModel) this.playerModel.visible = !this.firstPerson;
            if (this.fpArms) this.fpArms.visible = this.firstPerson;
            const fpBtn = document.getElementById('fp-toggle-btn');
            if (fpBtn) fpBtn.textContent = this.firstPerson ? 'THIRD PERSON' : 'FIRST PERSON';
          }
          gpPrev['fp'] = fpVal;

          break; // use first connected controller
        }
      }

      // Run / walk: auto-move forward at different speeds (sprint wins if both held)
      let sprintHeld = !!keys[kbControls.sprint.code];
      let walkHeld = !!keys[kbControls.walk.code];
      let jumpPressed = !!keys[kbControls.jump?.code || 'KeyQ'] || !!keys['KeyQ'];
      const gamepads2 = navigator.getGamepads?.();
      if (gamepads2) {
        for (let i = 0; i < gamepads2.length; i++) {
          const gp = gamepads2[i];
          if (!gp) continue;
          if (readGpBinding(gp, gpControls.sprint) > 0) sprintHeld = true;
          if (readGpBinding(gp, gpControls.walk) > 0) walkHeld = true;
          if (readGpBinding(gp, gpControls.jump) > 0) jumpPressed = true;
          break;
        }
      }
      // Auto-forward when sprint or walk is held with no other movement input
      if ((sprintHeld || walkHeld) && kx === 0 && kz === 0) {
        kz = -1;
      }
      if (kx !== 0 || kz !== 0) {
        const len = Math.sqrt(kx * kx + kz * kz);
        this.moveDir.x = kx / len;
        this.moveDir.z = kz / len;
      } else if (!this.leftTouch) {
        this.moveDir.x = 0;
        this.moveDir.z = 0;
      }
      this.playerSpeedMul = sprintHeld ? 1.35 : (walkHeld ? 0.65 : 1);
      // Jump — edge-triggered, with double-tap → backflip (works from any state)
      const jumpEdge = jumpPressed && !this.jumpEdgePrev;
      this.jumpEdgePrev = jumpPressed;
      if (jumpEdge) {
        const now = performance.now() / 1000;
        const onGround = this.playerJumpY <= 0.001 && this.playerVy <= 0.001;
        if (now - this.lastJumpTapTime < 2.0 && this.lastJumpTapTime > 0 && !this.backflipActive) {
          // Double-tap: backflip — launch up and spin no matter what state
          this.playerVy = 10;
          this.backflipActive = true;
          this.backflipPhase = 0;
          this.lastJumpTapTime = 0;
        } else {
          if (onGround) this.playerVy = 14;
          this.lastJumpTapTime = now;
        }
      }
      if (keys[kbControls.shoot.code]) this.tryShoot();
      if (keys[kbControls.enterCar.code]) {
        keys[kbControls.enterCar.code] = false;
        this.toggleCar();
      }
      if (keys[kbControls.quit.code]) {
        keys[kbControls.quit.code] = false;
        this.shutdown();
        this.scene.start('TitleScene');
      }
      // V to toggle first/third person
      if (keys['KeyV']) {
        keys['KeyV'] = false;
        this.firstPerson = !this.firstPerson;
        if (this.playerModel) this.playerModel.visible = !this.firstPerson;
        if (this.fpArms) this.fpArms.visible = this.firstPerson;
        const fpBtn = document.getElementById('fp-toggle-btn');
        if (fpBtn) fpBtn.textContent = this.firstPerson ? 'THIRD PERSON' : 'FIRST PERSON';
      }
      // Hide gun if player has no weapon, and pick the right model
      if (this.fpGun) this.fpGun.visible = this.playerGun !== 'None';
      this.updateFpGunModel();
      origUpdate(dt);
    };
  }

  private carToggleCooldown = 0;
  private toggleCar(): void {
    if (this.carToggleCooldown > 0) return;
    this.carToggleCooldown = 0.5; // half second cooldown
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
      this.showPickupMsg('Dismounted dinosaur');
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

    // Melee weapons don't use ammo; everything else does.
    const usesAmmo = !!wep && wep.type !== 'melee';
    if (usesAmmo) {
      if (this.playerAmmo <= 0) {
        this.showPickupMsg('Out of bullets!');
        this.shootCooldown = 0.3; // brief stutter so message doesn't spam
        return;
      }
      this.playerAmmo--;
      this.updateAmmoText();
    }

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
      // Gravity for snowman snowballs (and any other arc projectiles) — very gentle drop
      if (b.owner === 9999) b.vy -= 1.8 * dt;
      b.life -= dt;

      let hit = false;

      // Check hit against local player (NPC bullets and snowman snowballs)
      if (b.owner >= 0) {
        const dx = b.mesh.position.x - this.playerPos.x;
        const dy = b.mesh.position.y - (this.playerPos.y + 1);
        const dz = b.mesh.position.z - this.playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const hitRadius = b.owner === 9999 ? 2.0 : 1.0;
        if (dist < hitRadius) {
          const dmg = b.owner === 9999 ? 8 : 5;
          this.playerHP = Math.max(0, this.playerHP - dmg);
          this.playSfx('hurt', 0.5);
          hit = true;
          this.hpText.textContent = `HP: ${this.playerHP}`;
          if (this.playerHP <= 0) {
            this.showGameOver(b.owner === 9999 ? 'KILLED BY A SNOWMAN' : 'SHOT BY AN ENEMY');
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
            npc.hp -= 1; // each bullet always chips off 1 — guns kill faster by firing more
            this.playSfx('hit', 0.3);
            hit = true;
            if (npc.hp <= 0) {
              this.killNpc(npc);
              this.coinsEarned += 1000;
              this.showPickupMsg('+1000 coins!');
              this.spawnDeathFluff(npc.mesh.position.clone());
            } else {
              // Live NPC: refresh the floating health bar.
              this.updateHealthBar(npc.healthCtx, npc.healthTex, npc.hp, 8);
            }
            break;
          }
        }
      }

      // Check hit against rideable dinosaurs (T-Rexes etc.) — only player bullets damage them.
      if (!hit && b.owner === -1) {
        for (let ci = 0; ci < this.cars.length; ci++) {
          const car = this.cars[ci];
          if (car.dying || typeof car.hp !== 'number' || car.hp <= 0) continue;
          // Use a tall hitbox so head + body shots both count.
          const dx = b.mesh.position.x - car.mesh.position.x;
          const dy = b.mesh.position.y - (car.mesh.position.y + 3);
          const dz = b.mesh.position.z - car.mesh.position.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < 3 && Math.abs(dy) < 5) {
            car.hp -= b.damage;
            this.playSfx('hit', 0.5);
            hit = true;
            if (car.healthCtx && car.healthTex && car.maxHp) {
              this.updateHealthBar(car.healthCtx, car.healthTex, Math.max(0, car.hp), car.maxHp);
            }
            if (car.hp <= 0) {
              car.dying = true;
              this.coinsEarned += 2000;
              this.showPickupMsg('+2000 coins! T-REX DOWN!');
              if (car.healthBar) car.healthBar.visible = false;
              // Stop the car moving and play the Death animation.
              car.vx = 0; car.vz = 0; car.speed = 0; car.driver = 'none';
              if (car.deathAction && car.mixer) {
                if (car.roarAction) car.roarAction.stop();
                car.mixer.stopAllAction();
                car.deathAction.reset();
                car.deathAction.play();
              }
              // Remove the corpse from the world after a short delay.
              setTimeout(() => {
                this.scene3d.remove(car.mesh);
                const idx = this.cars.indexOf(car);
                if (idx >= 0) this.cars.splice(idx, 1);
              }, 5000);
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

      // Check hit against snowmen (skip snowman's own snowballs)
      if (!hit && b.owner !== 9999) {
        for (let si = this.snowmen.length - 1; si >= 0; si--) {
          const s = this.snowmen[si];
          if (s.hp <= 0) continue;
          const sx = b.mesh.position.x - s.mesh.position.x;
          const sz = b.mesh.position.z - s.mesh.position.z;
          const sdist = Math.sqrt(sx * sx + sz * sz);
          if (sdist < 2.0) {
            s.hp -= 1;
            this.playSfx('hit', 0.3);
            hit = true;
            if (s.hp <= 0) {
              this.coinsEarned += 500;
              this.showPickupMsg('+500 coins!');
              this.crumbleSnowman(s.mesh.position.clone());
              this.scene3d.remove(s.mesh);
            }
            break;
          }
        }
      }

      // Check hit against evil hedgehogs (skip hostile creature projectiles)
      if (!hit && b.owner !== 9999) {
        for (let hi = this.evilHedgehogs.length - 1; hi >= 0; hi--) {
          const h = this.evilHedgehogs[hi];
          if (h.hp <= 0) continue;
          const hx = b.mesh.position.x - h.mesh.position.x;
          const hz = b.mesh.position.z - h.mesh.position.z;
          const hd = Math.sqrt(hx * hx + hz * hz);
          if (hd < 1.5) {
            h.hp -= 1;
            this.playSfx('hit', 0.3);
            hit = true;
            if (h.hp <= 0) {
              this.coinsEarned += 250;
              this.showPickupMsg('+250 coins!');
              this.scene3d.remove(h.mesh);
            }
            break;
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
    const speed = 20 * this.playerSpeedMul;
    const forward = new THREE.Vector3(
      -Math.sin(this.lookAngle),
      0,
      -Math.cos(this.lookAngle)
    );
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

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

    // Eiffel Tower climbing disabled — player walks past it like any other obstacle.

    // Jump physics
    if (this.playerJumpY > 0 || this.playerVy !== 0) {
      this.playerJumpY += this.playerVy * dt;
      this.playerVy -= 35 * dt; // gravity
      if (this.playerJumpY <= 0) {
        this.playerJumpY = 0;
        this.playerVy = 0;
      }
    }
    this.playerModel.position.set(this.playerPos.x, terrainY + this.playerJumpY, this.playerPos.z);
    // Player always faces camera direction (like Fortnite)
    this.playerModel.rotation.order = 'YXZ'; // heading first, then local pitch (for backflip)
    this.playerModel.rotation.y = this.lookAngle + Math.PI;
    if (this.backflipActive) {
      this.backflipPhase += dt / 0.25;
      if (this.backflipPhase >= 1) {
        this.backflipActive = false;
        this.backflipPhase = 0;
        this.playerModel.rotation.x = 0;
        this.playerModel.scale.set(1, 1, 1);
      } else {
        // Full backflip rotation around the model's local right-axis
        this.playerModel.rotation.x = -this.backflipPhase * Math.PI * 2;
      }
    } else {
      this.playerModel.rotation.x = 0;
    }

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

    if (this.backflipActive) {
      // Curl into a tight ball: knees to chest, arms hugging legs, torso bent forward
      this.pHips.position.y = 0.7;
      this.pHips.rotation.z = 0;
      this.pHips.rotation.y = 0;
      this.pTorso.rotation.x = 0.9;
      this.pTorso.rotation.y = 0;
      this.pHead.rotation.x = 0.6;
      this.pLeftThigh.rotation.x = -2.2;
      this.pRightThigh.rotation.x = -2.2;
      this.pLeftShin.rotation.x = 2.0;
      this.pRightShin.rotation.x = 2.0;
      this.pLeftUpperArm.rotation.x = -1.6;
      this.pLeftUpperArm.rotation.z = 0.3;
      this.pRightUpperArm.rotation.x = -1.6;
      this.pRightUpperArm.rotation.z = -0.3;
      this.pLeftForearm.rotation.x = -1.9;
      this.pRightForearm.rotation.x = -1.9;
    } else {
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
    }

    // === THIRD PERSON CAMERA ===
    // Intro: camera faces the player from the front
    if (this.introCamera) {
      this.introCameraTimer += dt;
      if (isMoving) {
        this.introCamera = false; // transition to behind on first move
      }
    }

    const onTRex = this.playerInCar >= 0;
    // Vehicles (quads, dirt bikes) keep the normal close camera; only big creatures zoom out.
    const onVehicle = onTRex && !!this.cars[this.playerInCar]?.isVehicle;

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
    } else if (this.firstPerson) {
      // First person camera — at eye level looking forward
      const eyeHeight = 1.6;
      const fpX = this.playerModel.position.x;
      const fpZ = this.playerModel.position.z;
      // Use player model y (already accounts for terrain, jump, or T-Rex seat height)
      const fpY = this.playerModel.position.y + eyeHeight;

      this.camera.position.set(fpX, fpY, fpZ);

      // Proper spherical look direction (matches bullet aim math)
      const dist = 5;
      const fwdX = -Math.sin(this.lookAngle) * Math.cos(this.lookPitch);
      const fwdY = Math.sin(this.lookPitch);
      const fwdZ = -Math.cos(this.lookAngle) * Math.cos(this.lookPitch);
      const lookTarget = new THREE.Vector3(
        fpX + fwdX * dist,
        fpY + fwdY * dist,
        fpZ + fwdZ * dist
      );
      this.camera.lookAt(lookTarget);
    } else {
      // Normal behind camera (third person). Quads/bikes use the close foot-level camera.
      const bigRide = onTRex && !onVehicle;
      const camDist = bigRide ? 25 : 5;
      const camHeight = bigRide ? 16 : 2.5;
      const camOffsetX = bigRide ? 2 : 1;

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
    // Performance: skip AI + animation for NPCs far from the player (you can't see them act anyway).
    // Saves the O(N²) target search and per-bone animation when there are ~50 NPCs spread around.
    const cullSqr = 220 * 220;
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const dxToP = npc.mesh.position.x - this.playerPos.x;
      const dzToP = npc.mesh.position.z - this.playerPos.z;
      if (dxToP * dxToP + dzToP * dzToP > cullSqr) continue; // skip distant NPCs entirely

      const npcIdx = this.npcs.indexOf(npc);
      // If this NPC is currently driving a car/T-Rex, the car loop already moves them
      // and sets their riding pose — skip walking AI/animation here so it isn't overridden.
      if (this.cars.some(c => c.driver === npcIdx)) continue;
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

      // Player targeting — mounted players are a big, visible target, so NPCs go after them
      // at the same priority as other NPCs. On foot, the existing preference (NPCs first) stays.
      const dxP = this.playerPos.x - npc.mesh.position.x;
      const dzP = this.playerPos.z - npc.mesh.position.z;
      const distP = Math.sqrt(dxP * dxP + dzP * dzP);
      const playerMounted = this.playerInCar >= 0;
      if (playerMounted && distP < targetDist) {
        targetDist = distP;
        targetX = this.playerPos.x;
        targetY = this.playerPos.y + 1;
        targetZ = this.playerPos.z;
        targetIsPlayer = true;
      } else if (!playerMounted && targetDist > 50 && distP < 20) {
        // No NPCs in range but player is close
        targetDist = distP;
        targetX = this.playerPos.x;
        targetY = this.playerPos.y + 1;
        targetZ = this.playerPos.z;
        targetIsPlayer = true;
      }

      if (targetDist < aggroRange) {
        const tdx = targetX - npc.mesh.position.x;
        const tdz = targetZ - npc.mesh.position.z;
        const tlen = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
        const dirX = tdx / tlen;
        const dirZ = tdz / tlen;

        // Player-like combat movement: maintain standoff distance, circle-strafe
        const idealDist = 10; // prefer to fight at this range
        const closeDist = 6;  // back off if inside this
        const chaseSpeed = 4.5;
        const strafeSpeed = 3.2;

        // Flip strafe direction occasionally so bots don't circle predictably
        npc.strafeTimer = (npc.strafeTimer ?? 0) - dt;
        if (npc.strafeTimer <= 0) {
          npc.strafeDir = Math.random() < 0.5 ? -1 : 1;
          npc.strafeTimer = 1.2 + Math.random() * 2.0;
        }

        // Perpendicular vector (right-hand) for strafing
        const rightX = -dirZ;
        const rightZ = dirX;

        let moveX = 0, moveZ = 0;
        if (targetDist > idealDist + 2) {
          // Push in toward target, still strafe a bit
          moveX = dirX * chaseSpeed + rightX * strafeSpeed * 0.4 * (npc.strafeDir ?? 1);
          moveZ = dirZ * chaseSpeed + rightZ * strafeSpeed * 0.4 * (npc.strafeDir ?? 1);
        } else if (targetDist < closeDist) {
          // Too close — back off while strafing
          moveX = -dirX * chaseSpeed * 0.9 + rightX * strafeSpeed * (npc.strafeDir ?? 1);
          moveZ = -dirZ * chaseSpeed * 0.9 + rightZ * strafeSpeed * (npc.strafeDir ?? 1);
        } else {
          // Circle-strafe at ideal range
          moveX = rightX * strafeSpeed * (npc.strafeDir ?? 1) + dirX * 0.4;
          moveZ = rightZ * strafeSpeed * (npc.strafeDir ?? 1) + dirZ * 0.4;
        }
        npc.vx = moveX;
        npc.vz = moveZ;

        // Bunny-hop occasionally while engaging (player-like)
        npc.jumpTimer = (npc.jumpTimer ?? 0) - dt;
        if ((npc.jumpY ?? 0) <= 0.01 && npc.jumpTimer <= 0) {
          if (Math.random() < 0.35) {
            npc.jumpVy = 4.5;
            npc.jumpTimer = 0.8 + Math.random() * 1.4;
          } else {
            npc.jumpTimer = 0.5 + Math.random() * 1.0;
          }
        }
        if ((npc.jumpVy ?? 0) !== 0 || (npc.jumpY ?? 0) > 0) {
          npc.jumpVy = (npc.jumpVy ?? 0) - 12 * dt;
          npc.jumpY = Math.max(0, (npc.jumpY ?? 0) + (npc.jumpVy ?? 0) * dt);
          if ((npc.jumpY ?? 0) <= 0) {
            npc.jumpY = 0;
            npc.jumpVy = 0;
          }
        }

        // Face the target, not movement direction
        const faceAngle = Math.atan2(dirX, dirZ);
        let fdiff = faceAngle - npc.mesh.rotation.y;
        while (fdiff > Math.PI) fdiff -= Math.PI * 2;
        while (fdiff < -Math.PI) fdiff += Math.PI * 2;
        npc.mesh.rotation.y += fdiff * Math.min(dt * 8, 1);

        // Shoot at target when in range — burst fire + aim jitter
        if (targetDist < shootRange) {
          // Refresh aim jitter periodically
          npc.aimErrTimer = (npc.aimErrTimer ?? 0) - dt;
          if (npc.aimErrTimer <= 0) {
            npc.aimErrX = (Math.random() - 0.5) * 0.12;
            npc.aimErrY = (Math.random() - 0.5) * 0.08;
            npc.aimErrTimer = 0.25 + Math.random() * 0.35;
          }

          // Burst/cooldown pattern
          npc.burstCooldown = (npc.burstCooldown ?? 0) - dt;
          if ((npc.burstTimer ?? 0) <= 0 && (npc.burstCooldown ?? 0) <= 0) {
            npc.burstTimer = 0.3 + Math.random() * 0.5;
            npc.burstCooldown = npc.burstTimer + 0.4 + Math.random() * 0.8;
          }

          if ((npc.burstTimer ?? 0) > 0) {
            npc.burstTimer = (npc.burstTimer ?? 0) - dt;
            npc.timer -= dt;
            if (npc.timer <= 0) {
              npc.timer = 0.08 + Math.random() * 0.07;
              const bx = npc.mesh.position.x;
              const bz = npc.mesh.position.z;
              const by = npc.mesh.position.y + 1.5 + (npc.jumpY ?? 0);
              const bulletSpeed = 30;
              const pdx = targetX - bx;
              const pdy = targetY - by;
              const pdz = targetZ - bz;
              const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz) || 1;
              // Apply aim jitter perpendicular to aim
              const jitterX = (npc.aimErrX ?? 0);
              const jitterY = (npc.aimErrY ?? 0);
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
                vx: (pdx / pdist + jitterX) * bulletSpeed,
                vy: (pdy / pdist + jitterY) * bulletSpeed,
                vz: (pdz / pdist + jitterX) * bulletSpeed,
                life: 3,
                damage: 1,
                owner: npcIdx,
              });
            }
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
      npc.mesh.position.y = this.getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z) + (npc.jumpY ?? 0);

      if (Math.abs(npc.mesh.position.x) > 450) npc.vx *= -1;
      if (Math.abs(npc.mesh.position.z) > 450) npc.vz *= -1;

      // Smooth face movement direction — skip when engaging (combat branch sets facing toward target)
      const targetSpeed = Math.sqrt(npc.vx * npc.vx + npc.vz * npc.vz);
      npc.speed += (targetSpeed - npc.speed) * Math.min(dt * 8, 1);

      const inCombat = targetDist < aggroRange;
      if (!inCombat && targetSpeed > 0.1) {
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
    // Make player lie on the floor with X eyes
    if (this.playerModel) {
      // Lay the player on their back
      this.playerModel.rotation.x = -Math.PI / 2;
      const groundY = this.getTerrainHeight(this.playerModel.position.x, this.playerModel.position.z);
      this.playerModel.position.y = groundY + 0.3;

      // Add X eyes on the head
      const xMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const s of [-1, 1]) {
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), xMat);
        bar1.rotation.z = Math.PI / 4;
        bar1.position.set(s * 0.08, 0.05, 0.23);
        this.pHead.add(bar1);
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), xMat);
        bar2.rotation.z = -Math.PI / 4;
        bar2.position.set(s * 0.08, 0.05, 0.23);
        this.pHead.add(bar2);
      }

      // Reset limb poses so they look limp
      if (this.pTorso) this.pTorso.rotation.set(0, 0, 0);
      if (this.pLeftUpperArm) this.pLeftUpperArm.rotation.set(0, 0, 0.5);
      if (this.pRightUpperArm) this.pRightUpperArm.rotation.set(0, 0, -0.5);

      // Move camera to look down at the body
      this.camera.position.set(
        this.playerModel.position.x,
        groundY + 4,
        this.playerModel.position.z + 3
      );
      this.camera.lookAt(this.playerModel.position);

      // Render the death scene
      this.threeRenderer.render(this.scene3d, this.camera);
    }

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

    // Award 100 coins for clearing the world
    this.coinsEarned += 100;
    const totalCoins = addCoins(this.coinsEarned);

    const nextWorld = (this.currentWorld + 1) % 4;
    const nextWorldName = BattleScene.worldNames[nextWorld];

    const overlay = document.createElement('div');
    overlay.id = 'game-over';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div style="color:#44ff44;font:bold 72px Arial;text-shadow:0 0 20px #00ff00,0 0 40px #00aa00;margin-bottom:20px">VICTORY!</div>
      <div style="color:#cccccc;font:24px Arial;margin-bottom:10px">You cleared the ${BattleScene.worldNames[this.currentWorld % 4]}!</div>
      <div style="color:#ffdd00;font:bold 32px Arial;text-shadow:0 0 10px #ffaa00;margin-bottom:8px">+100 coins!</div>
      <div style="color:#ffdd00;font:16px Arial;margin-bottom:20px">Total: ${totalCoins} coins</div>
      <div style="color:#88ccff;font:bold 28px Arial;margin-bottom:30px">Next: ${nextWorldName} World</div>
      <button id="go-next" style="padding:15px 40px;background:#4488cc;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">NEXT WORLD →</button>
      <button id="go-quit" style="padding:15px 40px;background:#444;color:white;border:2px solid white;border-radius:10px;font:bold 22px Arial;cursor:pointer;margin:8px">QUIT</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('go-next')!.addEventListener('click', () => {
      overlay.remove();
      this.currentWorld = nextWorld;
      this.shutdown();
      this.scene.restart({
        characterKey: this.selectedCharKey,
        characterName: this.selectedCharName,
        mode: this.gameMode,
        world: nextWorld,
      });
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


  // ===== BATTLE MUSIC =====
  private startBattleMusic(): void {
    const base = (import.meta.env?.BASE_URL ?? '/') + 'sounds/';
    const audio = new Audio(base + 'fightingWarsTheme.mp3');
    audio.loop = true;
    audio.volume = 0.5;
    // Browsers block autoplay until first user gesture; retry on click/key
    const tryPlay = () => audio.play().catch(() => { /* ignore until gesture */ });
    tryPlay();
    const onGesture = () => { tryPlay(); window.removeEventListener('click', onGesture); window.removeEventListener('keydown', onGesture); };
    window.addEventListener('click', onGesture);
    window.addEventListener('keydown', onGesture);
    this.musicEl = audio;
  }

  private stopBattleMusic(): void {
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.src = '';
      this.musicEl = null;
    }
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

    // Helpers for richer synthesis.
    // Pink-ish noise: smoother than pure white noise, like real recorded crackle.
    let pinkB0 = 0, pinkB1 = 0, pinkB2 = 0;
    const pink = () => {
      const w = Math.random() * 2 - 1;
      pinkB0 = 0.997 * pinkB0 + w * 0.029591;
      pinkB1 = 0.985 * pinkB1 + w * 0.032534;
      pinkB2 = 0.95 * pinkB2 + w * 0.048056;
      return pinkB0 + pinkB1 + pinkB2 + w * 0.18;
    };
    // Simple one-pole low-pass filter for thickening.
    const lpFilter = (samples: number[], cutoff: number) => {
      const a = 1 - Math.exp(-2 * Math.PI * cutoff / sr);
      let y = 0;
      for (let i = 0; i < samples.length; i++) { y += a * (samples[i] - y); samples[i] = y; }
    };

    // Build a sound from a per-sample function, then optionally low-pass it.
    const makeFiltered = (dur: number, fn: (i: number, t: number) => number, lp?: number) => {
      const len = Math.floor(sr * dur);
      const buf = this.audioCtx.createBuffer(1, len, sr);
      const arr: number[] = new Array(len);
      for (let i = 0; i < len; i++) arr[i] = fn(i, i / sr);
      if (lp) lpFilter(arr, lp);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, arr[i]));
      return buf;
    };

    // Gunshot — short crack + low boom body + high-freq snap, low-passed for body.
    this.sfx.shoot = makeFiltered(0.4, (_i, t) => {
      const crack = pink() * Math.exp(-t * 35) * 1.6;          // explosive transient
      const boomFreq = 90 * Math.exp(-t * 8) + 50;
      const boom = Math.sin(2 * Math.PI * boomFreq * t) * Math.exp(-t * 9) * 0.9;
      const tailSnap = pink() * Math.exp(-t * 6) * 0.18;       // pop tail
      const echo = Math.sin(2 * Math.PI * 220 * (t - 0.06)) * (t > 0.06 ? Math.exp(-(t - 0.06) * 10) : 0) * 0.25;
      return crack + boom + tailSnap + echo;
    }, 6500);

    // Bullet impact — short body thud, mid frequency.
    this.sfx.hit = makeFiltered(0.2, (_i, t) => {
      const thud = Math.sin(2 * Math.PI * (220 + 80 * Math.exp(-t * 30)) * t) * Math.exp(-t * 22);
      const slap = pink() * Math.exp(-t * 60) * 0.7;
      return thud * 0.7 + slap * 0.5;
    }, 3500);

    // Footstep — soft crunch with brief mid-low body.
    this.sfx.step = makeFiltered(0.13, (_i, t) => {
      const crunch = pink() * Math.exp(-t * 45);
      const body = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 30) * 0.4;
      return crunch * 0.7 + body;
    }, 2500);

    // Car engine — like a small idling 4-stroke with throttle wobble.
    this.sfx.engine = makeFiltered(0.6, (_i, t) => {
      const f = 70 + Math.sin(t * 2.5) * 5;
      const fundamental = Math.sin(2 * Math.PI * f * t) * 0.55;
      const harm2 = Math.sin(2 * Math.PI * f * 2 * t) * 0.25;
      const harm3 = Math.sin(2 * Math.PI * f * 3.1 * t) * 0.12;
      const noise = pink() * 0.18;
      return fundamental + harm2 + harm3 + noise;
    }, 1800);

    // Car/quad hit — heavy crunch with metal ring.
    this.sfx.carHit = makeFiltered(0.5, (_i, t) => {
      const impact = Math.sin(2 * Math.PI * 130 * t) * Math.exp(-t * 11) * 0.9;
      const crunch = pink() * Math.exp(-t * 13) * 1.0;
      const metal = (Math.sin(2 * Math.PI * 1100 * t) + Math.sin(2 * Math.PI * 1850 * t) * 0.6) * Math.exp(-t * 18) * 0.45;
      return impact * 0.6 + crunch * 0.6 + metal;
    }, 5000);

    // Bear roar — gravelly low growl with breath rumble. Slow swell, then decay.
    this.sfx.roar = makeFiltered(0.9, (_i, t) => {
      const swell = Math.min(t * 12, 1) * (t < 0.7 ? 1 : Math.exp(-(t - 0.7) * 8));
      // Detuned low fundamentals create a beating "growl".
      const f = 70 + Math.sin(t * 11) * 6;
      const v1 = Math.sin(2 * Math.PI * f * t);
      const v2 = Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.6;
      const v3 = Math.sin(2 * Math.PI * (f * 2.07) * t) * 0.35;
      const breath = pink() * 0.4;
      return (v1 + v2 + v3 + breath) * swell * 0.9;
    }, 1600);

    // Water splash — burst of bright noise then bubbly tail.
    this.sfx.splash = makeFiltered(0.55, (_i, t) => {
      const splash = pink() * Math.exp(-t * 7) * 1.5;
      const bubble = Math.sin(2 * Math.PI * (700 + Math.sin(t * 50) * 250) * t) * Math.exp(-t * 8) * 0.35;
      return splash * 0.8 + bubble;
    }, 5500);

    // Pickup — happy two-note chime with quick decay.
    this.sfx.pickup = makeFiltered(0.32, (_i, t) => {
      const note1 = Math.sin(2 * Math.PI * 880 * t) * (t < 0.12 ? 1 : 0);
      const note2 = Math.sin(2 * Math.PI * 1320 * t) * (t >= 0.08 ? Math.exp(-(t - 0.08) * 6) : 0);
      return (note1 * 0.4 + note2 * 0.5) * Math.exp(-t * 4);
    });

    // Player hurt — pained "oof" with vibrato.
    this.sfx.hurt = makeFiltered(0.28, (_i, t) => {
      const fmFreq = 190 + Math.sin(t * 22) * 30;
      const tone = Math.sin(2 * Math.PI * fmFreq * t) * Math.exp(-t * 10) * 0.7;
      const grit = pink() * Math.exp(-t * 18) * 0.25;
      return tone + grit;
    }, 2200);

    // Drowning — gurgly bubbles.
    this.sfx.drown = makeFiltered(0.7, (_i, t) => {
      const gurgleFreq = 320 + Math.sin(t * 12) * 70 + Math.sin(t * 4) * 25;
      const tone = Math.sin(2 * Math.PI * gurgleFreq * t) * 0.5;
      const bubbles = pink() * (0.5 + Math.sin(t * 9) * 0.5) * 0.4;
      return (tone + bubbles) * Math.exp(-t * 2.5);
    }, 4000);

    // Boss death — massive explosion with shockwave + debris.
    this.sfx.bossDeath = makeFiltered(1.2, (_i, t) => {
      const env = Math.min(t * 30, 1);
      const boom = Math.sin(2 * Math.PI * (50 + 30 * Math.exp(-t * 4)) * t) * Math.exp(-t * 3.2) * 1.3;
      const blast = pink() * Math.exp(-t * 2.5) * 1.1;
      const debris = pink() * Math.exp(-Math.max(0, t - 0.3) * 4) * (t > 0.3 ? 0.6 : 0);
      const ring = Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 4.5) * 0.35;
      return env * (boom * 0.65 + blast * 0.55 + debris * 0.5 + ring);
    }, 3500);

    // Win fanfare — major triad ascending with fast attack/decay.
    this.sfx.win = makeFiltered(1.2, (_i, t) => {
      const env = Math.min(t * 20, 1) * Math.exp(-Math.max(0, t - 1.0) * 6);
      const stage = Math.floor(t / 0.22);
      const noteFreqs = [523.25, 659.25, 783.99, 1046.5];   // C5 E5 G5 C6
      const f = noteFreqs[Math.min(stage, 3)];
      const phase = t - stage * 0.22;
      const tone = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2 * t) * 0.3) * Math.exp(-phase * 3);
      return tone * 0.45 * env;
    }, 7000);

    // Swim — gentle water swoosh.
    this.sfx.swim = makeFiltered(0.4, (_i, t) => {
      const swoosh = pink() * Math.exp(-t * 5) * (0.5 + Math.sin(t * 6) * 0.4);
      const tone = Math.sin(2 * Math.PI * (260 + Math.sin(t * 9) * 30) * t) * Math.exp(-t * 4) * 0.18;
      return swoosh + tone;
    }, 3000);

    // Evil laugh — 4 "HA HA HA HA" bursts at descending pitch, with growl harmonics.
    // Each "HA" is a quick vowel attack with vibrato, separated by short gaps.
    this.sfx.evilLaugh = makeFiltered(1.2, (_i, t) => {
      const burstDur = 0.18;
      const gap = 0.08;
      const cycle = burstDur + gap;
      const burstIdx = Math.floor(t / cycle);
      const burstT = t - burstIdx * cycle;
      if (burstIdx >= 4 || burstT > burstDur) return 0;
      // Pitch descends with each burst (evil deepening). Open "AH" formant ~700Hz, second formant ~1100Hz.
      const pitch = 220 - burstIdx * 18;
      const env = Math.sin(Math.PI * burstT / burstDur); // bell-shaped
      const vibrato = Math.sin(2 * Math.PI * 24 * t) * 8;
      const fund = Math.sin(2 * Math.PI * (pitch + vibrato) * t);
      const harm2 = Math.sin(2 * Math.PI * (pitch + vibrato) * 2 * t) * 0.4;
      const harm3 = Math.sin(2 * Math.PI * (pitch + vibrato) * 3 * t) * 0.25;
      // Vowel formants — peaks around 700 and 1100 Hz
      const f1 = Math.sin(2 * Math.PI * 700 * t) * 0.18;
      const f2 = Math.sin(2 * Math.PI * 1100 * t) * 0.12;
      const breath = pink() * 0.18;
      return (fund + harm2 + harm3 + f1 + f2 + breath) * env * 0.7;
    }, 2200);

    // Asynchronously load REAL recorded audio files from public/sounds and replace the synth versions.
    // Anything that fails to load just keeps using the synthesized fallback above.
    this.loadRealSfx();
  }

  private async loadRealSfx(): Promise<void> {
    const base = (import.meta.env?.BASE_URL ?? '/') + 'sounds/';
    const files: Record<string, string> = {
      shoot: 'shoot.wav',
      hit: 'hit.wav',
      step: 'step.mp3',
      carHit: 'carHit.wav',
      pickup: 'pickup.wav',
      hurt: 'hurt.wav',
      bossDeath: 'bossDeath.wav',
      win: 'win.mp3',
      splash: 'splash.wav',
      evilLaugh: 'evilLaugh.mp3',
      roar: 'roar.mp3',
    };
    await Promise.all(Object.entries(files).map(async ([key, file]) => {
      try {
        const res = await fetch(base + file);
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        const buffer = await this.audioCtx.decodeAudioData(data);
        this.sfx[key] = buffer;
      } catch { /* keep synth fallback */ }
    }));
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

  /** Snowman crumble — spawn snow chunks at the snowman's body that fall and fade */
  private crumbleSnowman(pos: THREE.Vector3): void {
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xddddee, roughness: 0.7, transparent: true, opacity: 1 });
    const darkSnowMat = new THREE.MeshStandardMaterial({ color: 0x8a8a95, roughness: 0.5, transparent: true, opacity: 1 });
    const chunks: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number }[] = [];

    // Make ~25 chunks of varying sizes
    for (let i = 0; i < 25; i++) {
      const size = 0.15 + Math.random() * 0.35;
      const geo = Math.random() < 0.5
        ? new THREE.SphereGeometry(size, 5, 5)
        : new THREE.BoxGeometry(size * 1.4, size * 1.4, size * 1.4);
      const mat = (Math.random() < 0.6 ? snowMat : darkSnowMat).clone();
      const chunk = new THREE.Mesh(geo, mat);
      // Spawn around body at varying heights
      chunk.position.set(
        pos.x + (Math.random() - 0.5) * 1.2,
        pos.y + 1 + Math.random() * 2.5,
        pos.z + (Math.random() - 0.5) * 1.2,
      );
      this.scene3d.add(chunk);
      chunks.push({
        mesh: chunk,
        vx: (Math.random() - 0.5) * 3,
        vy: 5 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 3,
        rx: (Math.random() - 0.5) * 20,
        ry: (Math.random() - 0.5) * 20,
        rz: (Math.random() - 0.5) * 20,
      });
    }

    // Fast scatter phase — chunks fly out and land
    const scatterDuration = 0.5;
    let elapsed = 0;
    const step = 0.016;
    const settled = new Set<number>();
    const animate = () => {
      elapsed += step;
      const t = elapsed / scatterDuration;

      for (let ci = 0; ci < chunks.length; ci++) {
        const c = chunks[ci];
        if (settled.has(ci)) continue;
        c.vy -= 40 * step; // strong gravity
        c.mesh.position.x += c.vx * step * 15;
        c.mesh.position.y += c.vy * step;
        c.mesh.position.z += c.vz * step * 15;
        // Land on ground and stay
        const groundY = this.getTerrainHeight(c.mesh.position.x, c.mesh.position.z);
        if (c.mesh.position.y < groundY + 0.05) {
          c.mesh.position.y = groundY + 0.05;
          settled.add(ci);
          continue;
        }
        c.mesh.rotation.x += c.rx * step;
        c.mesh.rotation.y += c.ry * step;
        c.mesh.rotation.z += c.rz * step;
      }

      if (t < 1 || settled.size < chunks.length) {
        requestAnimationFrame(animate);
      }
      // Chunks stay on the ground — no fade, no removal
    };
    animate();
  }

  /** Helper to create + position a mesh in one line */
  private makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotX = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotX) m.rotation.x = rotX;
    return m;
  }

  /** Pick the right first-person gun model for the active weapon */
  private updateFpGunModel(): void {
    if (!this.fpGuns) return;
    // Map weapon names → gun model keys
    const map: Record<string, string> = {
      'Pistol': 'pistol',
      'Revolver': 'pistol',
      'Shotgun': 'shotgun',
      'Heavy Shotgun': 'shotgun',
      'SMG': 'ar',
      'Assault Rifle': 'ar',
      'Burst Rifle': 'ar',
      'Drum Gun': 'ar',
      'Sniper': 'sniper',
      'Minigun': 'minigun',
      'BB Gun': 'bb_gun',
      'RPG': 'rpg',
      'Gold SCAR': 'gold_scar',
    };
    const activeKey = map[this.playerGun] || null;
    for (const k in this.fpGuns) {
      this.fpGuns[k].visible = (k === activeKey);
    }
    // Show the 3rd-person AR rifle on the player when they have an AR-class gun equipped.
    if (this.pThirdGun) {
      this.pThirdGun.visible = activeKey === 'ar';
    }
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
        // Starting ammo when you pick up a gun (melee weapons get nothing — they don't use bullets)
        const wep = Object.values(WEAPONS).find(w => w.name === gun.name);
        if (wep && wep.type !== 'melee') this.playerAmmo = Math.max(this.playerAmmo, 120);
        this.updateAmmoText();
        this.showPickupMsg('Picked up ' + gun.name + '!');
        this.playSfx('pickup', 0.5);
      }
    }

    // Bullet boxes
    for (const a of this.ammoPickups) {
      if (a.picked) continue;
      const dx = a.group.position.x - px;
      const dz = a.group.position.z - pz;
      if (dx * dx + dz * dz < pickRange * pickRange) {
        a.picked = true;
        this.scene3d.remove(a.group);
        this.playerAmmo += 80;
        this.updateAmmoText();
        this.showPickupMsg('+80 bullets!');
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
        this.showPickupMsg(`+25 HP from ${ch.name === 'cookie' ? 'cookie' : 'pizza'}!`);
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
      <div id="hud-ammo" style="position:absolute;top:${mob?'calc(env(safe-area-inset-top, 10px) + 52px)':'76px'};left:15px;color:#ffeebb;font:bold ${mob?14:18}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none">
        Bullets: 0
      </div>
      <div id="hud-alive" style="position:absolute;top:${mob?'calc(env(safe-area-inset-top, 10px) + 76px)':'104px'};left:15px;color:#ff8844;font:bold ${mob?16:20}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none">
        Alive: 20
      </div>
      <div id="hud-world" style="position:absolute;top:${mob?'calc(env(safe-area-inset-top, 10px) + 100px)':'132px'};left:15px;color:#88ccff;font:bold ${mob?14:18}px Arial;text-shadow:2px 2px 4px black;-webkit-user-select:none;cursor:pointer;pointer-events:auto">
        ${BattleScene.worldNames[this.currentWorld % 4]} World
      </div>
      <div id="hud-pickup" style="position:absolute;top:35%;left:50%;transform:translate(-50%,0);color:#ffffff;font:bold ${mob?20:22}px Arial;text-shadow:2px 2px 6px black;opacity:0;transition:opacity 0.3s;-webkit-user-select:none">
      </div>
      <button id="hud-pause" style="position:absolute;top:${mob?'env(safe-area-inset-top, 10px)':'15px'};right:15px;padding:${mob?'8px 16px':'10px 22px'};background:rgba(40,90,200,0.8);color:white;border:2px solid white;border-radius:8px;font:bold ${mob?14:18}px Arial;cursor:pointer;z-index:100;-webkit-user-select:none;pointer-events:auto">PAUSE</button>
    `;
    document.body.appendChild(hud);
    this.hudDiv = hud;
    this.hpText = document.getElementById('hud-hp') as HTMLDivElement;
    this.gunText = document.getElementById('hud-gun') as HTMLDivElement;
    this.ammoText = document.getElementById('hud-ammo') as HTMLDivElement;
    this.aliveText = document.getElementById('hud-alive') as HTMLDivElement;
    this.updateAmmoText();
    this.pickupMsg = document.getElementById('hud-pickup') as HTMLDivElement;
    const pauseBtn = document.getElementById('hud-pause')!;
    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
    // Click world name to switch to next world
    const worldDiv = document.getElementById('hud-world')!;
    worldDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextWorld = (this.currentWorld + 1) % 4;
      const lx = this.playerPos.x;
      const lz = this.playerPos.z;
      const la = this.lookAngle;
      const lp = this.lookPitch;
      this.shutdown();
      this.scene.restart({ world: nextWorld, landX: lx, landZ: lz, lookAngle: la, lookPitch: lp });
    });
    // Also listen for Escape to exit pointer lock so user can click pause
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        pauseBtn.style.pointerEvents = 'auto';
      }
    });
  }

  private togglePause(): void {
    if (this.paused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGpRaf: number = 0;
  private pauseGame(): void {
    if (this.paused) return;
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const pauseBtn = document.getElementById('hud-pause');
    if (pauseBtn) pauseBtn.textContent = 'RESUME';
    if (document.getElementById('pause-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2147483000;-webkit-user-select:none';
    overlay.innerHTML = `
      <div style="color:white;font:bold 64px Arial;text-shadow:3px 3px 8px black;margin-bottom:30px">PAUSED</div>
      <button id="pause-quit" style="padding:16px 50px;background:rgba(200,40,40,0.9);color:white;border:3px solid white;border-radius:12px;font:bold 26px Arial;cursor:pointer;margin:10px">QUIT TO TITLE</button>
      <button id="pause-resume" style="padding:16px 50px;background:rgba(40,160,60,0.9);color:white;border:3px solid white;border-radius:12px;font:bold 26px Arial;cursor:pointer;margin:10px">RESUME</button>
    `;
    document.body.appendChild(overlay);
    const resumeBtn = document.getElementById('pause-resume') as HTMLButtonElement;
    const quitBtn = document.getElementById('pause-quit') as HTMLButtonElement;
    const doQuit = () => {
      this.resumeGame();
      this.shutdown();
      this.scene.start('TitleScene');
    };
    resumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resumeGame();
    });
    quitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doQuit();
    });

    // Gamepad navigation between QUIT and RESUME
    let focus: 'quit' | 'resume' = 'resume';
    const applyFocus = () => {
      resumeBtn.style.outline = focus === 'resume' ? '4px solid #ffffff' : 'none';
      resumeBtn.style.outlineOffset = '3px';
      quitBtn.style.outline = focus === 'quit' ? '4px solid #ffffff' : 'none';
      quitBtn.style.outlineOffset = '3px';
    };
    applyFocus();
    const gpPrev: Record<string, boolean> = {};
    const poll = () => {
      if (!this.paused || !document.getElementById('pause-overlay')) {
        this.pauseGpRaf = 0;
        return;
      }
      const pads = navigator.getGamepads?.();
      if (pads) {
        for (const gp of pads) {
          if (!gp) continue;
          const ay = gp.axes[1] || 0;
          const up = !!gp.buttons[12]?.pressed || ay < -0.5;
          const down = !!gp.buttons[13]?.pressed || ay > 0.5;
          const confirm = !!gp.buttons[0]?.pressed;
          const back = !!gp.buttons[1]?.pressed || !!gp.buttons[9]?.pressed;
          const edge = (k: string, cur: boolean) => {
            const prev = !!gpPrev[k]; gpPrev[k] = cur; return cur && !prev;
          };
          if (edge('up', up)) { focus = 'quit'; applyFocus(); }
          if (edge('down', down)) { focus = 'resume'; applyFocus(); }
          if (edge('confirm', confirm)) {
            if (focus === 'resume') this.resumeGame();
            else doQuit();
            return;
          }
          if (edge('back', back)) {
            this.resumeGame();
            return;
          }
          break;
        }
      }
      this.pauseGpRaf = requestAnimationFrame(poll);
    };
    this.pauseGpRaf = requestAnimationFrame(poll);
  }

  private resumeGame(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.pauseGpRaf) { cancelAnimationFrame(this.pauseGpRaf); this.pauseGpRaf = 0; }
    const pauseBtn = document.getElementById('hud-pause');
    if (pauseBtn) pauseBtn.textContent = 'PAUSE';
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.remove();
    // Reset clock so the next dt isn't huge
    if (this.clock) this.clock.getDelta();
  }

  update(): void {
    // Phaser update not used — Three.js has its own loop
  }

  shutdown(): void {
    cancelAnimationFrame(this.animFrameId);
    this.stopBattleMusic();
    this.threeRenderer.domElement.remove();
    this.threeRenderer.dispose();
    const hud = document.getElementById('hud-3d');
    if (hud) hud.remove();
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) pauseOverlay.remove();
    this.paused = false;
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
