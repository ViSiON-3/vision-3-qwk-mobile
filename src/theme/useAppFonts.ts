import { useFonts } from 'expo-font';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';

/** Loads IBM Plex Mono (UI chrome) + the bundled IBMVGA CP437 face. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    IBMVGA: require('../../assets/fonts/WebPlusIBMVGA8x16.ttf'),
  });
  return loaded;
}
