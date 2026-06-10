import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, BOSS_HP, ActionType } from '../config/game.config';
import { BossState, createBossState } from '../game/GameState';
import { BossAI, BossAction } from '../game/BossAI';
// ActionMenu no longer needed — using simple A button
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { addCoins } from '../utils/coinStore';
import { stopMenuMusic } from '../utils/menuMusic';

export class BossScene extends Phaser.Scene {
  private bossState!: BossState;
  private bossAI!: BossAI;
  private bossSprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private joystick!: VirtualJoystick;
  private bossHPText!: Phaser.GameObjects.Text;
  private bossHPBar!: Phaser.GameObjects.Graphics;
  private playerHP: number = 3;
  private playerHPText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private playerX: number = GAME_WIDTH / 2;
  private playerY: number = GAME_HEIGHT - 100;
  private canAct: boolean = false;

  private characterKey: string = 'player-0';
  private characterName: string = 'You';
  private power: string = 'Fireball';
  private powerColor: number = 0xff4400;
  private powerCooldown: number = 0;
  private powerReady: boolean = true;
  private powerButton!: Phaser.GameObjects.Graphics;
  private powerButtonText!: Phaser.GameObjects.Text;
  private powerCooldownText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BossScene' });
  }

  create(data?: { characterKey?: string; characterName?: string; power?: string; powerColor?: number }): void {
    stopMenuMusic();
    if (data?.characterKey) this.characterKey = data.characterKey;
    if (data?.characterName) this.characterName = data.characterName;
    if (data?.power) this.power = data.power;
    if (data?.powerColor !== undefined) this.powerColor = data.powerColor;
    this.powerCooldown = 0;
    this.powerReady = true;
    this.cameras.main.fadeIn(500);

    // Forest background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    // Slight dark tint for drama
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.2);

    // Boss — the real apple monster photo
    this.bossState = createBossState();
    this.bossAI = new BossAI();
    this.bossSprite = this.add.image(GAME_WIDTH / 2, 110, 'apple-monster')
      .setScale(0.7).setDepth(10);

    // Boss shadow on ground
    const bossShadow = this.add.ellipse(GAME_WIDTH / 2, 180, 100, 20, 0x000000, 0.3).setDepth(9);

    // Menacing idle float
    this.tweens.add({
      targets: this.bossSprite,
      y: 105,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Player
    this.playerSprite = this.add.image(this.playerX, this.playerY, this.characterKey)
      .setDisplaySize(48, 48).setDepth(10);
    this.playerSprite.setY(GAME_HEIGHT + 50).setAlpha(0);
    this.tweens.add({
      targets: this.playerSprite,
      y: this.playerY,
      alpha: 1,
      duration: 1500,
      ease: 'Sine.easeOut',
    });

    // Boss HP bar
    this.bossHPBar = this.add.graphics().setDepth(100);
    this.bossHPText = this.add.text(GAME_WIDTH / 2, 20, `APPLE MONSTER  ${this.bossState.hp}/${this.bossState.maxHp}`, {
      fontSize: '14px',
      fontFamily: 'Arial Black',
      color: '#ff4444',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);
    this.drawBossHP();

    // Player HP
    this.playerHPText = this.add.text(10, GAME_HEIGHT - 30, `Your HP: ${this.playerHP}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#44ff44',
      stroke: '#000',
      strokeThickness: 2,
    }).setDepth(100);

    // Message text
    this.messageText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontSize: '24px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setDepth(200).setAlpha(0);

    // Joystick for dodging
    this.joystick = new VirtualJoystick(this, 80, GAME_HEIGHT - 100);

    // Big ATTACK button — right side
    const abX = GAME_WIDTH / 2 + 60;
    const abY = GAME_HEIGHT - 50;
    const attackBtn = this.add.graphics().setDepth(510);
    attackBtn.lineStyle(3, 0xff4444, 0.6);
    attackBtn.strokeCircle(abX, abY, 38);
    attackBtn.fillStyle(0xcc2222, 0.7);
    attackBtn.fillCircle(abX, abY, 34);
    attackBtn.fillStyle(0xff3333, 0.5);
    attackBtn.fillCircle(abX, abY, 20);
    this.add.text(abX, abY, 'A', {
      fontSize: '26px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(511);
    const attackHit = this.add.circle(abX, abY, 42, 0x000000, 0)
      .setDepth(512).setInteractive();
    attackHit.on('pointerdown', () => this.onPlayerAttack('attack'));

    // === POWER BUTTON — big, right side ===
    const pbX = GAME_WIDTH - 80;
    const pbY = GAME_HEIGHT - 50;
    this.powerButton = this.add.graphics().setDepth(510);
    // Glow behind button
    this.powerButton.fillStyle(this.powerColor, 0.15);
    this.powerButton.fillCircle(pbX, pbY, 50);
    // Outer ring
    this.powerButton.lineStyle(3, this.powerColor, 0.8);
    this.powerButton.strokeCircle(pbX, pbY, 40);
    // Inner filled
    this.powerButton.fillStyle(this.powerColor, 0.4);
    this.powerButton.fillCircle(pbX, pbY, 36);
    // Inner bright core
    this.powerButton.fillStyle(this.powerColor, 0.7);
    this.powerButton.fillCircle(pbX, pbY, 20);

    this.powerButtonText = this.add.text(pbX, pbY - 4, this.power.toUpperCase(), {
      fontSize: '11px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(511);

    this.powerCooldownText = this.add.text(pbX, pbY + 14, 'READY', {
      fontSize: '10px',
      fontFamily: 'Arial Black',
      color: '#ffcc00',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(511);

    // Pulsing glow
    const powerGlow = this.add.graphics().setDepth(509);
    powerGlow.fillStyle(this.powerColor, 0.2);
    powerGlow.fillCircle(pbX, pbY, 44);
    this.tweens.add({
      targets: powerGlow,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Power hit area
    const powerHit = this.add.circle(pbX, pbY, 46, 0x000000, 0)
      .setDepth(512).setInteractive();
    powerHit.on('pointerdown', () => this.activatePower());

    // Keyboard: A to attack, Q for power, arrow keys to dodge
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-A', () => this.onPlayerAttack('attack'));
      this.input.keyboard.on('keydown-Q', () => this.activatePower());
    }

    // Intro
    this.showMessage('THE APPLE MONSTER\nAPPEARS!', 2500);
    this.time.delayedCall(3000, () => {
      this.canAct = true;
    });
  }

  update(_time: number, delta: number): void {
    if (!this.canAct) return;

    // Power cooldown
    if (!this.powerReady && this.powerCooldown > 0) {
      this.powerCooldown -= delta;
      const secs = Math.ceil(this.powerCooldown / 1000);
      if (this.powerCooldownText) this.powerCooldownText.setText(`${secs}s`);
      if (this.powerCooldown <= 0) {
        this.powerReady = true;
        this.powerCooldown = 0;
        if (this.powerCooldownText) this.powerCooldownText.setText('READY');
      }
    }

    // Move player with joystick or arrow keys
    const dir = this.joystick.getDirection();
    if (this.input.keyboard) {
      const keys = this.input.keyboard.createCursorKeys();
      const w = this.input.keyboard.addKey('W');
      const s = this.input.keyboard.addKey('S');
      const d = this.input.keyboard.addKey('D');
      if (w.isDown || keys.up.isDown) dir.y = -1;
      if (s.isDown || keys.down.isDown) dir.y = 1;
      if (d.isDown || keys.right.isDown) dir.x = 1;
      if (keys.left.isDown) dir.x = -1;
    }
    this.playerX += dir.x * 200 * (delta / 1000);
    this.playerY += dir.y * 200 * (delta / 1000);
    this.playerX = Phaser.Math.Clamp(this.playerX, 40, GAME_WIDTH - 100);
    this.playerY = Phaser.Math.Clamp(this.playerY, GAME_HEIGHT * 0.4, GAME_HEIGHT - 40);
    this.playerSprite.setPosition(this.playerX, this.playerY);

    this.bossAI.update(delta);
    this.bossAI.adjustDifficulty(this.bossState);

    const action = this.bossAI.chooseAction(this.bossState);
    if (action !== 'idle') {
      this.executeBossAction(action);
    }
  }

  private onPlayerAttack(_type: ActionType): void {
    if (!this.canAct) return;

    this.canAct = false;
    const damage = 1;

    // Hit flash on boss
    const hitFlash = this.add.circle(this.bossSprite.x, this.bossSprite.y, 20, 0xffffff, 0.7).setDepth(20);
    this.tweens.add({
      targets: hitFlash,
      scale: 2.5,
      alpha: 0,
      duration: 300,
      onComplete: () => hitFlash.destroy(),
    });
    this.cameras.main.shake(80, 0.003);
    this.hitBoss(damage);

    this.time.delayedCall(800, () => {
      if (this.bossState.hp > 0 && this.playerHP > 0) {
        this.canAct = true;
      }
    });
  }

  private hitBoss(damage: number): void {
    this.bossState.hp = Math.max(0, this.bossState.hp - damage);
    this.drawBossHP();
    this.bossHPText.setText(`APPLE MONSTER  ${this.bossState.hp}/${this.bossState.maxHp}`);

    this.tweens.add({ targets: this.bossSprite, alpha: 0.3, duration: 100, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: this.bossSprite, x: this.bossSprite.x + 10, duration: 50, yoyo: true, repeat: 3 });

    const dmgText = this.add.text(this.bossSprite.x, this.bossSprite.y - 60, `-${damage}`, {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#ffff00', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: dmgText, y: this.bossSprite.y - 100, alpha: 0, duration: 800, onComplete: () => dmgText.destroy() });

    if (this.bossState.hp <= 0) this.onBossDefeated();
  }

  private executeBossAction(action: BossAction): void {
    if (action === 'squish') {
      this.bossState.phase = 'attacking';
      const originalY = this.bossSprite.y;
      this.tweens.add({
        targets: this.bossSprite,
        y: this.playerY - 20,
        x: this.playerX,
        duration: 500,
        ease: 'Bounce.easeOut',
        onComplete: () => {
          const dist = Math.abs(this.playerSprite.x - this.bossSprite.x);
          if (dist < 60) {
            this.playerHP = Math.max(0, this.playerHP - 1);
            this.playerHPText.setText(`Your HP: ${this.playerHP}`);
            this.flashSprite(this.playerSprite);
            if (this.playerHP <= 0) { this.onPlayerDied(); return; }
          }
          this.tweens.add({
            targets: this.bossSprite,
            y: originalY,
            x: GAME_WIDTH / 2,
            duration: 800,
            ease: 'Sine.easeInOut',
            onComplete: () => { this.bossState.phase = 'idle'; },
          });
        },
      });
    } else if (action === 'seeds') {
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(i * 200, () => {
          const seed = this.add.circle(
            this.bossSprite.x + (i - 1) * 40,
            this.bossSprite.y + 40,
            6, 0x654321,
          ).setDepth(15);
          this.tweens.add({
            targets: seed,
            y: GAME_HEIGHT + 10,
            duration: 1000,
            onUpdate: () => {
              const dist = Phaser.Math.Distance.Between(seed.x, seed.y, this.playerSprite.x, this.playerSprite.y);
              if (dist < 30) {
                seed.destroy();
                this.playerHP = Math.max(0, this.playerHP - 1);
                this.playerHPText.setText(`Your HP: ${this.playerHP}`);
                this.flashSprite(this.playerSprite);
                if (this.playerHP <= 0) this.onPlayerDied();
              }
            },
            onComplete: () => seed.destroy(),
          });
        });
      }
    }
  }

  private onBossDefeated(): void {
    this.canAct = false;
    this.tweens.add({ targets: this.bossSprite, scaleX: 2, scaleY: 2, alpha: 0, angle: 360, duration: 1500, ease: 'Sine.easeIn' });
    const earned = 1000;
    const total = addCoins(earned);
    this.showMessage('YOU WIN!\nThe Apple Monster\nis defeated!', 4000);
    this.time.delayedCall(4500, () => {
      this.joystick.destroy();
      // cleanup
      this.scene.start('GameOverScene', { won: true, coinsEarned: earned, totalCoins: total });
    });
  }

  private onPlayerDied(): void {
    this.canAct = false;
    this.tweens.add({
      targets: this.playerSprite,
      scaleX: 0,
      duration: 300,
      onComplete: () => {
        this.playerSprite.setTexture('apple-slice').setScale(0.8);
        this.tweens.add({ targets: this.playerSprite, y: -50, alpha: 0, duration: 2000 });
      },
    });
    const earned = 100;
    const total = addCoins(earned);
    this.showMessage('The Apple Monster wins...', 3000);
    this.time.delayedCall(4000, () => {
      this.joystick.destroy();
      // cleanup
      this.scene.start('GameOverScene', { won: false, coinsEarned: earned, totalCoins: total });
    });
  }

  private flashSprite(sprite: Phaser.GameObjects.Image): void {
    this.tweens.add({ targets: sprite, alpha: 0.3, duration: 100, yoyo: true, repeat: 2 });
  }

  private drawBossHP(): void {
    this.bossHPBar.clear();
    const barWidth = 200;
    const barHeight = 12;
    const x = (GAME_WIDTH - barWidth) / 2;
    const y = 40;
    this.bossHPBar.fillStyle(0x333333);
    this.bossHPBar.fillRect(x, y, barWidth, barHeight);
    const ratio = this.bossState.hp / this.bossState.maxHp;
    const color = ratio > 0.5 ? 0xff6600 : ratio > 0.25 ? 0xffaa00 : 0xffcc00;
    this.bossHPBar.fillStyle(color);
    this.bossHPBar.fillRect(x, y, barWidth * ratio, barHeight);
  }

  private activatePower(): void {
    if (!this.powerReady || !this.canAct || this.playerHP <= 0) return;

    this.powerReady = false;
    this.powerCooldown = 10000;

    // Big flash + screen shake
    const flash = this.add.circle(this.playerX, this.playerY, 80, this.powerColor, 0.5).setDepth(200);
    this.tweens.add({
      targets: flash,
      scale: 4,
      alpha: 0,
      duration: 700,
      onComplete: () => flash.destroy(),
    });
    this.cameras.main.flash(200,
      (this.powerColor >> 16) & 0xff,
      (this.powerColor >> 8) & 0xff,
      this.powerColor & 0xff
    );
    this.cameras.main.shake(150, 0.005);

    // Damage the boss based on power type
    let damage = 3;
    let msg = this.power + '!';

    switch (this.power) {
      case 'Fireball': {
        const fb = this.add.circle(this.playerX, this.playerY, 10, 0xff4400, 0.9).setDepth(20);
        this.tweens.add({
          targets: fb,
          x: this.bossSprite.x,
          y: this.bossSprite.y,
          duration: 400,
          onComplete: () => {
            const exp = this.add.circle(fb.x, fb.y, 15, 0xff6600, 0.7).setDepth(20);
            this.tweens.add({ targets: exp, scale: 5, alpha: 0, duration: 500, onComplete: () => exp.destroy() });
            fb.destroy();
          },
        });
        damage = 3;
        break;
      }
      case 'Freeze': {
        const ice = this.add.circle(this.bossSprite.x, this.bossSprite.y, 40, 0x44aaff, 0.5).setDepth(20);
        this.tweens.add({ targets: ice, scale: 2, alpha: 0, duration: 2000, onComplete: () => ice.destroy() });
        damage = 2;
        msg = 'Frozen!';
        break;
      }
      case 'Lightning': {
        const bolt = this.add.rectangle(this.bossSprite.x, this.bossSprite.y - 60, 4, 120, 0xffdd00, 0.9).setDepth(20);
        this.tweens.add({ targets: bolt, alpha: 0, duration: 500, onComplete: () => bolt.destroy() });
        this.cameras.main.flash(200, 255, 255, 200);
        damage = 4;
        break;
      }
      case 'Missile': {
        const mis = this.add.circle(this.playerX, this.playerY, 6, 0x888888, 0.9).setDepth(20);
        this.tweens.add({
          targets: mis,
          x: this.bossSprite.x,
          y: this.bossSprite.y,
          duration: 600,
          onComplete: () => {
            const exp2 = this.add.circle(mis.x, mis.y, 10, 0xff6600, 0.8).setDepth(20);
            this.tweens.add({ targets: exp2, scale: 5, alpha: 0, duration: 500, onComplete: () => exp2.destroy() });
            mis.destroy();
          },
        });
        damage = 4;
        msg = 'Missile locked!';
        break;
      }
      case 'Laser': {
        const beam = this.add.rectangle(
          (this.playerX + this.bossSprite.x) / 2,
          (this.playerY + this.bossSprite.y) / 2,
          Phaser.Math.Distance.Between(this.playerX, this.playerY, this.bossSprite.x, this.bossSprite.y),
          8, 0xff00ff, 0.8
        ).setDepth(20);
        beam.setAngle(Phaser.Math.RadToDeg(Math.atan2(this.bossSprite.y - this.playerY, this.bossSprite.x - this.playerX)));
        this.tweens.add({ targets: beam, alpha: 0, duration: 600, onComplete: () => beam.destroy() });
        damage = 3;
        break;
      }
      case 'Heal':
        this.playerHP = Math.min(3, this.playerHP + 2);
        this.playerHPText.setText(`Your HP: ${this.playerHP}`);
        damage = 0;
        msg = '+2 HP!';
        break;
      case 'Armor':
        this.playerHP = Math.min(6, this.playerHP + 3);
        this.playerHPText.setText(`Your HP: ${this.playerHP}`);
        damage = 0;
        msg = '+3 Shield HP!';
        break;
      case 'Rage':
        damage = 5;
        msg = 'RAGE! Massive hit!';
        break;
      case 'Inferno': {
        const ring = this.add.circle(this.bossSprite.x, this.bossSprite.y, 60, 0xff4400, 0).setDepth(19);
        ring.setStrokeStyle(5, 0xff4400, 0.8);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 1500, onComplete: () => ring.destroy() });
        damage = 3;
        break;
      }
      case 'Stomp':
        this.cameras.main.shake(300, 0.015);
        damage = 2;
        msg = 'STOMP!';
        break;
      case 'Poison': {
        const cloud = this.add.circle(this.bossSprite.x, this.bossSprite.y, 30, 0x44cc44, 0.4).setDepth(19);
        this.tweens.add({ targets: cloud, scale: 4, alpha: 0, duration: 3000, onComplete: () => cloud.destroy() });
        // Damage over time
        let ticks = 0;
        this.time.addEvent({
          delay: 500, repeat: 5, callback: () => {
            if (this.bossState.hp > 0) {
              this.hitBoss(1);
            }
            ticks++;
          },
        });
        damage = 1;
        break;
      }
      case 'Drain':
        this.playerHP = Math.min(3, this.playerHP + 1);
        this.playerHPText.setText(`Your HP: ${this.playerHP}`);
        damage = 2;
        msg = 'Drained!';
        break;
      case 'Blizzard':
        this.cameras.main.flash(300, 200, 220, 255);
        damage = 2;
        msg = 'Blizzard!';
        break;
      default:
        // All other powers do generic damage
        damage = 3;
        break;
    }

    this.showMessage(msg, 1500);
    if (damage > 0) {
      this.hitBoss(damage);
    }
  }

  private showMessage(text: string, duration: number): void {
    this.messageText.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.messageText, alpha: 0, delay: duration - 500, duration: 500 });
  }
}
