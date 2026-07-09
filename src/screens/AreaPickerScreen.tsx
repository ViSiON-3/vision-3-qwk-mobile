import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Screen, Mono, Card } from '../components';
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
          <View key={a.id} style={[styles.row, i < areas.length - 1 && styles.divider]}>
            <Mono size={fontSize.body} color={colors.textPrimary} onPress={() => choose(a)}>
              {a.name}
            </Mono>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden', marginTop: spacing.md },
  row: { padding: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.borderDivider },
});
