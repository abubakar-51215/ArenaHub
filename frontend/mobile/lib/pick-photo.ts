/**
 * Pick one photo: from the gallery, or taken with the camera. On a phone this is expo-image-picker. On the web build a file input is used instead:
 * expo-image-picker's web picker throws inside its own listener when a non-image file is chosen (a text file, say), its
 * promise never settles and the screen is stuck. Here any file comes back with its type and size, so the caller's
 * `photoProblem` check shows "That file is not a photo we can use. Use a JPG or PNG up to 5 MB." instead.
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

/** The person (or the phone's settings) refused the camera or the photo library: the screen says so and carries on. */
export class PhotoPermissionError extends Error {
  constructor(public readonly source: 'camera' | 'library') {
    super(source === 'camera' ? 'The camera is not allowed.' : 'The photo library is not allowed.');
    this.name = 'PhotoPermissionError';
  }
}

export type PhotoSource = 'library' | 'camera';

/** null when the person closed the picker without choosing. Throws {@link PhotoPermissionError} when access is refused. */
export async function pickPhoto(options: ImagePicker.ImagePickerOptions & { source?: PhotoSource } = {}): Promise<PickedPhoto | null> {
  const { source = 'library', ...pickerOptions } = options;
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    if (source === 'camera') {
      const asked = await ImagePicker.requestCameraPermissionsAsync();
      if (!asked.granted) throw new PhotoPermissionError('camera');
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], ...pickerOptions });
      return shot.canceled || !shot.assets[0] ? null : shot.assets[0];
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], ...pickerOptions });
      return res.canceled || !res.assets[0] ? null : res.assets[0];
    } catch {
      throw new PhotoPermissionError('library');
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // offers photos first; "All files" stays possible in the browser, and is answered by photoProblem
    input.accept = 'image/jpeg,image/png,image/webp';
    // on a phone's browser this opens the camera; on a computer it is an ordinary file chooser
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let settled = false;
    const done = (value: PickedPhoto | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      done({ uri: URL.createObjectURL(file), fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size });
    });
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}
