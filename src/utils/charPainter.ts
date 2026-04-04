/**
 * Generates Minecraft-style pixel-art textures for shop characters.
 * Each body part (head, chest, arms, legs, shoes) gets a small canvas
 * with pixel colors arranged to look like the character's costume.
 */

// Texture size for each body part (Minecraft-like 8x8 or 16x16)
const TEX = 16;

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

function darken(c: number, f = 0.7): number {
  const r = Math.floor(((c >> 16) & 0xff) * f);
  const g = Math.floor(((c >> 8) & 0xff) * f);
  const b = Math.floor((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

function lighten(c: number, f = 1.3): number {
  const r = Math.min(255, Math.floor(((c >> 16) & 0xff) * f));
  const g = Math.min(255, Math.floor(((c >> 8) & 0xff) * f));
  const b = Math.min(255, Math.floor((c & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

interface PartTextures {
  head: HTMLCanvasElement;
  chest: HTMLCanvasElement;
  armL: HTMLCanvasElement;
  armR: HTMLCanvasElement;
  legL: HTMLCanvasElement;
  legR: HTMLCanvasElement;
  shoe: HTMLCanvasElement;
}

function makeCanvas(size = TEX): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function fill(ctx: CanvasRenderingContext2D, color: number) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, TEX, TEX);
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: number) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(x, y, w, h);
}

// Default: solid color with slight shading
function solidPart(base: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas();
  fill(ctx, base);
  // Add slight pixel noise for texture
  const dk = darken(base, 0.85);
  const lt = lighten(base, 1.15);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const r = Math.random();
      if (r < 0.1) px(ctx, x, y, 1, 1, dk);
      else if (r < 0.18) px(ctx, x, y, 1, 1, lt);
    }
  }
  return canvas;
}

function getDefaultTextures(skin: number, shirt: number, pants: number, hair: number, shoe: number = 0x1a1a1a): PartTextures {
  return {
    head: solidPart(skin),
    chest: solidPart(shirt),
    armL: solidPart(shirt),
    armR: solidPart(shirt),
    legL: solidPart(pants),
    legR: solidPart(pants),
    shoe: solidPart(shoe),
  };
}

// ============================================================
// CHARACTER-SPECIFIC TEXTURE GENERATORS
// ============================================================

function spidermanTextures(): PartTextures {
  const red = 0xcc0000, dkRed = 0x990000, blue = 0x2222cc, dkBlue = 0x1111aa;
  const black = 0x222222, white = 0xffffff;

  // Head — red mask with web lines and big white eyes
  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, red);
  // Web lines (vertical + horizontal black lines)
  for (let i = 0; i < TEX; i += 3) { px(hc, i, 0, 1, TEX, black); }
  for (let i = 0; i < TEX; i += 3) { px(hc, 0, i, TEX, 1, black); }
  // Big white eyes
  px(hc, 3, 5, 4, 3, white); px(hc, 9, 5, 4, 3, white);
  // Eye borders
  px(hc, 2, 5, 1, 3, black); px(hc, 7, 5, 1, 3, black);
  px(hc, 8, 5, 1, 3, black); px(hc, 13, 5, 1, 3, black);
  px(hc, 3, 4, 4, 1, black); px(hc, 9, 4, 4, 1, black);
  px(hc, 3, 8, 4, 1, black); px(hc, 9, 8, 4, 1, black);

  // Chest — red top half with web lines, blue bottom, black spider
  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, red);
  px(cc, 0, 10, TEX, 6, blue);
  for (let i = 0; i < TEX; i += 3) { px(cc, i, 0, 1, 10, black); }
  for (let i = 0; i < 10; i += 3) { px(cc, 0, i, TEX, 1, black); }
  // Spider emblem
  px(cc, 7, 4, 2, 4, black); // body
  px(cc, 5, 5, 1, 1, black); px(cc, 4, 4, 1, 1, black); px(cc, 3, 3, 1, 1, black); // legs L
  px(cc, 10, 5, 1, 1, black); px(cc, 11, 4, 1, 1, black); px(cc, 12, 3, 1, 1, black);
  px(cc, 5, 7, 1, 1, black); px(cc, 4, 8, 1, 1, black);
  px(cc, 10, 7, 1, 1, black); px(cc, 11, 8, 1, 1, black);

  // Arms — red with web lines
  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, red);
    for (let i = 0; i < TEX; i += 3) { px(ctx, i, 0, 1, TEX, black); }
    for (let i = 0; i < TEX; i += 3) { px(ctx, 0, i, TEX, 1, black); }
    return canvas;
  };

  // Legs — blue with web-like dark accents
  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    for (let i = 1; i < TEX; i += 4) { px(ctx, i, 0, 1, TEX, dkBlue); }
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(0xcc0000) };
}

