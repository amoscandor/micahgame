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
import { ShopHubScene } from './scenes/ShopHubScene';
import { ArmorShopScene } from './scenes/ArmorShopScene';
import { SettingsScene } from './scenes/SettingsScene';
import { DrawOnSkinScene } from './scenes/DrawOnSkinScene';
import { PetShopScene } from './scenes/PetShopScene';

const config: Phaser.Types.Core.GameConfig = {
  ...gameConfig,
  scene: [BootScene, TitleScene, CharacterSelectScene, ModeSelectScene, LobbyScene, BattleScene, BossScene, GameOverScene, CharacterCreatorScene, CharacterShopScene, ShopHubScene, ArmorShopScene, SettingsScene, DrawOnSkinScene, PetShopScene],
};

new Phaser.Game(config);
