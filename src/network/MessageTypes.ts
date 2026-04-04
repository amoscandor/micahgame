import { ActionType } from '../config/game.config';

export interface PlayerInfo {
  id: string;
  name: string;
  characterKey: string;
  characterImage?: string; // base64 for custom characters
}

export interface JoinMessage {
  type: 'JOIN';
  player: PlayerInfo;
}

export interface PlayerListMessage {
  type: 'PLAYER_LIST';
  players: PlayerInfo[];
  hostId: string;
}

export interface GameStartMessage {
  type: 'GAME_START';
  players: PlayerInfo[];
}

export interface ActionSubmitMessage {
  type: 'ACTION_SUBMIT';
  playerId: string;
  action: ActionType;
  targetId: string;
}

export interface TurnResultMessage {
  type: 'TURN_RESULT';
  results: {
    attackerId: string;
    targetId: string;
    actionType: ActionType;
    damage: number;
    selfDamage: number;
    targetDied: boolean;
    attackerDied: boolean;
  }[];
  playerHPs: Record<string, number>;
  alivePlayers: string[];
  round: number;
}

export interface PlayerDiedMessage {
  type: 'PLAYER_DIED';
  playerId: string;
}

export interface BossPhaseMessage {
  type: 'BOSS_PHASE';
  winnerId: string;
}

export interface BossHitMessage {
  type: 'BOSS_HIT';
  bossHP: number;
  damage: number;
}

export interface GameOverMessage {
  type: 'GAME_OVER';
  winnerId: string | null;
  won: boolean;
}

// ── Real-time multiplayer messages ──

export interface PositionUpdateMessage {
  type: 'POSITION_UPDATE';
  playerId: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  speed: number;
  hp: number;
  gun: string;
}

export interface ShootMessage {
  type: 'SHOOT';
  playerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
}

export interface PlayerHitMessage {
  type: 'PLAYER_HIT';
  targetId: string;
  damage: number;
}

export interface PlayerDeadMessage {
  type: 'PLAYER_DEAD';
  playerId: string;
}

export interface PlayerLeftMessage {
  type: 'PLAYER_LEFT';
  playerId: string;
}

export type GameMessage =
  | JoinMessage
  | PlayerListMessage
  | GameStartMessage
  | ActionSubmitMessage
  | TurnResultMessage
  | PlayerDiedMessage
  | BossPhaseMessage
  | BossHitMessage
  | GameOverMessage
  | PositionUpdateMessage
  | ShootMessage
  | PlayerHitMessage
  | PlayerDeadMessage
  | PlayerLeftMessage;