function ironmanTextures(): PartTextures {
  const red = 0xcc2222, dkRed = 0x991111, gold = 0xddaa22, dkGold = 0xaa8811;
  const white = 0xaaddff, grey = 0x666666;

  // Head — red/gold helmet with glowing eyes
  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, red);
  // Gold face plate
  px(hc, 3, 3, 10, 8, gold);
  px(hc, 4, 4, 8, 6, dkGold);
  // Eyes — white glow
  px(hc, 4, 5, 3, 2, white); px(hc, 9, 5, 3, 2, white);
  // Mouth slit
  px(hc, 5, 9, 6, 1, dkRed);
  // Top of helmet
  px(hc, 5, 0, 6, 3, dkRed);

  // Chest — red with gold accents, arc reactor
  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, red);
  px(cc, 0, 0, TEX, 2, dkRed); // shoulder area
  px(cc, 5, 2, 6, 2, gold); // gold collar
  // Arc reactor
  px(cc, 6, 5, 4, 4, 0x88ccff);
  px(cc, 7, 6, 2, 2, 0xffffff);
  // Gold trim
  px(cc, 0, 8, TEX, 1, gold);
  px(cc, 2, 0, 2, TEX, dkRed);
  px(cc, 12, 0, 2, TEX, dkRed);
  // Belt
  px(cc, 0, 13, TEX, 2, gold);

  // Arms — red with gold sections
  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, red);
    px(ctx, 0, 0, TEX, 3, gold); // shoulder gold
    px(ctx, 0, TEX - 3, TEX, 3, gold); // glove gold
    px(ctx, 4, 4, 2, 2, dkRed); // panel line
    px(ctx, 0, 7, TEX, 1, dkRed);
    return canvas;
  };

  // Legs — red top, gold knee, red bottom
  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, red);
    px(ctx, 0, 6, TEX, 3, gold); // knee
    px(ctx, 3, 0, 1, TEX, dkRed); // panel line
    px(ctx, 0, 13, TEX, 3, dkRed);
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(gold) };
}

function batmanTextures(): PartTextures {
  const black = 0x222222, dkGrey = 0x333333, grey = 0x555555, yellow = 0xffdd00;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, black);
  // Bat ears
  px(hc, 2, 0, 2, 4, black); px(hc, 12, 0, 2, 4, black);
  // White eyes
  px(hc, 4, 6, 3, 2, 0xffffff); px(hc, 9, 6, 3, 2, 0xffffff);
  // Mouth/chin (grey skin showing)
  px(hc, 5, 10, 6, 4, 0xf0dcc8);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, dkGrey);
  // Bat emblem
  px(cc, 5, 2, 6, 2, yellow); // yellow oval bg
  px(cc, 4, 3, 8, 3, yellow);
  px(cc, 6, 3, 4, 2, black); // bat shape
  px(cc, 5, 4, 6, 1, black);
  px(cc, 4, 5, 2, 1, black); px(cc, 10, 5, 2, 1, black);
  // Belt
  px(cc, 0, 12, TEX, 2, yellow);
  px(cc, 6, 12, 4, 2, grey); // buckle

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, dkGrey);
    px(ctx, 0, 10, TEX, 6, black); // gauntlets
    px(ctx, 2, 10, 1, 4, grey); px(ctx, 5, 10, 1, 4, grey); px(ctx, 8, 10, 1, 4, grey); // gauntlet blades
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, dkGrey);
    px(ctx, 0, 12, TEX, 4, black); // boots
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(black) };
}

