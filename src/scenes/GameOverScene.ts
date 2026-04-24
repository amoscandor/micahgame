import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { getCoins } from '../utils/coinStore';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { won: boolean; coinsEarned?: number; totalCoins?: number }): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'forest-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    this.cameras.main.fadeIn(500);

    const won = data?.won ?? false;

    // Result text
    this.add.text(GAME_WIDTH / 2, 80, won ? 'VICTORY!' : 'DEFEAT', {
      fontSize: '42px',
      fontFamily: 'Arial Black',
      color: won ? '#44ff44' : '#ff4444',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Description
    const desc = won
      ? 'You defeated the Apple Monster!\nThe forest is safe once more.'
      : 'The Apple Monster got you...\nBetter luck next time!';

    this.add.text(GAME_WIDTH / 2, 140, desc, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#cccccc',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Coins earned
    const coinsEarned = data?.coinsEarned ?? 0;
    const totalCoins = data?.totalCoins ?? getCoins();

    if (coinsEarned > 0) {
      this.add.text(GAME_WIDTH / 2, 195, `+${coinsEarned} coins!`, {
        fontSize: '24px',
        fontFamily: 'Arial Black',
        color: '#ffdd00',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5);
    }

    this.add.text(GAME_WIDTH / 2, 225, `Total: ${totalCoins} coins`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#ffdd00',
    }).setOrigin(0.5);

    // Play again button
    const btnBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 60, 180, 50, 0xff4444, 0.9)
      .setInteractive();
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'PLAY AGAIN', {
      fontSize: '20px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
    }).setOrigin(0.5);

    btnBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('TitleScene');
      });
    });
  }
}
