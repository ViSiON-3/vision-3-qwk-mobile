import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';

/** Loads IBM Plex Mono (UI chrome) + the bundled IBMVGA CP437 face.
 * Returns "ready" true once loaded — or if loading fails, so a missing/corrupt
 * font degrades to system fonts instead of stranding the app on the splash. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    IBMVGA: require('../../assets/fonts/WebPlusIBMVGA8x16.ttf'),
  });

  useEffect(() => {
    if (error) console.warn('Font loading failed; falling back to system fonts', error);
  }, [error]);

  return loaded || error != null;
}