function marioTextures(): PartTextures {
  const red = 0xff0000, blue = 0x2244aa, skin = 0xf0dcc8, brown = 0x4a3020, white = 0xffffff, yellow = 0xffdd00;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  // Red hat
  px(hc, 0, 0, TEX, 6, red);
  px(hc, 0, 5, TEX, 2, darken(red)); // brim
  // M logo
  px(hc, 6, 2, 4, 3, white);
  px(hc, 7, 2, 1, 2, red); px(hc, 8, 1, 1, 1, red); // M shape
  // Eyes
  px(hc, 4, 8, 2, 2, 0x4488ff); px(hc, 10, 8, 2, 2, 0x4488ff);
  // Mustache
  px(hc, 4, 11, 8, 2, brown);
  // Nose
  px(hc, 7, 10, 2, 2, 0xcc8866);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, red);
  // Blue overall straps
  px(cc, 3, 0, 3, TEX, blue); px(cc, 10, 0, 3, TEX, blue);
  // Yellow buttons
  px(cc, 5, 5, 2, 2, yellow); px(cc, 9, 5, 2, 2, yellow);
  // Overall bib
  px(cc, 3, 8, 10, 8, blue);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, red);
    px(ctx, 0, 10, TEX, 6, skin); // hands
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 2, 0, TEX - 4, 1, darken(blue));
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(brown) };
}

function sonicTextures(): PartTextures {
  const blue = 0x2266ff, dkBlue = 0x1144cc, skin = 0xf0dcc8, white = 0xffffff, green = 0x44cc44;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, blue);
  // Skin face area
  px(hc, 4, 6, 8, 8, skin);
  // Big green eyes
  px(hc, 4, 6, 4, 4, white); px(hc, 8, 6, 4, 4, white);
  px(hc, 6, 7, 2, 2, green); px(hc, 10, 7, 2, 2, green);
  px(hc, 7, 7, 1, 1, 0x111111); px(hc, 11, 7, 1, 1, 0x111111);
  // Spiky quills (top/back)
  px(hc, 0, 0, 4, 4, dkBlue); px(hc, 12, 0, 4, 4, dkBlue);
  px(hc, 2, 0, 2, 2, blue);
  // Nose
  px(hc, 7, 10, 2, 1, 0x111111);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, blue);
  // Tan belly
  px(cc, 4, 3, 8, 10, skin);
  px(cc, 5, 4, 6, 8, lighten(skin));

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 0, 10, TEX, 6, skin); // gloves → skin hands
    px(ctx, 0, 12, TEX, 4, white); // white gloves
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 0, 8, TEX, 8, 0xcc0000); // red shoes
    px(ctx, 2, 10, TEX - 4, 2, white); // white stripe
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(0xcc0000) };
}

function gokuTextures(): PartTextures {
  const orange = 0xff6600, dkOrange = 0xcc4400, blue = 0x2244aa, skin = 0xf0dcc8, black = 0x222222;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  // Spiky black hair
  px(hc, 0, 0, TEX, 5, black);
  px(hc, 2, 0, 2, 2, black); // spike
  px(hc, 6, 0, 2, 1, black);
  px(hc, 10, 0, 2, 2, black);
  px(hc, 14, 0, 2, 3, black);
  px(hc, 0, 0, 3, 7, black); // side hair
  px(hc, 13, 0, 3, 7, black);
  // Eyes
  px(hc, 4, 7, 2, 2, 0x111111); px(hc, 10, 7, 2, 2, 0x111111);
  // Mouth
  px(hc, 6, 11, 4, 1, 0xcc8866);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, orange);
  // Blue undershirt showing
  px(cc, 5, 0, 6, 3, blue);
  // Belt
  px(cc, 0, 11, TEX, 2, blue);
  // Gi fold line
  px(cc, 7, 3, 2, 8, dkOrange);
  // Kanji symbol area
  px(cc, 5, 4, 6, 5, dkOrange);
  px(cc, 6, 5, 4, 3, orange);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, orange);
    px(ctx, 0, 0, TEX, 4, blue); // blue shoulders
    px(ctx, 0, 12, TEX, 4, skin); // hands
    px(ctx, 0, 10, TEX, 2, blue); // wristbands
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, orange);
    px(ctx, 3, 0, 1, TEX, dkOrange); // fold line
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(blue) };
}

