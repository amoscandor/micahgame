import { PlayerState, GameState } from './GameState';
import { canAttack, executeAttack, updateCooldowns, findNearestEnemy, CombatResult } from './CombatSystem';
import {
  BOT_WANDER_SPEED,
  BOT_AGGRO_RANGE,
  BOT_ATTACK_RANGE,
  ATTACK_RANGES,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ActionType,
} from '../config/game.config';
import { CHARACTERS } from '../scenes/CharacterSelectScene';

type BotState = 'wander' | 'pursue' | 'attack';

export interface BotPowerUse {
  botId: string;
  power: string;
  powerColor: number;
  x: number;
  y: number;
  targetId?: string;
  targetX?: number;
  targetY?: number;
}

interface BotData {
  state: BotState;
  targetId: string | null;
  wanderX: number;
  wanderY: number;
  stateTimer: number;
  power: string;
  powerColor: number;
  powerCooldown: number;
}

export class BotController {
  private botData: Map<string, BotData> = new Map();
  private batchIndex: number = 0;
  private readonly batchSize: number = 50;

  // Callback for when a bot attacks (so scene can animate)
  onBotAttack: ((results: CombatResult[], botId: string) => void) | null = null;
  // Callback for when a bot uses a power (so scene can show effects)
  onBotPower: ((info: BotPowerUse) => void) | null = null;

  init(gameState: GameState): void {
    for (const [id, player] of gameState.players) {
      if (player.isHuman) continue;
      const charIdx = Math.floor(Math.random() * CHARACTERS.length);
      const char = CHARACTERS[charIdx];
      this.botData.set(id, {
        state: 'wander',
        targetId: null,
        wanderX: randomWorldX(),
        wanderY: randomWorldY(),
        stateTimer: 0,
        power: '',
        powerColor: 0x4488ff,
        powerCooldown: 999999, // powers disabled
      });
    }
  }

  update(delta: number, gameState: GameState): void {
    const botIds = Array.from(this.botData.keys());
    const aliveIds = botIds.filter(id => {
      const p = gameState.players.get(id);
      return p && p.alive;
    });

    if (aliveIds.length === 0) return;

    // Update ALL bot cooldowns and timers every frame
    for (const id of aliveIds) {
      const player = gameState.players.get(id)!;
      const data = this.botData.get(id)!;
      updateCooldowns(player, delta);
      data.stateTimer += delta;
      if (data.powerCooldown > 0) data.powerCooldown -= delta;
    }

    // Process AI decisions in batches for performance
    const start = this.batchIndex % aliveIds.length;
    const end = Math.min(start + this.batchSize, aliveIds.length);

    for (let i = start; i < end; i++) {
      const id = aliveIds[i];
      const player = gameState.players.get(id)!;
      const data = this.botData.get(id)!;

      this.updateBot(player, data, gameState, delta);
    }

    this.batchIndex = end >= aliveIds.length ? 0 : end;
  }

  private updateBot(player: PlayerState, data: BotData, gameState: GameState, delta: number): void {
    switch (data.state) {
      case 'wander':
        this.doWander(player, data, gameState, delta);
        break;
      case 'pursue':
        this.doPursue(player, data, gameState, delta);
        break;
      case 'attack':
        this.doAttack(player, data, gameState);
        break;
    }
  }

  private doWander(player: PlayerState, data: BotData, gameState: GameState, delta: number): void {
    // Move toward wander target
    const dx = data.wanderX - player.x;
    const dy = data.wanderY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10 || data.stateTimer > 4000) {
      // Pick new wander target
      data.wanderX = randomWorldX();
      data.wanderY = randomWorldY();
      data.stateTimer = 0;
    } else {
      const speed = BOT_WANDER_SPEED * (delta / 1000);
      player.x += (dx / dist) * speed;
      player.y += (dy / dist) * speed;
      player.facingDirection = dx > 0 ? 'right' : 'left';
    }

