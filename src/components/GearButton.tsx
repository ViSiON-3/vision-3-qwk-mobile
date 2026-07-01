import React from 'react';
import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';

/** Settings gear shown on root screens' headers. */
export function GearButton() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable onPress={() => nav.navigate('Settings')} hitSlop={10}>
      <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
