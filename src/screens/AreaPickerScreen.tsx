import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, ListRow } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaPicker'>;

export function AreaPickerScreen({ navigation }: Props) {
  const areas = useStore((s) => s.areas);

  const choose = (a: (typeof areas)[number]) => {
    navigation.replace('ComposeOptions', {
      mode: 'new',
      toHandle: 'All',
      subject: '',
      conferenceNumber: a.qwkConference,
      areaName: a.name,
      privateArea: false,
    });
  };

  return (
    <Screen title="NEW MESSAGE" onBack={() => navigation.goBack()} scroll>
      <Mono size={fontSize.listMeta} color={colors.textMuted}>Choose an area to post in</Mono>
      <Card style={styles.list}>
        {areas.map((a, i) => (
          <ListRow key={a.id} onPress={() => choose(a)} last={i === areas.length - 1}>
            <View style={styles.content}>
              <Vga size={16} color={colors.textPrimary}>
                {a.name}
              </Vga>
              <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.subline}>
                {a.tag}
              </Mono>
            </View>
          </ListRow>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden', marginTop: spacing.md },
  content: { flex: 1 },
  subline: { marginTop: 3 },
});
