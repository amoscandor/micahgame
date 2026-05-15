import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { CHAR_VISUALS } from './BattleScene';
import { getCoins, spendCoins, addCoins } from '../utils/coinStore';

const DRAW_KEY = 'fighting-wars-skin-drawing';
const SKINS_LIST_KEY = 'fighting-wars-skins-list';
const ACTIVE_SKIN_KEY = 'fighting-wars-active-skin-id';
const TEX_SIZE = 32; // pixels per body part texture (pixelated like Minecraft)

interface SavedSkin {
  id: string;
  name: string;
  data: Record<string, (string | null)[][]>;
  thumb?: string;
}

function getSkinsList(): SavedSkin[] {
  try {
    const raw = localStorage.getItem(SKINS_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_e) { /* ignore */ }
  // Migrate old single skin if it exists
  const oldData = localStorage.getItem(DRAW_KEY);
  if (oldData) {
    try {
      const data = JSON.parse(oldData);
      const oldName = localStorage.getItem('fighting-wars-skin-name') || 'My Skin';
      const oldThumb = localStorage.getItem('fighting-wars-skin-thumb') || undefined;
      const skin: SavedSkin = { id: 'skin-0', name: oldName, data, thumb: oldThumb };
      localStorage.setItem(SKINS_LIST_KEY, JSON.stringify([skin]));
      localStorage.setItem(ACTIVE_SKIN_KEY, skin.id);
      return [skin];
    } catch (_e) { /* ignore */ }
  }
  return [];
}

function saveSkinsList(skins: SavedSkin[]): void {
  localStorage.setItem(SKINS_LIST_KEY, JSON.stringify(skins));
}

function getActiveSkinId(): string | null {
  return localStorage.getItem(ACTIVE_SKIN_KEY);
}

function setActiveSkinId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_SKIN_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_SKIN_KEY);
  }
}

function getActiveSkinData(): Record<string, (string | null)[][]> | null {
  const skins = getSkinsList();
  const activeId = getActiveSkinId();
  if (!activeId) return null;
  const skin = skins.find(s => s.id === activeId);
  return skin?.data || null;
}

export class DrawOnSkinScene extends Phaser.Scene {
  private currentColor = '#ff0000';
  private overlayEl: HTMLDivElement | null = null;
  private isEraser = false;
  private brushSize = 1;
  private renderer3d: THREE.WebGLRenderer | null = null;
  private scene3d: THREE.Scene | null = null;
  private camera3d: THREE.PerspectiveCamera | null = null;
  private charRoot: THREE.Group | null = null;
  private raycaster = new THREE.Raycaster();
  private animId = 0;
  private gpPrev: Record<string, boolean> = {};
  // gamepad cursor in NDC (-1..1)
  private gpCursorX = 0;
  private gpCursorY = 0;
  private gpColorIdx = 5; // red
  private gpCursorEl: HTMLDivElement | null = null;
  private gpPaintAtNdc: ((x: number, y: number) => boolean) | null = null;
  private gpRotate: ((d: number) => void) | null = null;
  private gpSetColorByIdx: ((idx: number) => void) | null = null;
  private gpSetBrush: ((size: number) => void) | null = null;
  private gpToggleEraser: (() => void) | null = null;
  private gpClearAll: (() => void) | null = null;
  private gpSave: (() => void) | null = null;

  constructor() {
    super({ key: 'DrawOnSkinScene' });
  }

