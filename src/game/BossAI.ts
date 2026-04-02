import { BossState } from './GameState';

export type BossAction = 'squish' | 'seeds' | 'idle';

export class BossAI {
  private actionCooldown: number = 0;
  private actionInterval: number = 2000; // ms between attacks

  chooseAction(bossState: BossState): BossAction {
    if (this.actionCooldown > 0) return 'idle';

    this.actionCooldown = this.actionInterval;

    // Alternate between squish and seeds, with some randomness
    const roll = Math.random();
    if (roll < 0.5) {
      return 'squish';
    } else {
      return 'seeds';
    }
  }

  update(delta: number): void {
    this.actionCooldown = Math.max(0, this.actionCooldown - delta);
  }

  // Boss gets faster as HP decreases
  adjustDifficulty(bossState: BossState): void {
    const hpRatio = bossState.hp / bossState.maxHp;
    this.actionInterval = 2000 * hpRatio + 500; // 500ms to 2500ms
  }
}
