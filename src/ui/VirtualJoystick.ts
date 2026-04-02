import Phaser from 'phaser';
import { JOYSTICK_RADIUS } from '../config/game.config';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private baseX: number;
  private baseY: number;
  private activePointer: Phaser.Input.Pointer | null = null;
  private direction: { x: number; y: number } = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.baseX = x;
    this.baseY = y;

    // Base circle
    this.base = scene.add.circle(x, y, JOYSTICK_RADIUS, 0x333333, 0.4)
      .setScrollFactor(0)
      .setDepth(500);

    // Thumb circle
    this.thumb = scene.add.circle(x, y, JOYSTICK_RADIUS * 0.5, 0x888888, 0.6)
      .setScrollFactor(0)
      .setDepth(501);

    // Touch input — use the left half of screen as joystick zone
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x < scene.scale.width * 0.4 && !this.activePointer) {
        this.activePointer = pointer;
        this.base.setPosition(pointer.x, pointer.y);
        this.thumb.setPosition(pointer.x, pointer.y);
        this.baseX = pointer.x;
        this.baseY = pointer.y;
      }
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.activePointer && pointer.id === this.activePointer.id) {
        this.updateThumb(pointer.x, pointer.y);
      }
    });

    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.activePointer && pointer.id === this.activePointer.id) {
        this.activePointer = null;
        this.thumb.setPosition(this.baseX, this.baseY);
        this.direction = { x: 0, y: 0 };
        // Reset base to default position
        this.baseX = 80;
        this.baseY = scene.scale.height - 100;
        this.base.setPosition(this.baseX, this.baseY);
        this.thumb.setPosition(this.baseX, this.baseY);
      }
    });
  }

  private updateThumb(px: number, py: number): void {
    const dx = px - this.baseX;
    const dy = py - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > JOYSTICK_RADIUS) {
      // Clamp to radius
      const angle = Math.atan2(dy, dx);
      this.thumb.setPosition(
        this.baseX + Math.cos(angle) * JOYSTICK_RADIUS,
        this.baseY + Math.sin(angle) * JOYSTICK_RADIUS,
      );
      this.direction = {
        x: Math.cos(angle),
        y: Math.sin(angle),
      };
    } else {
      this.thumb.setPosition(px, py);
      this.direction = {
        x: dist > 5 ? dx / JOYSTICK_RADIUS : 0,
        y: dist > 5 ? dy / JOYSTICK_RADIUS : 0,
      };
    }
  }

  getDirection(): { x: number; y: number } {
    return this.direction;
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
  }
}
