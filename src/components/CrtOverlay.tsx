import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../store/useStore';

/**
 * Non-interactive CRT overlays (above content): scanlines + edge vignette.
 * Driven by the persisted Scanlines/Glow settings (both default on). The title
 * glow itself lives on ScreenTitle via textShadow.
 */
export function CrtOverlay() {
  const scanlines = useStore((s) => s.settings.scanlines);
  const glow = useStore((s) => s.settings.glow);

  const lines = useMemo(() => {
    const h = Dimensions.get('screen').height;
    const rows: React.ReactNode[] = [];
    for (let y = 0; y < h; y += 3) {
      rows.push(<View key={y} style={[styles.scanline, { top: y }]} />);
    }
    return rows;
  }, []);

  if (!scanlines && !glow) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {scanlines && <View style={StyleSheet.absoluteFill}>{lines}</View>}
      {glow && (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            style={[styles.vignette, { top: 0, height: 120 }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.45)']}
            style={[styles.vignette, { bottom: 0, height: 160 }]}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  vignette: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
