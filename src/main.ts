import Phaser from 'phaser';
import { gameConfig } from './config/game.config';
import { startMenuMusic } from './utils/menuMusic';
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

// Background music for every non-battle scene. Battle/Boss scenes stop it.
startMenuMusic();

// In dev, kill any old service workers + caches so iPhone Safari always gets fresh code.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) reg.unregister();
  });
  if (typeof caches !== 'undefined') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}

// Dev-only: when any source file changes, fully reload the page instead of trying to
// hot-swap (Phaser scenes don't survive hot-swap cleanly). Works on iPhone over LAN.
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.location.reload();
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.location.reload();
  });
}
