import { saveCustomCharacter, CustomCharacter } from '../utils/imageStore';

/**
 * Opens a file picker, crops/resizes the selected photo to 128x128,
 * and saves it as a custom character in IndexedDB.
 */
export function importCharacterPhoto(onComplete: (character: CustomCharacter) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // opens camera on mobile

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const imageData = await cropAndResize(file, 128);
    const id = `custom-${Date.now()}`;

    // Prompt for name
    const name = prompt('Name your character:') || 'Custom';

    const character: CustomCharacter = { id, name, imageData };
    await saveCustomCharacter(character);
    onComplete(character);
  };

  input.click();
}

function cropAndResize(file: File, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Center-crop to square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}
