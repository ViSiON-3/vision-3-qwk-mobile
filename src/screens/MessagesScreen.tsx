import React from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, Eyebrow, MessageListRow } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, messagesForArea, unreadInArea } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Messages'>;

/** Drill-down — the messages in one area (flat, chronological QWK ordering). */
export function MessagesScreen({ route, navigation }: Props) {
  const { areaId } = route.params;
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const markRead = useStore((s) => s.markRead);
  const areas = useStore((s) => s.areas);
  const area = areas.find((a) => a.id === areaId);
  const list = messagesForArea(messages, areaId);
  const unread = unreadInArea(messages, areaId, readIds);

  const open = (id: string) => {
    markRead(id);
    navigation.navigate('Reader', { areaId, messageId: id });
  };

  return (
    <Screen title={area?.name ?? 'MESSAGES'} onBack={() => navigation.goBack()} scroll>
      <Eyebrow>{`${list.length} MESSAGES · ${unread} UNREAD`}</Eyebrow>
      <Card style={styles.card}>
        {list.map((m, i) => (
          <MessageListRow
            key={m.id}
            message={m}
            unread={!readIds.has(m.id)}
            metaRight={`#${m.number}  ${m.date}`}
            showRecipient
            onPress={() => open(m.id)}
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
