// Singleton background music for every non-battle scene.
// The Battle scene calls stopMenuMusic() so it doesn't fight the battle music.

let audio: HTMLAudioElement | null = null;
let gestureBound = false;

export function startMenuMusic(): void {
  if (audio) {
    audio.play().catch(() => { /* needs gesture */ });
    return;
  }
  const base = (import.meta.env?.BASE_URL ?? '/') + 'sounds/';
  audio = new Audio(base + 'menuTheme.mp3');
  audio.loop = true;
  audio.volume = 0.5;
  audio.play().catch(() => { /* needs gesture */ });
  if (!gestureBound) {
    gestureBound = true;
    const tryPlay = () => audio && audio.play().catch(() => { /* ignore */ });
    const onGesture = () => {
      tryPlay();
      window.removeEventListener('click', onGesture);
      window.removeEventListener('touchstart', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('click', onGesture);
    window.addEventListener('touchstart', onGesture);
    window.addEventListener('keydown', onGesture);
  }
}

export function stopMenuMusic(): void {
  if (audio) audio.pause();
}