function narutoTextures(): PartTextures {
  const orange = 0xff6600, dkOrange = 0xcc4400, blue = 0x3344aa, skin = 0xf0dcc8, yellow = 0xffcc44, black = 0x222222;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  // Yellow spiky hair
  px(hc, 0, 0, TEX, 5, yellow);
  px(hc, 1, 0, 2, 2, lighten(yellow)); px(hc, 5, 0, 2, 1, lighten(yellow));
  px(hc, 9, 0, 2, 2, lighten(yellow)); px(hc, 13, 0, 2, 1, lighten(yellow));
  // Blue headband
  px(hc, 0, 5, TEX, 2, blue);
  px(hc, 5, 5, 6, 2, 0x888888); // metal plate
  // Eyes
  px(hc, 4, 8, 2, 2, 0x4488ff); px(hc, 10, 8, 2, 2, 0x4488ff);
  // Whisker marks
  px(hc, 1, 10, 3, 1, black); px(hc, 1, 12, 3, 1, black);
  px(hc, 12, 10, 3, 1, black); px(hc, 12, 12, 3, 1, black);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, orange);
  px(cc, 0, 0, TEX, 3, black); // black collar/top
  px(cc, 6, 3, 4, 10, dkOrange); // zipper
  px(cc, 7, 4, 2, 8, black); // zipper line
  // White swirl
  px(cc, 2, 6, 3, 3, 0xffffff);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, orange);
    px(ctx, 0, 0, TEX, 3, black);
    px(ctx, 0, 12, TEX, 4, skin);
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, orange);
    px(ctx, 0, 10, TEX, 6, blue); // blue pants bottom
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(blue) };
}

function captainAmericaTextures(): PartTextures {
  const blue = 0x2244aa, red = 0xcc2222, white = 0xffffff, skin = 0xf0dcc8;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, blue); // helmet
  px(hc, 4, 6, 8, 8, skin); // face opening
  // A on forehead
  px(hc, 6, 2, 4, 3, white);
  px(hc, 7, 1, 2, 1, white);
  // Eyes
  px(hc, 5, 8, 2, 2, 0x4488ff); px(hc, 9, 8, 2, 2, 0x4488ff);
  // Wings on helmet
  px(hc, 0, 3, 3, 2, white); px(hc, 13, 3, 3, 2, white);

  const { canvas: chest, ctx: cc } = makeCanvas();
  // Red and white stripes with blue top + star
  fill(cc, blue);
  px(cc, 0, 6, TEX, 2, red); px(cc, 0, 8, TEX, 2, white);
  px(cc, 0, 10, TEX, 2, red); px(cc, 0, 12, TEX, 2, white);
  px(cc, 0, 14, TEX, 2, red);
  // Star on blue
  px(cc, 7, 2, 2, 1, white); px(cc, 6, 3, 4, 1, white); px(cc, 7, 4, 2, 1, white);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 0, 4, TEX, 2, red);
    px(ctx, 0, 8, TEX, 2, white);
    px(ctx, 0, 12, TEX, 4, red);
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(0xcc2222) };
}

function supermanTextures(): PartTextures {
  const blue = 0x2244cc, red = 0xcc2222, yellow = 0xffdd00, skin = 0xf0dcc8, black = 0x222222;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  px(hc, 0, 0, TEX, 5, black); // hair
  px(hc, 6, 4, 2, 2, black); // curl
  px(hc, 4, 7, 2, 2, 0x4488ff); px(hc, 10, 7, 2, 2, 0x4488ff);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, blue);
  // S shield — yellow diamond with red S
  px(cc, 4, 2, 8, 8, yellow);
  px(cc, 5, 3, 6, 6, red);
  px(cc, 7, 4, 2, 4, yellow); // S shape
  px(cc, 6, 4, 1, 2, yellow);
  px(cc, 9, 6, 1, 2, yellow);
  // Belt
  px(cc, 0, 12, TEX, 2, red);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 0, 12, TEX, 4, skin);
    return canvas;
  };

  const makeLeg = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, blue);
    px(ctx, 0, 12, TEX, 4, red); // boots
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), shoe: solidPart(red) };
}

