import { ATTACK_DAMAGE, ATTACK_COOLDOWNS, ATTACK_RANGES, ActionType } from '../config/game.config';
import { PlayerState, GameState } from './GameState';

export interface CombatResult {
  attackerId: string;
  targetId: string;
  actionType: ActionType;
  damage: number;
  selfDamage: number;
  targetDied: boolean;
  attackerDied: boolean;
}

export function canAttack(player: PlayerState, actionType: ActionType): boolean {
  return player.alive && player.cooldowns[actionType] <= 0;
}

export function executeAttack(
  attacker: PlayerState,
  actionType: ActionType,
  allPlayers: Map<string, PlayerState>,
  damageBoost: boolean = false,
): CombatResult[] {
  const results: CombatResult[] = [];
  const range = ATTACK_RANGES[actionType];
  const damage = damageBoost ? ATTACK_DAMAGE[actionType] + 1 : ATTACK_DAMAGE[actionType];

  // Single target: nearest enemy in range
  const target = findNearestEnemy(attacker, allPlayers, range);
  if (!target) return results;

  target.hp = Math.max(0, target.hp - damage);
  const targetDied = target.hp <= 0;
  if (targetDied) target.alive = false;

  results.push({
    attackerId: attacker.id,
    targetId: target.id,
    actionType,
    damage,
    selfDamage: 0,
    targetDied,
    attackerDied: false,
  });

  // Set cooldown
  attacker.cooldowns[actionType] = ATTACK_COOLDOWNS[actionType];

  return results;
}

export function findNearestEnemy(
  attacker: PlayerState,
  allPlayers: Map<string, PlayerState>,
  maxRange: number,
): PlayerState | null {
  let nearest: PlayerState | null = null;
  let nearestDist = Infinity;

  for (const [id, player] of allPlayers) {
    if (id === attacker.id || !player.alive) continue;
    const dist = distance(attacker, player);
    if (dist < maxRange && dist < nearestDist) {
      nearest = player;
      nearestDist = dist;
    }
  }

  return nearest;
}

export function findEnemiesInRange(
  attacker: PlayerState,
  allPlayers: Map<string, PlayerState>,
  range: number,
): PlayerState[] {
  const enemies: PlayerState[] = [];
  for (const [id, player] of allPlayers) {
    if (id === attacker.id || !player.alive) continue;
    if (distance(attacker, player) <= range) {
      enemies.push(player);
    }
  }
  return enemies;
}

export function updateCooldowns(player: PlayerState, delta: number): void {
  for (const key of Object.keys(player.cooldowns) as ActionType[]) {
    player.cooldowns[key] = Math.max(0, player.cooldowns[key] - delta);
  }
}

export function getAlivePlayers(state: GameState): PlayerState[] {
  return Array.from(state.players.values()).filter(p => p.alive);
}

export function getAliveEnemies(state: GameState, excludeId: string): PlayerState[] {
  return Array.from(state.players.values()).filter(p => p.alive && p.id !== excludeId);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