  update(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;

      // Back: B
      const back = !!gp.buttons[1]?.pressed;
      if (back && !this.gpPrev['back']) {
        this.cleanup();
        this.scene.start('CharacterSelectScene');
        this.gpPrev['back'] = back;
        return;
      }
      this.gpPrev['back'] = back;

      // Left stick: move paint cursor in NDC space
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      const dz = 0.15;
      const spd = 0.025;
      if (Math.abs(lx) > dz) this.gpCursorX = Math.max(-1, Math.min(1, this.gpCursorX + lx * spd));
      if (Math.abs(ly) > dz) this.gpCursorY = Math.max(-1, Math.min(1, this.gpCursorY - ly * spd));
      if (this.gpCursorEl) {
        const leftPct = ((this.gpCursorX + 1) / 2) * 100;
        const topPct = ((1 - (this.gpCursorY + 1) / 2)) * 100;
        this.gpCursorEl.style.left = leftPct + '%';
        this.gpCursorEl.style.top = topPct + '%';
        this.gpCursorEl.style.display = 'block';
      }

      // Right stick X: rotate model
      const rx = gp.axes[2] || 0;
      if (Math.abs(rx) > dz && this.gpRotate) this.gpRotate(rx * 0.04);

      // A: paint (hold)
      const paint = !!gp.buttons[0]?.pressed;
      if (paint && this.gpPaintAtNdc) this.gpPaintAtNdc(this.gpCursorX, this.gpCursorY);
      this.gpPrev['paint'] = paint;

      // D-pad left/right: cycle colors (button 14/15)
      const dl = !!gp.buttons[14]?.pressed;
      const dr = !!gp.buttons[15]?.pressed;
      if (dl && !this.gpPrev['dl'] && this.gpSetColorByIdx) {
        this.gpColorIdx = (this.gpColorIdx + 24) % 25;
        this.gpSetColorByIdx(this.gpColorIdx);
      }
      this.gpPrev['dl'] = dl;
      if (dr && !this.gpPrev['dr'] && this.gpSetColorByIdx) {
        this.gpColorIdx = (this.gpColorIdx + 1) % 25;
        this.gpSetColorByIdx(this.gpColorIdx);
      }
      this.gpPrev['dr'] = dr;

      // D-pad up/down: brush size (button 12/13)
      const du = !!gp.buttons[12]?.pressed;
      const dd = !!gp.buttons[13]?.pressed;
      if (du && !this.gpPrev['du'] && this.gpSetBrush) {
        this.gpSetBrush(Math.min(8, this.brushSize + 1));
      }
      this.gpPrev['du'] = du;
      if (dd && !this.gpPrev['dd'] && this.gpSetBrush) {
        this.gpSetBrush(Math.max(1, this.brushSize - 1));
      }
      this.gpPrev['dd'] = dd;

      // Y: toggle eraser (button 3)
      const yBtn = !!gp.buttons[3]?.pressed;
      if (yBtn && !this.gpPrev['y'] && this.gpToggleEraser) this.gpToggleEraser();
      this.gpPrev['y'] = yBtn;

      // X: clear all (button 2)
      const xBtn = !!gp.buttons[2]?.pressed;
      if (xBtn && !this.gpPrev['x'] && this.gpClearAll) this.gpClearAll();
      this.gpPrev['x'] = xBtn;

      // Start/Menu: save (button 9)
      const start = !!gp.buttons[9]?.pressed;
      if (start && !this.gpPrev['start'] && this.gpSave) this.gpSave();
      this.gpPrev['start'] = start;

      break;
    }
  }

  create(): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75);
    this.createOverlay();
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private createOverlay(): void {
    // Load character visuals
    let vis = { shirt: 0x2288ff, skin: 0xf0c8a0, pants: 0x1a1a3a, hair: 0x553311, eye: 0x2266cc };
    const selectedKey = localStorage.getItem('selectedCharKey') || 'char-0';
    if (selectedKey.startsWith('char-custom-') || selectedKey.startsWith('char-shop-')) {
      try {
        const saved = JSON.parse(localStorage.getItem('customCharacters') || '[]');
        const custom = saved.find((ch: { key: string }) => ch.key === selectedKey);
        if (custom) {
          vis = { shirt: custom.shirtColor, skin: custom.skinColor, pants: custom.pantsColor, hair: custom.hairColor || 0x0e0e0e, eye: 0x4a5a3a };
        }
      } catch (_e) { /* ignore */ }
    } else {
      const idx = parseInt(selectedKey.replace('char-', ''), 10);
      if (idx >= 0 && idx < CHAR_VISUALS.length) vis = CHAR_VISUALS[idx];
    }

    const isShort = window.innerHeight < 500;
    // Reserve 48px at the top for the BACK/DONE buttons so everything else fits under them.
    const phoneTopPad = 48;
    const phoneBotPad = 4;
    const availH = `calc(100vh - ${phoneTopPad + phoneBotPad}px)`;

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);overflow:hidden;${isShort ? `padding:${phoneTopPad}px 4px ${phoneBotPad}px;box-sizing:border-box;` : ''}`;

    const container = document.createElement('div');
    container.style.cssText = `display:flex;gap:${isShort ? 4 : 12}px;align-items:center;padding:${isShort ? 2 : 8}px;max-width:100%;max-height:100%;box-sizing:border-box;`;

    // === 3D CANVAS ===
    const canvas3d = document.createElement('canvas');
    const SIZE = 512;
    canvas3d.width = SIZE;
    canvas3d.height = SIZE;
    // On phones, cap canvas to the content area so it can never push other things off-screen.
    // Side panels (128 + 88) + gaps (12) = 228 reserved, so canvas width <= 100vw - 228.
    const canvasCssSize = isShort ? '80px' : '55vmin';
    canvas3d.style.cssText = `width:${canvasCssSize};height:${canvasCssSize};border:2px solid #44aaff;border-radius:4px;cursor:crosshair;touch-action:none;flex-shrink:0;`;

    // Three.js setup
    const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x222222, 1);
    this.renderer3d = renderer;

    const scene = new THREE.Scene();
    this.scene3d = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 1.0, 5.2);
    camera.lookAt(0, 1.0, 0);
    this.camera3d = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 3);
    scene.add(dir);

    // Create paintable textures for each body part
    const paintableTextures: Map<THREE.Mesh, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; name: string }> = new Map();

    const makePaintable = (baseColor: number, name: string): { mat: THREE.MeshStandardMaterial; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } => {
      const c = document.createElement('canvas');
      c.width = TEX_SIZE;
      c.height = TEX_SIZE;
      const ctx = c.getContext('2d')!;
      // Fill with base color
      const r = (baseColor >> 16) & 0xff, g = (baseColor >> 8) & 0xff, b = baseColor & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
      return { mat, canvas: c, ctx, tex };
    };

    const registerPaintable = (mesh: THREE.Mesh, data: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }, name: string) => {
      paintableTextures.set(mesh, { ...data, name });
    };

    // Build character (same as BattleScene)
    const root = new THREE.Group();
    this.charRoot = root;

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);

    const beltData = makePaintable(0xffffff, 'belt');
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.28), beltData.mat);
    hips.add(belt);
    registerPaintable(belt, beltData, 'belt');

    const torso = new THREE.Group();
    torso.position.y = 0.05;
    hips.add(torso);

    const chestData = makePaintable(0xffffff, 'chest');
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), chestData.mat);
    chest.position.y = 0.3;
    torso.add(chest);
    registerPaintable(chest, chestData, 'chest');

    const neckData = makePaintable(0xffffff, 'neck');
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), neckData.mat);
    neck.position.y = 0.6;
    torso.add(neck);
    registerPaintable(neck, neckData, 'neck');

    // Head — plain white, no hair
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.72;
    torso.add(headGroup);
    const headData = makePaintable(0xffffff, 'head');
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), headData.mat);
    headMesh.scale.set(1, 1.15, 1);
    headGroup.add(headMesh);
    registerPaintable(headMesh, headData, 'head');

    // No eyes — plain white head, user can paint them on

    // Arms
    const makeArm = (sideX: number, name: string) => {
      const upperArm = new THREE.Group();
      upperArm.position.set(sideX, 0.48, 0);
      torso.add(upperArm);
      const uData = makePaintable(0xffffff, name + '_upper');
      const uMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), uData.mat);
      uMesh.position.y = -0.14;
      upperArm.add(uMesh);
      registerPaintable(uMesh, uData, name + '_upper');

      const forearm = new THREE.Group();
      forearm.position.y = -0.28;
      upperArm.add(forearm);
      const fData = makePaintable(0xffffff, name + '_fore');
      const fMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), fData.mat);
      fMesh.position.y = -0.12;
      forearm.add(fMesh);
      registerPaintable(fMesh, fData, name + '_fore');

      const handData = makePaintable(0xffffff, name + '_hand');
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), handData.mat);
      hand.position.y = -0.27;
      forearm.add(hand);
      registerPaintable(hand, handData, name + '_hand');
    };
    makeArm(-0.3, 'lArm');
    makeArm(0.3, 'rArm');

    // Legs
    const makeLeg = (sideX: number, name: string) => {
      const thigh = new THREE.Group();
      thigh.position.set(sideX, 0, 0);
      hips.add(thigh);
      const tData = makePaintable(0xffffff, name + '_thigh');
      const tMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), tData.mat);
      tMesh.position.y = -0.2;
      thigh.add(tMesh);
      registerPaintable(tMesh, tData, name + '_thigh');

      const shin = new THREE.Group();
      shin.position.y = -0.38;
      thigh.add(shin);
      const sData = makePaintable(0xffffff, name + '_shin');
      const sMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), sData.mat);
      sMesh.position.y = -0.16;
      shin.add(sMesh);
      registerPaintable(sMesh, sData, name + '_shin');

      const shoeData = makePaintable(0xffffff, name + '_shoe');
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), shoeData.mat);
      shoe.position.set(0, -0.35, 0.04);
      shin.add(shoe);
      registerPaintable(shoe, shoeData, name + '_shoe');
    };
    makeLeg(-0.12, 'lLeg');
    makeLeg(0.12, 'rLeg');

    // Shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    scene.add(root);

    // Load active skin data
    let currentSkinId = getActiveSkinId();
    const loadSkinData = (data: Record<string, (string | null)[][]> | null) => {
      // Reset all to white first
      for (const [, info] of paintableTextures) {
        info.ctx.fillStyle = 'rgb(255,255,255)';
        info.ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        info.tex.needsUpdate = true;
      }
      if (!data) return;
      for (const [, info] of paintableTextures) {
        const partData = data[info.name];
        if (partData && Array.isArray(partData)) {
          for (let y = 0; y < TEX_SIZE; y++) {
            for (let x = 0; x < TEX_SIZE; x++) {
              const color = partData[y]?.[x];
              if (color) {
                info.ctx.fillStyle = color;
                info.ctx.fillRect(x, y, 1, 1);
              }
            }
          }
          info.tex.needsUpdate = true;
        }
      }
    };
    const activeData = getActiveSkinData();
    loadSkinData(activeData);

    // === ROTATION + PAINTING ===
    let rotating = false;
    let painting = false;
    let lastMouseX = 0;
    let rotY = 0;

    const getClientPos = (e: MouseEvent | TouchEvent) => {
      const touch = 'touches' in e ? e.touches[0] || e.changedTouches[0] : e;
      return { x: (touch as MouseEvent).clientX, y: (touch as MouseEvent).clientY };
    };

    const getNDC = (e: MouseEvent | TouchEvent) => {
      const rect = canvas3d.getBoundingClientRect();
      const { x, y } = getClientPos(e);
      return new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
      );
    };

    const paintAtNdc = (ndcX: number, ndcY: number): boolean => {
      const ndc = new THREE.Vector2(ndcX, ndcY);
      this.raycaster.setFromCamera(ndc, camera);
      const meshes: THREE.Mesh[] = [];
      root.traverse(obj => { if (obj instanceof THREE.Mesh && paintableTextures.has(obj)) meshes.push(obj); });
      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const mesh = hit.object as THREE.Mesh;
        const info = paintableTextures.get(mesh);
        if (info && hit.uv) {
          const cx = Math.floor(hit.uv.x * TEX_SIZE);
          const cy = Math.floor((1 - hit.uv.y) * TEX_SIZE);
          const bs = this.brushSize;
          for (let dy = -bs + 1; dy < bs; dy++) {
            for (let dx = -bs + 1; dx < bs; dx++) {
              const px = cx + dx;
              const py = cy + dy;
              if (px < 0 || px >= TEX_SIZE || py < 0 || py >= TEX_SIZE) continue;
              if (this.isEraser) {
                const baseColor = (mesh.material as THREE.MeshStandardMaterial).color?.getHex() || 0x888888;
                const r = (baseColor >> 16) & 0xff, g = (baseColor >> 8) & 0xff, b = baseColor & 0xff;
                info.ctx.fillStyle = `rgb(${r},${g},${b})`;
              } else {
                info.ctx.fillStyle = this.currentColor;
              }
              info.ctx.fillRect(px, py, 1, 1);
            }
          }
          info.tex.needsUpdate = true;
        }
        return true;
      }
      return false;
    };

    const paintAt = (e: MouseEvent | TouchEvent) => {
      const ndc = getNDC(e);
      return paintAtNdc(ndc.x, ndc.y);
    };
    this.gpPaintAtNdc = paintAtNdc;
    this.gpRotate = (d: number) => { rotY += d; root.rotation.y = rotY; };

    const onStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x } = getClientPos(e);
      lastMouseX = x;
      // Try painting first
      if (paintAt(e)) {
        painting = true;
      } else {
        rotating = true;
      }
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (painting) {
        paintAt(e);
      } else if (rotating) {
        const { x } = getClientPos(e);
        const dx = x - lastMouseX;
        rotY += dx * 0.01;
        root.rotation.y = rotY;
        lastMouseX = x;
      }
    };

    const onEnd = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      painting = false;
      rotating = false;
    };

    canvas3d.addEventListener('mousedown', onStart);
    canvas3d.addEventListener('mousemove', onMove);
    canvas3d.addEventListener('mouseup', onEnd);
    canvas3d.addEventListener('mouseleave', onEnd);
    canvas3d.addEventListener('touchstart', onStart, { passive: false });
    canvas3d.addEventListener('touchmove', onMove, { passive: false });
    canvas3d.addEventListener('touchend', onEnd, { passive: false });

    // Wrap canvas + cursor so cursor can be positioned relative to the canvas
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;display:inline-block;';
    canvasWrap.appendChild(canvas3d);
    const cursorEl = document.createElement('div');
    cursorEl.style.cssText = 'position:absolute;width:16px;height:16px;border:2px solid #ffff00;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 4px #000;display:none;';
    canvasWrap.appendChild(cursorEl);
    this.gpCursorEl = cursorEl;
    container.appendChild(canvasWrap);

    // === CONTROLS ===
    const controls = document.createElement('div');
    controls.style.cssText = `display:flex;flex-direction:column;gap:${isShort ? 2 : 6}px;${isShort ? `width:128px;flex-shrink:0;max-height:${availH};overflow-y:auto;-webkit-overflow-scrolling:touch;` : 'max-width:160px;'}`;

    if (!isShort) {
      const title = document.createElement('div');
      title.textContent = 'PAINT ON SKIN';
      title.style.cssText = 'color:#44aaff;font:bold 14px "Arial Black";text-align:center;';
      controls.appendChild(title);

      const hint = document.createElement('div');
      hint.textContent = 'Tap character to paint. Drag empty space to rotate.';
      hint.style.cssText = 'color:#888;font:10px Arial;text-align:center;';
      controls.appendChild(hint);
    }

    // Colors
    const colors = [
      '#ffffff', '#c0c0c0', '#808080', '#404040', '#000000',
      '#ff0000', '#ff6600', '#ffcc00', '#ffff00', '#88ff00',
      '#00ff00', '#00ffaa', '#00ccff', '#0066ff', '#0000ff',
      '#6600ff', '#cc00ff', '#ff00cc', '#ff6688', '#884422',
      '#cc8855', '#ffbb88', '#ffddbb', '#556b2f', '#2e8b57',
    ];

    const colorGrid = document.createElement('div');
    colorGrid.style.cssText = `display:grid;grid-template-columns:repeat(5,1fr);gap:${isShort ? 1 : 2}px;`;
    const swatches: HTMLDivElement[] = [];
    const swatchSize = isShort ? 14 : 24;
    for (const c of colors) {
      const swatch = document.createElement('div');
      swatch.style.cssText = `width:${swatchSize}px;height:${swatchSize}px;background:${c};border:${isShort ? 1 : 2}px solid #333;border-radius:2px;cursor:pointer;`;
      swatch.addEventListener('click', () => {
        this.currentColor = c;
        this.isEraser = false;
        swatches.forEach(d => d.style.borderColor = '#333');
        swatch.style.borderColor = '#fff';
        eraserBtn.style.background = '#555';
      });
      if (c === '#ff0000') swatch.style.borderColor = '#fff';
      swatches.push(swatch);
      colorGrid.appendChild(swatch);
    }
    controls.appendChild(colorGrid);
    this.gpSetColorByIdx = (idx: number) => {
      const c = colors[idx];
      if (!c) return;
      this.currentColor = c;
      this.isEraser = false;
      swatches.forEach(d => d.style.borderColor = '#333');
      swatches[idx].style.borderColor = '#fff';
      eraserBtn.style.background = '#555';
    };

    // Brush size
    const sizeLabel = document.createElement('div');
    sizeLabel.textContent = 'Brush: 1';
    sizeLabel.style.cssText = `color:#fff;font:bold ${isShort ? 9 : 11}px Arial;text-align:center;`;
    controls.appendChild(sizeLabel);

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '1';
    sizeSlider.max = '8';
    sizeSlider.value = '1';
    sizeSlider.style.cssText = `width:100%;${isShort ? 'height:12px;margin:0;' : ''}`;
    sizeSlider.addEventListener('input', () => {
      this.brushSize = parseInt(sizeSlider.value, 10);
      sizeLabel.textContent = `Brush: ${sizeSlider.value}`;
    });
    controls.appendChild(sizeSlider);
    this.gpSetBrush = (size: number) => {
      this.brushSize = size;
      sizeSlider.value = String(size);
      sizeLabel.textContent = `Brush: ${size}`;
    };

    const eraserBtn = document.createElement('button');
    eraserBtn.textContent = 'ERASER';
    eraserBtn.style.cssText = `padding:${isShort ? 3 : 6}px;font:bold ${isShort ? 9 : 11}px Arial;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;`;
    eraserBtn.addEventListener('click', () => {
      this.isEraser = true;
      swatches.forEach(d => d.style.borderColor = '#333');
      eraserBtn.style.background = '#ff8844';
    });
    controls.appendChild(eraserBtn);
    this.gpToggleEraser = () => { eraserBtn.click(); };

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'CLEAR ALL';
    clearBtn.style.cssText = `padding:${isShort ? 3 : 6}px;font:bold ${isShort ? 9 : 11}px Arial;background:#aa2222;color:#fff;border:none;border-radius:4px;cursor:pointer;`;
    clearBtn.addEventListener('click', () => {
      for (const [, info] of paintableTextures) {
        // Reset to base — re-fill with original material color
        info.ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        info.tex.needsUpdate = true;
      }
      // Reset all to white
      for (const [, info] of paintableTextures) {
        info.ctx.fillStyle = 'rgb(255,255,255)';
        info.ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        info.tex.needsUpdate = true;
      }
    });
    controls.appendChild(clearBtn);
    this.gpClearAll = () => { clearBtn.click(); };

    // Skin name input
    if (!isShort) {
      const nameLabel = document.createElement('div');
      nameLabel.textContent = 'Skin Name:';
      nameLabel.style.cssText = 'color:#aaa;font:bold 10px Arial;';
      controls.appendChild(nameLabel);
    }

    const skins = getSkinsList();
    const activeSkin = skins.find(s => s.id === currentSkinId);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = activeSkin?.name || 'My Skin';
    nameInput.maxLength = 20;
    nameInput.placeholder = 'Skin Name';
    nameInput.style.cssText = `width:100%;padding:${isShort ? 3 : 6}px;font:bold ${isShort ? 10 : 12}px Arial;background:#333;color:#fff;border:${isShort ? 1 : 2}px solid #555;border-radius:4px;box-sizing:border-box;`;
    controls.appendChild(nameInput);

    const getCurrentPixelData = (): Record<string, (string | null)[][]> => {
      const saveData: Record<string, (string | null)[][]> = {};
      for (const [, info] of paintableTextures) {
        const imgData = info.ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        const partPixels: (string | null)[][] = [];
        for (let y = 0; y < TEX_SIZE; y++) {
          partPixels[y] = [];
          for (let x = 0; x < TEX_SIZE; x++) {
            const i = (y * TEX_SIZE + x) * 4;
            const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2], a = imgData.data[i + 3];
            if (a > 0) {
              partPixels[y][x] = `rgb(${r},${g},${b})`;
            } else {
              partPixels[y][x] = null;
            }
          }
        }
        saveData[info.name] = partPixels;
      }
      return saveData;
    };

    const getThumb = (): string => {
      const savedRot = root.rotation.y;
      root.rotation.y = 0;
      renderer.render(scene, camera);
      const url = canvas3d.toDataURL();
      root.rotation.y = savedRot;
      return url;
    };

    // Skins list panel
    const skinsPanel = document.createElement('div');
    skinsPanel.style.cssText = `display:flex;flex-direction:column;gap:${isShort ? 2 : 4}px;${isShort ? `width:88px;flex-shrink:0;max-height:${availH};overflow-y:auto;-webkit-overflow-scrolling:touch;` : 'max-width:120px;max-height:55vmin;overflow-y:auto;'}padding:${isShort ? 2 : 4}px;`;

    const skinsTitle = document.createElement('div');
    skinsTitle.textContent = 'MY SKINS';
    skinsTitle.style.cssText = `color:#44aaff;font:bold ${isShort ? 9 : 11}px "Arial Black";text-align:center;`;
    skinsPanel.appendChild(skinsTitle);

    // Coins display (created early so delete handlers can update it)
    const coinLabel = document.createElement('div');
    coinLabel.textContent = `${getCoins()} coins`;
    coinLabel.style.cssText = `color:#ffdd00;font:bold ${isShort ? 9 : 11}px Arial;text-align:center;`;

    const renderSkinsList = () => {
      // Remove old entries (keep title)
      while (skinsPanel.children.length > 1) skinsPanel.removeChild(skinsPanel.lastChild!);
      const allSkins = getSkinsList();
      for (const skin of allSkins) {
        const entry = document.createElement('div');
        const isActive = skin.id === currentSkinId;
        entry.style.cssText = `display:flex;flex-direction:column;align-items:center;padding:${isShort ? 2 : 4}px;border:${isShort ? 1 : 2}px solid ${isActive ? '#44ff88' : '#444'};border-radius:6px;cursor:pointer;background:${isActive ? 'rgba(34,85,51,0.5)' : 'rgba(34,34,68,0.5)'};`;
        // Thumbnail
        if (skin.thumb) {
          const img = document.createElement('img');
          img.src = skin.thumb;
          img.style.cssText = `width:${isShort ? 36 : 50}px;height:${isShort ? 28 : 40}px;object-fit:contain;border-radius:3px;`;
          entry.appendChild(img);
        }
        const label = document.createElement('div');
        label.textContent = skin.name;
        label.style.cssText = `color:#fff;font:bold ${isShort ? 8 : 9}px Arial;text-align:center;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        entry.appendChild(label);
        // Click to load this skin
        entry.addEventListener('click', () => {
          // Save current first
          if (currentSkinId) {
            const curSkins = getSkinsList();
            const cur = curSkins.find(s => s.id === currentSkinId);
            if (cur) {
              cur.data = getCurrentPixelData();
              cur.name = nameInput.value || cur.name;
              cur.thumb = getThumb();
              saveSkinsList(curSkins);
            }
          }
          currentSkinId = skin.id;
          setActiveSkinId(skin.id);
          nameInput.value = skin.name;
          loadSkinData(skin.data);
          renderSkinsList();
        });
        // Delete button — two-tap confirm, refunds 50 coins on delete
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = isShort ? 'DEL +50' : 'DELETE +50';
        const delBtnNormal = `padding:${isShort ? '2px 3px' : '4px 6px'};margin-top:${isShort ? 2 : 4}px;font:bold ${isShort ? 8 : 10}px Arial;background:#aa2222;color:#fff;border:none;border-radius:4px;cursor:pointer;width:100%;`;
        const delBtnConfirm = `padding:${isShort ? '2px 3px' : '4px 6px'};margin-top:${isShort ? 2 : 4}px;font:bold ${isShort ? 8 : 10}px Arial;background:#ffcc00;color:#000;border:none;border-radius:4px;cursor:pointer;width:100%;`;
        delBtn.style.cssText = delBtnNormal;
        let armed = false;
        let armTimer: ReturnType<typeof setTimeout> | null = null;
        const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
        delBtn.addEventListener('mousedown', swallow);
        delBtn.addEventListener('touchstart', swallow, { passive: false });
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!armed) {
            armed = true;
            delBtn.textContent = isShort ? 'AGAIN?' : 'TAP AGAIN';
            delBtn.style.cssText = delBtnConfirm;
            if (armTimer) clearTimeout(armTimer);
            armTimer = setTimeout(() => {
              armed = false;
              delBtn.textContent = isShort ? 'DEL +50' : 'DELETE +50';
              delBtn.style.cssText = delBtnNormal;
            }, 2500);
            return;
          }
          if (armTimer) clearTimeout(armTimer);
          const curSkins = getSkinsList();
          const idx = curSkins.findIndex(s => s.id === skin.id);
          if (idx >= 0) {
            curSkins.splice(idx, 1);
            addCoins(50);
            coinLabel.textContent = `${getCoins()} coins`;
          }
          saveSkinsList(curSkins);
          if (currentSkinId === skin.id) {
            currentSkinId = curSkins[0]?.id || null;
            setActiveSkinId(currentSkinId);
            loadSkinData(currentSkinId ? (curSkins[0]?.data || null) : null);
            nameInput.value = curSkins[0]?.name || 'My Skin';
          }
          renderSkinsList();
        });
        entry.appendChild(delBtn);
        skinsPanel.appendChild(entry);
      }
      // "NEW SKIN" button at bottom
      const newBtn = document.createElement('button');
      newBtn.textContent = isShort ? '+ NEW' : '+ NEW SKIN';
      newBtn.style.cssText = `padding:${isShort ? 3 : 6}px;font:bold ${isShort ? 9 : 10}px Arial;background:#4488ff;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:${isShort ? 2 : 4}px;`;
      newBtn.addEventListener('click', () => {
        // Save current first
        if (currentSkinId) {
          const curSkins = getSkinsList();
          const cur = curSkins.find(s => s.id === currentSkinId);
          if (cur) {
            cur.data = getCurrentPixelData();
            cur.name = nameInput.value || cur.name;
            cur.thumb = getThumb();
            saveSkinsList(curSkins);
          }
        }
        // Create new blank skin
        const curSkins = getSkinsList();
        const newId = 'skin-' + Date.now();
        const newSkin: SavedSkin = { id: newId, name: 'Skin ' + (curSkins.length + 1), data: {} };
        curSkins.push(newSkin);
        saveSkinsList(curSkins);
        currentSkinId = newId;
        setActiveSkinId(newId);
        nameInput.value = newSkin.name;
        loadSkinData(null);
        renderSkinsList();
      });
      skinsPanel.appendChild(newBtn);
    };
    renderSkinsList();

    // Coins display (created above so delete handlers can update it)
    controls.appendChild(coinLabel);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = isShort ? 'SAVE (50c)' : 'SAVE SKIN (50 coins)';
    saveBtn.style.cssText = `padding:${isShort ? 4 : 8}px;font:bold ${isShort ? 10 : 12}px Arial;background:#22aa44;color:#fff;border:none;border-radius:4px;cursor:pointer;`;
    saveBtn.addEventListener('click', () => {
      // Check if this is an update to existing skin (free) or new save (costs 50)
      const allSkins = getSkinsList();
      const isUpdate = currentSkinId && allSkins.some(s => s.id === currentSkinId);
      if (!isUpdate) {
        // New skin — costs 50 coins
        if (!spendCoins(50)) {
          saveBtn.textContent = 'NOT ENOUGH COINS!';
          saveBtn.style.background = '#aa2222';
          setTimeout(() => { saveBtn.textContent = 'SAVE SKIN (50 coins)'; saveBtn.style.background = '#22aa44'; }, 1500);
          return;
        }
        coinLabel.textContent = `${getCoins()} coins`;
      }
      try {
        const saveData = getCurrentPixelData();
        const thumb = getThumb();
        if (isUpdate) {
          const existing = allSkins.find(s => s.id === currentSkinId);
          if (existing) {
            existing.data = saveData;
            existing.name = nameInput.value || existing.name;
            existing.thumb = thumb;
          }
        } else {
          const newId = 'skin-' + Date.now();
          allSkins.push({ id: newId, name: nameInput.value || 'My Skin', data: saveData, thumb });
          currentSkinId = newId;
          setActiveSkinId(newId);
        }
        saveSkinsList(allSkins);
        localStorage.setItem(DRAW_KEY, JSON.stringify(saveData));
        localStorage.setItem('fighting-wars-skin-name', nameInput.value || 'My Skin');
        localStorage.setItem('fighting-wars-skin-thumb', thumb);
        renderSkinsList();
      } catch (_e) { /* ignore */ }
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => { saveBtn.textContent = 'SAVE SKIN (50 coins)'; }, 1500);
    });
    controls.appendChild(saveBtn);
    this.gpSave = () => { saveBtn.click(); };

    // BIG obvious DELETE button for the currently-loaded skin (refunds 50 coins)
    const deleteCurrentBtn = document.createElement('button');
    deleteCurrentBtn.type = 'button';
    const delNormalStyle = `padding:${isShort ? 4 : 10}px;font:bold ${isShort ? 10 : 13}px "Arial Black";background:#cc2222;color:#fff;border:${isShort ? 1 : 2}px solid #ff6666;border-radius:6px;cursor:pointer;`;
    const delArmedStyle = `padding:${isShort ? 4 : 10}px;font:bold ${isShort ? 10 : 13}px "Arial Black";background:#ffcc00;color:#000;border:${isShort ? 1 : 2}px solid #ff9900;border-radius:6px;cursor:pointer;`;
    deleteCurrentBtn.textContent = isShort ? 'DELETE (+50)' : 'DELETE SKIN (+50)';
    deleteCurrentBtn.style.cssText = delNormalStyle;
    let delArmed = false;
    let delTimer: ReturnType<typeof setTimeout> | null = null;
    const delLabel = isShort ? 'DELETE (+50)' : 'DELETE SKIN (+50)';
    const delArmedLabel = isShort ? 'TAP AGAIN' : 'TAP AGAIN TO DELETE';
    deleteCurrentBtn.addEventListener('click', () => {
      const allSkins = getSkinsList();
      if (!currentSkinId || !allSkins.some(s => s.id === currentSkinId)) {
        deleteCurrentBtn.textContent = 'NOTHING';
        setTimeout(() => { deleteCurrentBtn.textContent = delLabel; }, 1200);
        return;
      }
      if (!delArmed) {
        delArmed = true;
        deleteCurrentBtn.textContent = delArmedLabel;
        deleteCurrentBtn.style.cssText = delArmedStyle;
        if (delTimer) clearTimeout(delTimer);
        delTimer = setTimeout(() => {
          delArmed = false;
          deleteCurrentBtn.textContent = delLabel;
          deleteCurrentBtn.style.cssText = delNormalStyle;
        }, 2500);
        return;
      }
      if (delTimer) clearTimeout(delTimer);
      delArmed = false;
      const curSkins = getSkinsList();
      const idx = curSkins.findIndex(s => s.id === currentSkinId);
      if (idx >= 0) {
        curSkins.splice(idx, 1);
        addCoins(50);
        coinLabel.textContent = `${getCoins()} coins`;
      }
      saveSkinsList(curSkins);
      currentSkinId = curSkins[0]?.id || null;
      setActiveSkinId(currentSkinId);
      loadSkinData(currentSkinId ? (curSkins[0]?.data || null) : null);
      nameInput.value = curSkins[0]?.name || 'My Skin';
      renderSkinsList();
      deleteCurrentBtn.textContent = delLabel;
      deleteCurrentBtn.style.cssText = delNormalStyle;
    });
    controls.appendChild(deleteCurrentBtn);

    container.appendChild(controls);
    container.appendChild(skinsPanel);

    // BACK button — top left corner, goes to shop. Uses touchend too for reliable iPhone taps.
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = 'position:fixed;top:10px;left:10px;padding:10px 16px;font:bold 14px "Arial Black";background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;z-index:10001;touch-action:manipulation;-webkit-tap-highlight-color:rgba(255,255,255,0.3);';
    const doBack = () => {
      this.cleanup();
      this.scene.start('ShopHubScene');
    };
    backBtn.addEventListener('click', doBack);
    backBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); doBack(); }, { passive: false });

    // DONE button — top right corner, saves and goes to character select
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'DONE ✓';
    doneBtn.style.cssText = 'position:fixed;top:10px;right:10px;padding:10px 16px;font:bold 14px "Arial Black";background:#22aa44;color:#fff;border:none;border-radius:6px;cursor:pointer;z-index:10001;touch-action:manipulation;-webkit-tap-highlight-color:rgba(255,255,255,0.3);';
    const doDone = () => {
      saveBtn.click();
      setTimeout(() => {
        this.cleanup();
        this.scene.start('CharacterSelectScene');
      }, 200);
    };
    doneBtn.addEventListener('click', doDone);
    doneBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); doDone(); }, { passive: false });
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    // Render loop
    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  }

  private cleanup(): void {
    cancelAnimationFrame(this.animId);
    if (this.renderer3d) {
      this.renderer3d.dispose();
      this.renderer3d = null;
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
    }
    this.gpCursorEl = null;
    this.gpPaintAtNdc = null;
    this.gpRotate = null;
    this.gpSetColorByIdx = null;
    this.gpSetBrush = null;
    this.gpToggleEraser = null;
    this.gpClearAll = null;
    this.gpSave = null;
  }

  shutdown(): void {
    this.cleanup();
  }
}
