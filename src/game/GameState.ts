import { ActionType, PLAYER_HP, BOSS_HP, WORLD_WIDTH, WORLD_HEIGHT } from '../config/game.config';

export interface PlayerState {
  id: string;
  name: string;
  textureKey: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facingDirection: 'left' | 'right';
  cooldowns: Record<ActionType, number>;
  isHuman: boolean;
}

export interface BossState {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  phase: 'idle' | 'attacking' | 'hurt';
}

export type GamePhase = 'battle' | 'boss' | 'gameover';

export interface GameState {
  phase: GamePhase;
  players: Map<string, PlayerState>;
  bossState: BossState | null;
  winnerId: string | null;
}

function createPlayer(id: string, name: string, textureKey: string, x: number, y: number, isHuman: boolean): PlayerState {
  return {
    id,
    name,
    textureKey,
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    alive: true,
    x,
    y,
    velocityX: 0,
    velocityY: 0,
    facingDirection: 'right',
    cooldowns: { attack: 0 },
    isHuman,
  };
}

export function createInitialGameState(playerCount: number, humanName?: string, humanTexture?: string): GameState {
  const players = new Map<string, PlayerState>();
  const margin = 60;

  // Human player at world center
  players.set('human', createPlayer(
    'human',
    humanName || 'You',
    humanTexture || 'player-0',
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    true,
  ));

  // Scatter bots randomly with minimum spacing
  const positions: { x: number; y: number }[] = [{ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }];
  const minSpacing = 50;

  for (let i = 1; i < playerCount; i++) {
    let x: number, y: number;
    let attempts = 0;
    do {
      x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
      y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
      attempts++;
    } while (
      attempts < 50 &&
      positions.some(p => Math.abs(p.x - x) < minSpacing && Math.abs(p.y - y) < minSpacing)
    );

    positions.push({ x, y });

    const id = `bot-${i}`;
    players.set(id, createPlayer(
      id,
      `Enemy ${i}`,
      `char-${i % 20}`,
      x,
      y,
      false,
    ));
  }

  return {
    phase: 'battle',
    players,
    bossState: null,
    winnerId: null,
  };
}

export function createBossState(): BossState {
  return {
    hp: BOSS_HP,
    maxHp: BOSS_HP,
    x: GAME_WIDTH / 2,
    y: 150,
    phase: 'idle',
  };
}

// Re-export GAME_WIDTH for boss state positioning
import { GAME_WIDTH } from '../config/game.config';
