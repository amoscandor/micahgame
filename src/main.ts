import Phaser from 'phaser';
import { gameConfig } from './config/game.config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { ModeSelectScene } from './scenes/ModeSelectScene';
import { LobbyScene } from './scenes/LobbyScene';
import { BattleScene } from './scenes/BattleScene';
import { BossScene } from './scenes/BossScene';
import { GameOverScene } from './scenes/GameOverScene';
import { CharacterCreatorScene } from './scenes/CharacterCreatorScene';
import { CharacterShopScene } from './scenes/CharacterShopScene';

const config: Phaser.Types.Core.GameConfig = {
  ...gameConfig,
  scene: [BootScene, TitleScene, CharacterSelectScene, ModeSelectScene, LobbyScene, BattleScene, BossScene, GameOverScene, CharacterCreatorScene, CharacterShopScene],
};

new Phaser.Game(config);
