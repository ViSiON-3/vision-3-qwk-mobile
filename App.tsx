import React, { useEffect } from 'react';
import { View } from 'react-native';
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
