import Phaser from 'phaser';
import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { CHAR_VISUALS } from './BattleScene';

const DRAW_KEY = 'fighting-wars-skin-drawing';
const TEX_SIZE = 32; // pixels per body part texture (pixelated like Minecraft)

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

  constructor() {
    super({ key: 'DrawOnSkinScene' });
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

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);';

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;gap:12px;align-items:center;padding:8px;';

    // === 3D CANVAS ===
    const canvas3d = document.createElement('canvas');
    const SIZE = 512;
    canvas3d.width = SIZE;
    canvas3d.height = SIZE;
    canvas3d.style.cssText = 'width:55vmin;height:55vmin;border:2px solid #44aaff;border-radius:4px;cursor:crosshair;touch-action:none;';

    // Three.js setup
    const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x222222, 1);
    this.renderer3d = renderer;

    const scene = new THREE.Scene();
    this.scene3d = scene;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.0, 4.5);
    camera.lookAt(0, 0.9, 0);
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

    // Load saved paint data
    try {
      const saved = localStorage.getItem(DRAW_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          for (const [mesh, info] of paintableTextures) {
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
        }
      }
    } catch (_e) { /* ignore */ }

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

    const paintAt = (e: MouseEvent | TouchEvent) => {
      const ndc = getNDC(e);
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

    container.appendChild(canvas3d);

    // === CONTROLS ===
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-width:160px;';

    const title = document.createElement('div');
    title.textContent = 'PAINT ON SKIN';
    title.style.cssText = 'color:#44aaff;font:bold 14px "Arial Black";text-align:center;';
    controls.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = 'Tap character to paint. Drag empty space to rotate.';
    hint.style.cssText = 'color:#888;font:10px Arial;text-align:center;';
    controls.appendChild(hint);

    // Colors
    const colors = [
      '#ffffff', '#c0c0c0', '#808080', '#404040', '#000000',
      '#ff0000', '#ff6600', '#ffcc00', '#ffff00', '#88ff00',
      '#00ff00', '#00ffaa', '#00ccff', '#0066ff', '#0000ff',
      '#6600ff', '#cc00ff', '#ff00cc', '#ff6688', '#884422',
      '#cc8855', '#ffbb88', '#ffddbb', '#556b2f', '#2e8b57',
    ];

    const colorGrid = document.createElement('div');
    colorGrid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:2px;';
    for (const c of colors) {
      const swatch = document.createElement('div');
      swatch.style.cssText = `width:24px;height:24px;background:${c};border:2px solid #333;border-radius:2px;cursor:pointer;`;
      swatch.addEventListener('click', () => {
        this.currentColor = c;
        this.isEraser = false;
        colorGrid.querySelectorAll('div').forEach(d => (d as HTMLDivElement).style.borderColor = '#333');
        swatch.style.borderColor = '#fff';
        eraserBtn.style.background = '#555';
      });
      if (c === '#ff0000') swatch.style.borderColor = '#fff';
      colorGrid.appendChild(swatch);
    }
    controls.appendChild(colorGrid);

    // Brush size
    const sizeLabel = document.createElement('div');
    sizeLabel.textContent = 'Brush: 1';
    sizeLabel.style.cssText = 'color:#fff;font:bold 11px Arial;text-align:center;';
    controls.appendChild(sizeLabel);

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '1';
    sizeSlider.max = '8';
    sizeSlider.value = '1';
    sizeSlider.style.cssText = 'width:100%;';
    sizeSlider.addEventListener('input', () => {
      this.brushSize = parseInt(sizeSlider.value, 10);
      sizeLabel.textContent = `Brush: ${sizeSlider.value}`;
    });
    controls.appendChild(sizeSlider);

    const eraserBtn = document.createElement('button');
    eraserBtn.textContent = 'ERASER';
    eraserBtn.style.cssText = 'padding:6px;font:bold 11px Arial;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;';
    eraserBtn.addEventListener('click', () => {
      this.isEraser = true;
      colorGrid.querySelectorAll('div').forEach(d => (d as HTMLDivElement).style.borderColor = '#333');
      eraserBtn.style.background = '#ff8844';
    });
    controls.appendChild(eraserBtn);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'CLEAR ALL';
    clearBtn.style.cssText = 'padding:6px;font:bold 11px Arial;background:#aa2222;color:#fff;border:none;border-radius:4px;cursor:pointer;';
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

    // Skin name input
    const nameLabel = document.createElement('div');
    nameLabel.textContent = 'Skin Name:';
    nameLabel.style.cssText = 'color:#aaa;font:bold 10px Arial;';
    controls.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = localStorage.getItem('fighting-wars-skin-name') || 'My Skin';
    nameInput.maxLength = 20;
    nameInput.style.cssText = 'width:100%;padding:6px;font:bold 12px Arial;background:#333;color:#fff;border:2px solid #555;border-radius:4px;box-sizing:border-box;';
    controls.appendChild(nameInput);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'SAVE SKIN';
    saveBtn.style.cssText = 'padding:8px;font:bold 12px Arial;background:#22aa44;color:#fff;border:none;border-radius:4px;cursor:pointer;';
    saveBtn.addEventListener('click', () => {
      try {
        // Save each body part's pixel data
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
        localStorage.setItem(DRAW_KEY, JSON.stringify(saveData));
        localStorage.setItem('fighting-wars-skin-name', nameInput.value || 'My Skin');

        // Also render a thumbnail for character select
        root.rotation.y = 0;
        renderer.render(scene, camera);
        const thumbDataUrl = canvas3d.toDataURL();
        localStorage.setItem('fighting-wars-skin-thumb', thumbDataUrl);
      } catch (_e) { /* ignore */ }
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => { saveBtn.textContent = 'SAVE SKIN'; }, 1500);
    });
    controls.appendChild(saveBtn);

    container.appendChild(controls);

    // BACK button — top left corner, goes to shop
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = 'position:fixed;top:10px;left:10px;padding:10px 16px;font:bold 14px "Arial Black";background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;z-index:9999;';
    backBtn.addEventListener('click', () => {
      this.cleanup();
      this.scene.start('ShopHubScene');
    });
    overlay.appendChild(backBtn);

    // DONE button — top right corner, saves and goes to character select
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'DONE ✓';
    doneBtn.style.cssText = 'position:fixed;top:10px;right:10px;padding:10px 16px;font:bold 14px "Arial Black";background:#22aa44;color:#fff;border:none;border-radius:6px;cursor:pointer;z-index:9999;';
    doneBtn.addEventListener('click', () => {
      saveBtn.click();
      setTimeout(() => {
        this.cleanup();
        this.scene.start('CharacterSelectScene');
      }, 200);
    });
    overlay.appendChild(doneBtn);
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
  }

  shutdown(): void {
    this.cleanup();
  }
}
