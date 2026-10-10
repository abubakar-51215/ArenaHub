import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// "First launch after install": a small file in the app's own storage. It goes with the app when it is
// uninstalled (the keychain does not, so it is not used here). On web a localStorage key does the same.
const NAME = 'arenahub-first-launch-done';

export function hasLaunchedBefore(): boolean {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' && localStorage.getItem(NAME) === '1';
    return new File(Paths.document, NAME).exists;
  } catch {
    return true; // when storage cannot be read, use the quick version rather than the long one
  }
}

export function markLaunched(): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NAME, '1');
      return;
    }
    const f = new File(Paths.document, NAME);
    if (!f.exists) {
      f.create();
      f.write('1');
    }
  } catch {
    // nothing to do: the next start just plays the full version again
  }
}