function deadpoolTextures(): PartTextures {
  const red = 0xcc2222, dkRed = 0x881111, black = 0x222222, white = 0xffffff, grey = 0x555555;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, red);
  // Black eye patches
  px(hc, 2, 4, 5, 4, black); px(hc, 9, 4, 5, 4, black);
  // White eyes inside
  px(hc, 3, 5, 3, 2, white); px(hc, 10, 5, 3, 2, white);
  // Mask line
  px(hc, 7, 0, 2, TEX, dkRed);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, red);
  px(cc, 7, 0, 2, 12, black); // center line
  // Belt
  px(cc, 0, 12, TEX, 2, grey);
  px(cc, 6, 12, 4, 2, red); // buckle
  // Pouches
  px(cc, 1, 12, 3, 2, 0x8a6a40); px(cc, 12, 12, 3, 2, 0x8a6a40);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, red);
    px(ctx, 0, 6, TEX, 1, black);
    px(ctx, 0, 12, TEX, 4, dkRed);
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: solidPart(red), legR: solidPart(red), shoe: solidPart(dkRed) };
}

function masterChiefTextures(): PartTextures {
  const green = 0x446644, dkGreen = 0x335533, gold = 0xffaa00, grey = 0x666666;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, green);
  // Gold visor
  px(hc, 3, 5, 10, 4, gold);
  px(hc, 4, 6, 8, 2, lighten(gold));
  // Helmet detail
  px(hc, 6, 0, 4, 2, dkGreen);
  px(hc, 2, 10, 12, 3, dkGreen);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, green);
  px(cc, 0, 0, TEX, 2, dkGreen);
  px(cc, 5, 3, 6, 4, grey); // chest plate
  px(cc, 6, 4, 4, 2, dkGreen);
  px(cc, 0, 12, TEX, 2, grey); // belt

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, green);
    px(ctx, 0, 0, TEX, 3, dkGreen); // shoulder pad
    px(ctx, 0, 12, TEX, 4, dkGreen);
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: solidPart(green), legR: solidPart(green), shoe: solidPart(dkGreen) };
}

function vaderTextures(): PartTextures {
  const black = 0x111111, dkGrey = 0x222222, grey = 0x444444;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, black);
  // Eye lenses
  px(hc, 4, 5, 3, 2, 0x222244); px(hc, 9, 5, 3, 2, 0x222244);
  // Mouth grill
  px(hc, 5, 9, 6, 3, grey);
  for (let i = 5; i < 11; i += 2) px(hc, i, 9, 1, 3, black);
  // Helmet dome
  px(hc, 4, 0, 8, 3, dkGrey);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, black);
  // Chest panel
  px(cc, 4, 3, 8, 6, grey);
  px(cc, 5, 4, 2, 1, 0xff0000); px(cc, 8, 4, 2, 1, 0x0044ff);
  px(cc, 5, 6, 2, 1, 0x00ff00); px(cc, 8, 6, 2, 1, 0xffff00);
  // Belt
  px(cc, 0, 12, TEX, 2, grey);
  px(cc, 6, 12, 4, 2, dkGrey);

  return { head, chest, armL: solidPart(black), armR: solidPart(black), legL: solidPart(black), legR: solidPart(black), shoe: solidPart(black) };
}

function luffyTextures(): PartTextures {
  const red = 0xcc2222, blue = 0x2244aa, skin = 0xf0dcc8, black = 0x222222, yellow = 0xffdd44;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  px(hc, 0, 0, TEX, 5, black); // messy hair
  px(hc, 2, 0, 2, 2, darken(black)); px(hc, 8, 0, 3, 2, darken(black));
  // Straw hat
  px(hc, 1, 0, 14, 4, yellow);
  px(hc, 0, 3, TEX, 2, darken(yellow)); // brim
  px(hc, 3, 1, 10, 1, red); // hat band
  // Eyes
  px(hc, 4, 8, 2, 2, black); px(hc, 10, 8, 2, 2, black);
  // Scar under eye
  px(hc, 4, 10, 3, 1, 0xcc4444);
  // Big grin
  px(hc, 5, 12, 6, 2, 0xffffff);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, red);
  px(cc, 6, 0, 4, TEX, skin); // open vest showing chest
  px(cc, 0, 13, TEX, 3, blue); // shorts start

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, skin);
    px(ctx, 0, 0, TEX, 4, red); // vest sleeve
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: solidPart(blue), legR: solidPart(blue), shoe: solidPart(0x8a5a3a) };
}

