import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '../config/game.config';
import { PlayerState, GameState } from '../game/GameState';

export class HUD {
  private scene: Phaser.Scene;
  private hpBar: Phaser.GameObjects.Graphics;
  private shieldBar: Phaser.GameObjects.Graphics;
  private aliveIcon: Phaser.GameObjects.Graphics;
  private aliveText: Phaser.GameObjects.Text;
  private killsIcon: Phaser.GameObjects.Graphics;
  private killsText: Phaser.GameObjects.Text;
  private messageText: Phaser.GameObjects.Text;
  private minimap: Phaser.GameObjects.Graphics;
  private minimapBg: Phaser.GameObjects.Graphics;
  private hpNumbers: Phaser.GameObjects.Text;
  private shieldNumbers: Phaser.GameObjects.Text;
  private kills: number = 0;
  private stormRadius: number = 1; // 1 = full map, shrinks over time
  private stormCenterX: number = WORLD_WIDTH / 2;
  private stormCenterY: number = WORLD_HEIGHT / 2;

  private readonly MM_SIZE = 90;
  private readonly MM_X: number;
  private readonly MM_Y = 8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.MM_X = GAME_WIDTH - this.MM_SIZE - 8;
    const d = 200;

    // === BOTTOM CENTER: Health + Shield bars (Fortnite style) ===
    const barCenterX = GAME_WIDTH / 2;
    const barY = GAME_HEIGHT - 18;
    const barW = 200;
    const barH = 8;

    // Bar backgrounds
    this.hpBar = scene.add.graphics().setScrollFactor(0).setDepth(d);
    this.shieldBar = scene.add.graphics().setScrollFactor(0).setDepth(d);

