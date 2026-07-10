import React from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Screen, Card, Eyebrow, MessageListRow, GearButton } from '../components';
import { colors } from '../theme/tokens';
import { RootStackParamList, TabParamList } from '../navigation/types';
import { useStore, privateMessages } from '../store/useStore';

/** MAIL tab — conference-0 email, kept separate from public conferences. */
export function PrivateMailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const list = privateMessages(messages);

  return (
    <Screen title="PRIVATE MAIL" onBack={() => tabNav.navigate('Sync')} right={<GearButton />} scroll>
      <Eyebrow color={colors.magenta}>CONFERENCE 0 · EMAIL</Eyebrow>
      <Card style={styles.card}>
        {list.map((m, i) => (
          <MessageListRow
            key={m.id}
            message={m}
            unread={!readIds.has(m.id)}
            metaRight={m.date}
            onPress={() => nav.navigate('Reader', { areaId: m.areaId, messageId: m.id })}
            last={i === list.length - 1}
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
});
