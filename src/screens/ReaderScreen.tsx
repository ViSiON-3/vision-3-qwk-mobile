import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, messagesForArea, areas } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

/** A magenta [Field] label followed by its value, Synchronet-reader style. */
function Field({ name, value, right }: { name: string; value: string; right?: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Mono size={fontSize.body} color={colors.magentaBrk}>
        [<Mono size={fontSize.body} color={colors.magenta} weight="medium">{name}</Mono>]{' '}
      </Mono>
      <Mono size={fontSize.body} color={colors.textPrimary} style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Mono>
      {right}
    </View>
  );
}

export function ReaderScreen({ navigation, route }: Props) {
  const { areaId, messageId } = route.params;
  const markRead = useStore((s) => s.markRead);
  const messages = useStore((s) => s.messages);

  const list = messagesForArea(messages, areaId);
  const index = list.findIndex((m) => m.id === messageId);
  const msg = list[index];

  const area = areas.find((a) => a.id === areaId);

  useEffect(() => {
    if (msg) markRead(msg.id);
  }, [msg, markRead]);

  if (!msg) {
    return (
      <Screen title="MESSAGE" onBack={() => navigation.goBack()}>
        <Mono color={colors.textMuted}>Message not found.</Mono>
      </Screen>
    );
  }

  const hasPrev = index > 0;
  const hasNext = index < list.length - 1;
  const go = (i: number) => navigation.setParams({ messageId: list[i].id });

  const replyButton = (
    <Button title="REPLY" variant="primary" style={styles.headerReply} onPress={openReply} />
  );

  function openReply() {
    navigation.navigate('Compose', {
      toHandle: msg.from,
      subject: msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`,
      conferenceNumber: area?.qwkConference ?? 0,
      areaName: area?.name ?? '',
      priv: msg.isPrivate,
    });
  }

  return (
    <Screen title="MESSAGE" onBack={() => navigation.goBack()} right={replyButton} scroll>
      <Card style={styles.header}>
        <Field name="Subj" value={msg.subject} />
        <Field
          name="From"
          value={msg.from}
          right={
            <Mono size={fontSize.listMeta} color={colors.redSoft}>
              {index + 1} of {list.length}
            </Mono>
          }
        />
        <View style={styles.splitRow}>
          <Field name="To" value={msg.to} />
          <Mono size={fontSize.body} color={colors.magentaBrk}>
            [<Mono size={fontSize.body} color={colors.magenta} weight="medium">When</Mono>]{' '}
            <Mono size={fontSize.body} color={colors.textBody}>
              {msg.date} {msg.time}
            </Mono>
          </Mono>
        </View>
        <Field name="Area" value={area?.tag ?? ''} />
      </Card>

      <Vga size={fontSize.body} color={colors.textBody} style={styles.body}>
        {msg.body}
      </Vga>

      <View style={styles.footer}>
        <Button title="◄ PREV" variant="secondary" style={styles.navBtn} disabled={!hasPrev} onPress={() => go(index - 1)} />
        <Button title="↩ REPLY" variant="primary" style={styles.navBtn} onPress={openReply} />
        <Button title="NEXT ►" variant="secondary" style={styles.navBtn} disabled={!hasNext} onPress={() => go(index + 1)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerReply: { height: 34, paddingHorizontal: 14, borderRadius: radius.chip },
  header: { gap: 6, backgroundColor: colors.surfaceConsole },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  fieldValue: { flex: 1 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  body: { marginTop: spacing.lg, lineHeight: 20 },
  footer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  navBtn: { flex: 1, height: 44 },
});
