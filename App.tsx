import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastProvider } from './src/components';
import { useAppFonts } from './src/theme/useAppFonts';
import { useStore } from './src/store/useStore';
import { colors } from './src/theme/tokens';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.appBg,
    card: colors.surfaceHeader,
    border: colors.border,
    primary: colors.blue,
    text: colors.textPrimary,
  },
};

export default function App() {
  const fontsLoaded = useAppFonts();
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const [hydrationError, setHydrationError] = useState<Error | null>(null);

  const runHydrate = useCallback(() => {
    setHydrationError(null);
    // Without catching, a failed AsyncStorage/FS read would leave `hydrated`
    // false forever and strand the app on the blank splash with no signal.
    hydrate().catch((err) => {
      console.error('App hydration failed', err);
      setHydrationError(err instanceof Error ? err : new Error(String(err)));
    });
  }, [hydrate]);

  useEffect(() => {
    runHydrate();
  }, [runHydrate]);

  if (hydrationError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.appBg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 8 }}>Couldn't load your data</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          {hydrationError.message}
        </Text>
        <Pressable
          onPress={runHydrate}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: colors.cyan, fontSize: 14 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!fontsLoaded || !hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.appBg }} />;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="light" />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