function linkTextures(): PartTextures {
  const green = 0x228822, dkGreen = 0x1a6a1a, skin = 0xf0dcc8, brown = 0x8a6a40, yellow = 0xddcc44;

  const { canvas: head, ctx: hc } = makeCanvas();
  fill(hc, skin);
  // Blond hair
  px(hc, 0, 0, TEX, 5, yellow);
  px(hc, 0, 3, 3, 5, yellow); px(hc, 13, 3, 3, 5, yellow); // long sides
  // Green hat
  px(hc, 2, 0, 12, 4, green);
  px(hc, 12, 2, 4, 6, green); // hat flop
  // Pointy ears
  px(hc, 0, 6, 2, 3, skin); px(hc, 14, 6, 2, 3, skin);
  // Blue eyes
  px(hc, 5, 7, 2, 2, 0x4488ff); px(hc, 9, 7, 2, 2, 0x4488ff);

  const { canvas: chest, ctx: cc } = makeCanvas();
  fill(cc, green);
  px(cc, 0, 12, TEX, 2, brown); // belt
  px(cc, 6, 12, 4, 2, darken(brown)); // buckle
  // Sword strap
  px(cc, 3, 0, 2, 12, darken(brown));
  // Lighter green tunic detail
  px(cc, 6, 2, 4, 8, dkGreen);

  const makeArm = () => {
    const { canvas, ctx } = makeCanvas();
    fill(ctx, green);
    px(ctx, 0, 10, TEX, 6, skin); // hands
    px(ctx, 0, 9, TEX, 2, brown); // gauntlet
    return canvas;
  };

  return { head, chest, armL: makeArm(), armR: makeArm(), legL: solidPart(0xddcc88), legR: solidPart(0xddcc88), shoe: solidPart(brown) };
}

// Map character IDs to their texture generators
const TEXTURE_MAP: Record<string, () => PartTextures> = {
  'shop-spiderman': spidermanTextures,
  'shop-ironman': ironmanTextures,
  'shop-batman': batmanTextures,
  'shop-mario': marioTextures,
  'shop-luigi': () => {
    // Luigi is Mario with green instead of red
    const t = marioTextures();
    // Swap red for green by regenerating
    const green = 0x22aa22, skin = 0xf0dcc8, blue = 0x2244aa, brown = 0x4a3020, white = 0xffffff, yellow = 0xffdd00;
    const { canvas: head, ctx: hc } = makeCanvas();
    fill(hc, skin);
    px(hc, 0, 0, TEX, 6, green); px(hc, 0, 5, TEX, 2, darken(green));
    px(hc, 6, 2, 4, 3, white); px(hc, 7, 2, 1, 2, green);
    px(hc, 4, 8, 2, 2, 0x4488ff); px(hc, 10, 8, 2, 2, 0x4488ff);
    px(hc, 4, 11, 8, 2, brown); px(hc, 7, 10, 2, 2, 0xcc8866);
    t.head = head;
    const { canvas: chest, ctx: cc } = makeCanvas();
    fill(cc, green);
    px(cc, 3, 0, 3, TEX, blue); px(cc, 10, 0, 3, TEX, blue);
    px(cc, 5, 5, 2, 2, yellow); px(cc, 9, 5, 2, 2, yellow);
    px(cc, 3, 8, 10, 8, blue);
    t.chest = chest;
    return t;
  },
  'shop-sonic': sonicTextures,
  'shop-goku': gokuTextures,
  'shop-naruto': narutoTextures,
  'shop-captainamerica': captainAmericaTextures,
  'shop-superman': supermanTextures,
  'shop-deadpool': deadpoolTextures,
  'shop-masterchief': masterChiefTextures,
  'shop-vader': vaderTextures,
  'shop-luffy': luffyTextures,
  'shop-link': linkTextures,
};

export function getCharacterTextures(charId: string): PartTextures | null {
  const gen = TEXTURE_MAP[charId];
  return gen ? gen() : null;
}

// Legacy function — no longer paints on 2D canvas
export function paintCharacterDetails(_canvas: HTMLCanvasElement, _charId: string): void {
  // Now handled by 3D textures via getCharacterTextures
}
