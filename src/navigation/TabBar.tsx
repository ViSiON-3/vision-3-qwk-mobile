import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, letterSpacing } from '../theme/tokens';
import { Mono } from '../components/text';
import { useStore, privateUnread } from '../store/useStore';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Sync: 'sync-outline',
  Mail: 'mail-outline',
  Conf: 'albums-outline',
  Outbox: 'paper-plane-outline',
};
const LABELS: Record<string, string> = { Sync: 'SYNC', Mail: 'MAIL', Conf: 'CONF', Outbox: 'OUTBOX' };

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const drafts = useStore((s) => s.drafts);
  const mailBadge = privateUnread(messages, readIds);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || 8 }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? colors.cyan : colors.textMutedAlt;
        const badge = route.name === 'Mail' ? mailBadge : route.name === 'Outbox' ? drafts.length : 0;
        return (
          <Pressable
            key={route.key}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          >
            <View>
              <Ionicons name={ICONS[route.name]} size={20} color={color} />
              {badge > 0 && (
                <View style={styles.badge}>
                  <Mono size={8} weight="bold" color="#06060a">
                    {badge}
                  </Mono>
                </View>
              )}
            </View>
            <Mono size={fontSize.tabLabel} weight={focused ? 'bold' : 'medium'} color={color} spacing={letterSpacing.label} style={styles.label}>
              {LABELS[route.name]}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceTabbar,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 4 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