    // Clamp to world
    player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
    player.y = Math.max(30, Math.min(WORLD_HEIGHT - 30, player.y));

    // Check for nearby enemies — prefer bots over the human player
    const nearest = findNearestEnemy(player, gameState.players, BOT_AGGRO_RANGE);
    if (nearest) {
      // 80% chance to ignore the human and look for a bot target instead
      if (nearest.isHuman && Math.random() < 0.8) {
        const botTarget = findNearestBot(player, gameState.players, BOT_AGGRO_RANGE);
        if (botTarget) {
          data.targetId = botTarget.id;
          data.state = 'pursue';
          data.stateTimer = 0;
          return;
        }
      }
      data.targetId = nearest.id;
      data.state = 'pursue';
      data.stateTimer = 0;
    }
  }

  private doPursue(player: PlayerState, data: BotData, gameState: GameState, delta: number): void {
    const target = data.targetId ? gameState.players.get(data.targetId) : null;

    if (!target || !target.alive) {
      data.state = 'wander';
      data.targetId = null;
      data.stateTimer = 0;
      return;
    }

    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Lost target — too far
    if (dist > BOT_AGGRO_RANGE * 1.5) {
      data.state = 'wander';
      data.targetId = null;
      data.stateTimer = 0;
      return;
    }

    // Close enough to attack
    if (dist < BOT_ATTACK_RANGE) {
      data.state = 'attack';
      data.stateTimer = 0;
      return;
    }

    // Move toward target
    const speed = BOT_WANDER_SPEED * 1.2 * (delta / 1000);
    player.x += (dx / dist) * speed;
    player.y += (dy / dist) * speed;
    player.facingDirection = dx > 0 ? 'right' : 'left';

    player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
    player.y = Math.max(30, Math.min(WORLD_HEIGHT - 30, player.y));
  }

  private doAttack(player: PlayerState, data: BotData, gameState: GameState): void {
    const target = data.targetId ? gameState.players.get(data.targetId) : null;

    if (!target || !target.alive) {
      data.state = 'wander';
      data.targetId = null;
      data.stateTimer = 0;
      return;
    }

    // Try using power if ready (30% chance each attack cycle)
    if (data.powerCooldown <= 0 && Math.random() < 0.3) {
      this.useBotPower(player, data, target, gameState);
      data.powerCooldown = 12000 + Math.random() * 8000; // 12-20s cooldown
      data.state = 'pursue';
      data.stateTimer = 0;
      return;
    }

    // Attack if ready
    if (!canAttack(player, 'attack')) {
      data.state = 'pursue';
      data.stateTimer = 0;
      return;
    }
    const actionType: ActionType = 'attack';

    const results = executeAttack(player, actionType, gameState.players);
    if (results.length > 0) {
      this.onBotAttack?.(results, player.id);
    }

    // After attacking, go back to pursue
    data.state = 'pursue';
    data.stateTimer = 0;
  }

  private useBotPower(bot: PlayerState, data: BotData, target: PlayerState, gameState: GameState): void {
    const power = data.power;
    const range = 200;

    // Track who was already dead before power use
    const alreadyDead = new Set<string>();
    for (const [id, p] of gameState.players) {
      if (!p.alive) alreadyDead.add(id);
    }

    // Find nearby enemies for area powers
    const nearbyEnemies: PlayerState[] = [];
    for (const [id, p] of gameState.players) {
      if (id === bot.id || !p.alive) continue;
      const dx = bot.x - p.x, dy = bot.y - p.y;
      if (dx * dx + dy * dy < range * range) nearbyEnemies.push(p);
    }

    // Apply power effects based on type
    switch (power) {
      case 'Fireball':
      case 'Missile':
      case 'Laser': {
        // Single-target damage powers
        const dmg = power === 'Missile' ? 3 : 2;
        target.hp -= dmg;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        break;
      }
      case 'Lightning': {
        // Hit up to 3 nearby
        let hits = 0;
        for (const p of nearbyEnemies) {
          if (hits >= 3) break;
          p.hp -= 2;
          if (p.hp <= 0) { p.hp = 0; p.alive = false; }
          hits++;
        }
        break;
      }
      case 'Freeze':
      case 'Blizzard': {
        // Slow nearby enemies
        for (const p of nearbyEnemies) {
          p.velocityX = 0;
          p.velocityY = 0;
        }
        break;
      }
      case 'Poison':
      case 'Inferno': {
        // Area damage
        for (const p of nearbyEnemies) {
          p.hp -= 1;
          if (p.hp <= 0) { p.hp = 0; p.alive = false; }
        }
        break;
      }
      case 'Stomp': {
        for (const p of nearbyEnemies) {
          p.hp -= 1;
          p.velocityX = 0;
          p.velocityY = 0;
          if (p.hp <= 0) { p.hp = 0; p.alive = false; }
        }
        break;
      }
      case 'Drain': {
        target.hp -= 2;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        bot.hp = Math.min(bot.maxHp, bot.hp + 2);
        break;
      }
      case 'Fear': {
        for (const p of nearbyEnemies) {
          const angle = Math.atan2(p.y - bot.y, p.x - bot.x);
          p.velocityX = Math.cos(angle) * 200;
          p.velocityY = Math.sin(angle) * 200;
        }
        break;
      }
      case 'Heal': {
        bot.hp = Math.min(bot.maxHp, bot.hp + 2);
        break;
      }
      case 'Shield Wall':
      case 'Armor': {
        // Bots heal a bit to simulate shield
        bot.hp = Math.min(bot.maxHp, bot.hp + 2);
        break;
      }
      case 'Dash': {
        const dir = bot.facingDirection === 'right' ? 1 : -1;
        bot.x += dir * 200;
        bot.x = Math.max(20, Math.min(WORLD_WIDTH - 20, bot.x));
        break;
      }
      case 'Teleport': {
        bot.x = 50 + Math.random() * (WORLD_WIDTH - 100);
        bot.y = 50 + Math.random() * (WORLD_HEIGHT - 100);
        break;
      }
      case 'Rage': {
        // Do a big hit
        target.hp -= 2;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        break;
      }
      case 'Trap': {
        // Instant trap hit on target
        target.hp -= 3;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        break;
      }
      case 'Invisibility':
      case 'Phase': {
        // These are defensive — just skip (visual only in scene)
        break;
      }
    }

    // Notify the scene for visual effects
    this.onBotPower?.({
      botId: bot.id,
      power,
      powerColor: data.powerColor,
      x: bot.x,
      y: bot.y,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
    });

    // Report kills via combat results — only newly dead players
    const results: CombatResult[] = [];
    for (const [id, p] of gameState.players) {
      if (id === bot.id) continue;
      if (!p.alive && !alreadyDead.has(id)) {
        results.push({
          attackerId: bot.id,
          targetId: id,
          actionType: 'attack',
          damage: 0,
          selfDamage: 0,
          targetDied: true,
          attackerDied: false,
        });
      }
    }
    if (results.length > 0) {
      this.onBotAttack?.(results, bot.id);
    }
  }
}

function findNearestBot(
  attacker: PlayerState,
  allPlayers: Map<string, PlayerState>,
  maxRange: number,
): PlayerState | null {
  let nearest: PlayerState | null = null;
  let nearestDist = Infinity;
  for (const [id, player] of allPlayers) {
    if (id === attacker.id || !player.alive || player.isHuman) continue;
    const dx = attacker.x - player.x;
    const dy = attacker.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < maxRange && dist < nearestDist) {
      nearest = player;
      nearestDist = dist;
    }
  }
  return nearest;
}

function randomWorldX(): number {
  return 60 + Math.random() * (WORLD_WIDTH - 120);
}

function randomWorldY(): number {
  return 60 + Math.random() * (WORLD_HEIGHT - 120);
}