    // HP number
    this.hpNumbers = scene.add.text(barCenterX - barW / 2 - 4, barY - 2, '3', {
      fontSize: '11px',
      fontFamily: 'Arial Black',
      color: '#44dd44',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(d);

    // Shield number
    this.shieldNumbers = scene.add.text(barCenterX - barW / 2 - 4, barY - 12, '0', {
      fontSize: '11px',
      fontFamily: 'Arial Black',
      color: '#44aaff',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(d).setAlpha(0);

    // Green + icon for health
    const hpIcon = scene.add.text(barCenterX + barW / 2 + 6, barY - 2, '+', {
      fontSize: '12px',
      fontFamily: 'Arial Black',
      color: '#44dd44',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(d);

    // === TOP RIGHT: Alive count with person icon ===
    this.aliveIcon = scene.add.graphics().setScrollFactor(0).setDepth(d);
    // Person silhouette
    this.aliveIcon.fillStyle(0xffffff);
    this.aliveIcon.fillCircle(GAME_WIDTH - 55, 18, 5); // head
    this.aliveIcon.fillRoundedRect(GAME_WIDTH - 60, 24, 10, 12, 2); // body

    this.aliveText = scene.add.text(GAME_WIDTH - 40, 22, '50', {
      fontSize: '18px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(d);

    // === TOP LEFT: Kills with skull icon ===
    this.killsIcon = scene.add.graphics().setScrollFactor(0).setDepth(d);
    // Simple skull
    this.killsIcon.fillStyle(0xffffff, 0.9);
    this.killsIcon.fillCircle(22, 20, 8);
    this.killsIcon.fillStyle(0x000000);
    this.killsIcon.fillCircle(19, 18, 2);
    this.killsIcon.fillCircle(25, 18, 2);
    this.killsIcon.fillRect(20, 24, 1, 3);
    this.killsIcon.fillRect(23, 24, 1, 3);

    this.killsText = scene.add.text(35, 22, '0', {
      fontSize: '18px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(d);

    // === CENTER MESSAGE ===
    this.messageText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '', {
      fontSize: '32px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(d + 1).setAlpha(0);

    // === MINIMAP ===
    this.minimapBg = scene.add.graphics().setScrollFactor(0).setDepth(d);
    this.minimapBg.fillStyle(0x000000, 0.5);
    this.minimapBg.fillRoundedRect(this.MM_X - 2, this.MM_Y - 2, this.MM_SIZE + 4, this.MM_SIZE + 4, 4);

    this.minimap = scene.add.graphics().setScrollFactor(0).setDepth(d + 1);
  }

  updatePlayerHP(player: PlayerState): void {
    this.hpBar.clear();
    const barCenterX = GAME_WIDTH / 2;
    const barY = GAME_HEIGHT - 18;
    const barW = 200;
    const barH = 8;
    const x = barCenterX - barW / 2;

    // Background
    this.hpBar.fillStyle(0x1a1a1a, 0.8);
    this.hpBar.fillRoundedRect(x, barY - barH / 2, barW, barH, 2);
    // Border
    this.hpBar.lineStyle(1, 0x444444, 0.6);
    this.hpBar.strokeRoundedRect(x, barY - barH / 2, barW, barH, 2);

    // Green health fill
    const ratio = player.hp / player.maxHp;
    this.hpBar.fillStyle(0x33cc33);
    this.hpBar.fillRoundedRect(x + 1, barY - barH / 2 + 1, (barW - 2) * ratio, barH - 2, 1);
    // Bright top highlight
    this.hpBar.fillStyle(0x55ee55, 0.3);
    this.hpBar.fillRect(x + 1, barY - barH / 2 + 1, (barW - 2) * ratio, 3);

    this.hpNumbers.setText(`${player.hp}`);
  }

  updateShield(shield: number): void {
    this.shieldBar.clear();
    const barCenterX = GAME_WIDTH / 2;
    const barY = GAME_HEIGHT - 28;
    const barW = 200;
    const barH = 6;
    const x = barCenterX - barW / 2;

    if (shield <= 0) {
      this.shieldNumbers.setAlpha(0);
      return;
    }

    this.shieldNumbers.setAlpha(1).setText(`${shield}`);

    // Background
    this.shieldBar.fillStyle(0x1a1a1a, 0.8);
    this.shieldBar.fillRoundedRect(x, barY - barH / 2, barW, barH, 2);
    // Blue shield fill
    const ratio = shield / 3;
    this.shieldBar.fillStyle(0x3388ff);
    this.shieldBar.fillRoundedRect(x + 1, barY - barH / 2 + 1, (barW - 2) * ratio, barH - 2, 1);
    this.shieldBar.fillStyle(0x66bbff, 0.3);
    this.shieldBar.fillRect(x + 1, barY - barH / 2 + 1, (barW - 2) * ratio, 2);
  }

  updateAliveCount(count: number): void {
    this.aliveText.setText(`${count}`);
  }

  updateMinimap(gameState: GameState, humanId: string): void {
    this.minimap.clear();

    // Green map background
    this.minimap.fillStyle(0x1a4a1a, 0.8);
    this.minimap.fillRoundedRect(this.MM_X, this.MM_Y, this.MM_SIZE, this.MM_SIZE, 3);

    // Grid lines
    this.minimap.lineStyle(0.5, 0x2a6a2a, 0.3);
    for (let g = 0; g < 5; g++) {
      const gp = this.MM_X + (g / 4) * this.MM_SIZE;
      this.minimap.lineBetween(gp, this.MM_Y, gp, this.MM_Y + this.MM_SIZE);
      const gpy = this.MM_Y + (g / 4) * this.MM_SIZE;
      this.minimap.lineBetween(this.MM_X, gpy, this.MM_X + this.MM_SIZE, gpy);
    }

    const scaleX = this.MM_SIZE / WORLD_WIDTH;
    const scaleY = this.MM_SIZE / WORLD_HEIGHT;

    // Storm circle on minimap
    this.minimap.lineStyle(1.5, 0xaa44ff, 0.8);
    const stormMX = this.MM_X + this.stormCenterX * scaleX;
    const stormMY = this.MM_Y + this.stormCenterY * scaleY;
    const stormMR = this.stormRadius * (WORLD_WIDTH / 2) * scaleX;
    this.minimap.strokeCircle(stormMX, stormMY, stormMR);

    // Player dots
    for (const [id, player] of gameState.players) {
      if (!player.alive) continue;
      const mx = this.MM_X + player.x * scaleX;
      const my = this.MM_Y + player.y * scaleY;

      if (id === humanId) {
        // White player arrow
        this.minimap.fillStyle(0xffffff);
        this.minimap.fillCircle(mx, my, 2.5);
        // Direction indicator
        const dirX = player.facingDirection === 'right' ? 1 : -1;
        this.minimap.fillTriangle(mx + dirX * 4, my, mx, my - 2, mx, my + 2);
      } else {
        // Red enemy dots
        this.minimap.fillStyle(0xff4444, 0.7);
        this.minimap.fillRect(mx - 1, my - 1, 2, 2);
      }
    }
  }

  /** Call from BattleScene update to shrink storm over time */
  updateStorm(delta: number): void {
    // Storm shrinks slowly
    if (this.stormRadius > 0.15) {
      this.stormRadius -= delta * 0.000008;
    }
  }

  getStorm(): { x: number; y: number; radius: number } {
    return {
      x: this.stormCenterX,
      y: this.stormCenterY,
      radius: this.stormRadius * (WORLD_WIDTH / 2),
    };
  }

  addKill(): void {
    this.kills++;
    this.killsText.setText(`${this.kills}`);
    // Flash kills text
    this.scene.tweens.add({
      targets: this.killsText,
      scale: 1.4,
      duration: 100,
      yoyo: true,
    });
  }

  showMessage(text: string, duration: number = 2000): void {
    this.messageText.setText(text).setAlpha(1);
    this.scene.tweens.add({
      targets: this.messageText,
      alpha: 0,
      delay: duration - 500,
      duration: 500,
    });
  }

  destroy(): void {
    this.hpBar.destroy();
    this.shieldBar.destroy();
    this.hpNumbers.destroy();
    this.shieldNumbers.destroy();
    this.aliveIcon.destroy();
    this.aliveText.destroy();
    this.killsIcon.destroy();
    this.killsText.destroy();
    this.messageText.destroy();
    this.minimap.destroy();
    this.minimapBg.destroy();
  }
}
