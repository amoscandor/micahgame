// Default control bindings for keyboard, gamepad, and touch
// Users can remap any action to any input

export type InputType = 'keyboard' | 'gamepad-button' | 'gamepad-axis' | 'gamepad-trigger';

export interface Binding {
  type: InputType;
  code: string; // e.g. 'KeyW', 'button-0', 'axis-0-neg', 'trigger-7'
  label: string; // human-readable e.g. 'W', 'A Button', 'Left Stick Up', 'R2'
}

export interface ControlScheme {
  moveForward: Binding;
  moveBackward: Binding;
  moveLeft: Binding;
  moveRight: Binding;
  lookLeft: Binding;
  lookRight: Binding;
  lookUp: Binding;
  lookDown: Binding;
  shoot: Binding;
  jump: Binding;
  sprint: Binding;
  walk: Binding;
  enterCar: Binding;
  quit: Binding;
  stop: Binding;
}

const STORAGE_KEY = 'fw-controls-v4';

export const ACTION_LABELS: Record<keyof ControlScheme, string> = {
  moveForward: 'Move Forward',
  moveBackward: 'Move Backward',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  lookLeft: 'Look Left',
  lookRight: 'Look Right',
  lookUp: 'Look Up',
  lookDown: 'Look Down',
  shoot: 'Shoot',
  jump: 'Jump',
  sprint: 'Run (hold)',
  walk: 'Walk (hold)',
  enterCar: 'Ride/Dismount Dino',
  quit: 'Quit',
  stop: 'Stop',
};

export const DEFAULT_KEYBOARD: ControlScheme = {
  moveForward:  { type: 'keyboard', code: 'ArrowUp', label: '↑' },
  moveBackward: { type: 'keyboard', code: 'ArrowDown', label: '↓' },
  moveLeft:     { type: 'keyboard', code: 'ArrowLeft', label: '←' },
  moveRight:    { type: 'keyboard', code: 'ArrowRight', label: '→' },
  lookLeft:     { type: 'keyboard', code: 'MouseX-', label: 'Mouse ←' },
  lookRight:    { type: 'keyboard', code: 'MouseX+', label: 'Mouse →' },
  lookUp:       { type: 'keyboard', code: 'MouseY-', label: 'Mouse ↑' },
  lookDown:     { type: 'keyboard', code: 'MouseY+', label: 'Mouse ↓' },
  shoot:        { type: 'keyboard', code: 'KeyW', label: 'W' },
  jump:         { type: 'keyboard', code: 'KeyQ', label: 'Q' },
  sprint:       { type: 'keyboard', code: 'KeyR', label: 'R' },
  walk:         { type: 'keyboard', code: 'KeyE', label: 'E' },
  enterCar:     { type: 'keyboard', code: 'KeyC', label: 'C' },
  quit:         { type: 'keyboard', code: 'Escape', label: 'Esc' },
  stop:         { type: 'keyboard', code: 'Space', label: 'Space' },
};

export const DEFAULT_GAMEPAD: ControlScheme = {
  moveForward:  { type: 'gamepad-axis', code: 'axis-1-neg', label: 'L Stick ↑' },
  moveBackward: { type: 'gamepad-axis', code: 'axis-1-pos', label: 'L Stick ↓' },
  moveLeft:     { type: 'gamepad-axis', code: 'axis-0-neg', label: 'L Stick ←' },
  moveRight:    { type: 'gamepad-axis', code: 'axis-0-pos', label: 'L Stick →' },
  lookLeft:     { type: 'gamepad-axis', code: 'axis-2-neg', label: 'R Stick ←' },
  lookRight:    { type: 'gamepad-axis', code: 'axis-2-pos', label: 'R Stick →' },
  lookUp:       { type: 'gamepad-axis', code: 'axis-3-neg', label: 'R Stick ↑' },
  lookDown:     { type: 'gamepad-axis', code: 'axis-3-pos', label: 'R Stick ↓' },
  shoot:        { type: 'gamepad-trigger', code: 'trigger-7', label: 'RT' },
  jump:         { type: 'gamepad-button', code: 'button-1', label: 'B' },
  sprint:       { type: 'gamepad-button', code: 'button-5', label: 'RB' },
  walk:         { type: 'gamepad-button', code: 'button-4', label: 'LB' },
  enterCar:     { type: 'gamepad-button', code: 'button-3', label: 'Y' },
  quit:         { type: 'gamepad-button', code: 'button-8', label: 'View' },
  stop:         { type: 'gamepad-trigger', code: 'trigger-6', label: 'LT' },
};

export function getControls(device: 'keyboard' | 'gamepad'): ControlScheme {
  const defaults = device === 'keyboard' ? DEFAULT_KEYBOARD : DEFAULT_GAMEPAD;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved[device]) {
        // Merge saved with defaults so newly-added actions get sane bindings
        return { ...defaults, ...saved[device] };
      }
    }
  } catch { /* ignore */ }
  return { ...defaults };
}

export function saveControls(device: 'keyboard' | 'gamepad', scheme: ControlScheme): void {
  let data: Record<string, ControlScheme> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch { /* ignore */ }
  data[device] = scheme;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetControls(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Helper: get a nice label for a keyboard code
export function keyCodeToLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code.startsWith('Arrow')) return code.slice(5) + ' Arrow';
  return code;
}

// Helper: get a nice label for a gamepad button
export function gamepadButtonLabel(index: number): string {
  const labels = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'];
  return labels[index] || `Button ${index}`;
}
