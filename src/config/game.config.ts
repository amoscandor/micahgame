import Phaser from 'phaser';

export const GAME_WIDTH = 844;
export const GAME_HEIGHT = 390;

export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 3000;

export const PLAYER_HP = 8;
export const BOSS_HP = 15;

export const PLAYER_MOVE_SPEED = 160;
export const BOT_COUNT = 99;
export const BOT_WANDER_SPEED = 120;
export const BOT_AGGRO_RANGE = 450;
export const BOT_ATTACK_RANGE = 120;
export const JOYSTICK_RADIUS = 50;

export const ATTACK_DAMAGE = {
  attack: 1,
} as const;

export const ATTACK_COOLDOWNS = {
  attack: 800,
} as const;

export const ATTACK_RANGES = {
  attack: 200,
} as const;

export type ActionType = keyof typeof ATTACK_DAMAGE;

// Weapons you can pick up
export interface WeaponDef {
  name: string;
  damage: number;
  range: number;
  cooldown: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  color: number;
  type: 'melee' | 'ranged' | 'explosive';
}

export const WEAPONS: Record<string, WeaponDef> = {
  pickaxe:      { name: 'Pickaxe',        damage: 1, range: 80,  cooldown: 600,  rarity: 'common',    color: 0x888888, type: 'melee' },
  pistol:       { name: 'Pistol',         damage: 1, range: 250, cooldown: 500,  rarity: 'common',    color: 0x999999, type: 'ranged' },
  revolver:     { name: 'Revolver',       damage: 3, range: 200, cooldown: 800,  rarity: 'uncommon',  color: 0x44cc44, type: 'ranged' },
  shotgun:      { name: 'Shotgun',        damage: 3, range: 120, cooldown: 900,  rarity: 'uncommon',  color: 0x44cc44, type: 'ranged' },
  smg:          { name: 'SMG',            damage: 1, range: 200, cooldown: 150,  rarity: 'uncommon',  color: 0x44cc44, type: 'ranged' },
  ar:           { name: 'Assault Rifle',  damage: 2, range: 350, cooldown: 400,  rarity: 'rare',      color: 0x4488ff, type: 'ranged' },
  burst:        { name: 'Burst Rifle',    damage: 2, range: 300, cooldown: 350,  rarity: 'rare',      color: 0x4488ff, type: 'ranged' },
  drum_gun:     { name: 'Drum Gun',       damage: 2, range: 250, cooldown: 200,  rarity: 'rare',      color: 0x4488ff, type: 'ranged' },
  heavy_shotgun:{ name: 'Heavy Shotgun',  damage: 4, range: 140, cooldown: 1000, rarity: 'epic',      color: 0xcc44ff, type: 'ranged' },
  sniper:       { name: 'Sniper',         damage: 5, range: 600, cooldown: 1500, rarity: 'epic',      color: 0xcc44ff, type: 'ranged' },
  minigun:      { name: 'Minigun',        damage: 1, range: 300, cooldown: 80,   rarity: 'epic',      color: 0xcc44ff, type: 'ranged' },
  rpg:          { name: 'RPG',            damage: 4, range: 300, cooldown: 2000, rarity: 'legendary', color: 0xffaa00, type: 'explosive' },
  grenade:      { name: 'Grenade',        damage: 3, range: 200, cooldown: 1200, rarity: 'uncommon',  color: 0x44cc44, type: 'explosive' },
  sword:        { name: 'Sword',          damage: 2, range: 100, cooldown: 400,  rarity: 'rare',      color: 0x4488ff, type: 'melee' },
  shockwave:    { name: 'Shockwave',      damage: 3, range: 150, cooldown: 800,  rarity: 'epic',      color: 0xcc44ff, type: 'melee' },
  gold_scar:    { name: 'Gold SCAR',      damage: 3, range: 400, cooldown: 350,  rarity: 'legendary', color: 0xffaa00, type: 'ranged' },
};

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    activePointers: 4,
  },
  scene: [], // scenes added in main.ts
};
