import Phaser from 'phaser';
import { ActionType } from '../config/game.config';

export class ActionMenu {
  constructor(_scene: Phaser.Scene) {}

  setCallback(_callback: (type: ActionType) => void): void {}

  updateCooldowns(_cooldowns: Record<ActionType, number>): void {}

  destroy(): void {}
}
