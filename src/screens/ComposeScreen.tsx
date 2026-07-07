import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fonts, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button, Chip, useToast } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

export function ComposeScreen({ navigation, route }: Props) {
  const { toHandle, conferenceNumber, areaName, priv, reference, inReplyTo } = route.params;
  const board = useStore(activeBoard);
  const addDraft = useStore((s) => s.addDraft);
  const toast = useToast();

  const [subject, setSubject] = useState(route.params.subject);
  const [body, setBody] = useState('');

  const save = () => {
    if (body.trim().length === 0) {
      toast('Write a reply first');
      return;
    }
    addDraft({
      to: toHandle,
      from: board?.handle ?? '',
      subject: subject.trim() || 'Re:',
      areaName,
      conferenceNumber,
      priv: !!priv,
      body,
      reference,
      inReplyTo,
    });
    navigation.goBack();
    toast('Saved to Outbox');
  };

  return (
    <Screen title="COMPOSE" onBack={() => navigation.goBack()} scroll>
      <Card style={styles.header}>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>
            To{'  '}
          </Mono>
          <Mono size={fontSize.body} color={colors.blueText} weight="semibold">
            {toHandle}
          </Mono>
          {priv && <View style={styles.chip}><Chip label="PRIVATE" color={colors.magenta} /></View>}
        </View>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>
            Area{'  '}
          </Mono>
          <Mono size={fontSize.body} color={colors.textBody}>
            {areaName}
          </Mono>
        </View>
        <View style={styles.subjRow}>
          <Mono size={fontSize.listMeta} color={colors.magenta} spacing={letterSpacing.label}>
            Subj{'  '}
          </Mono>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            style={styles.subjInput}
            placeholder="Subject"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </Card>

      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
        placeholder="Write your reply…"
        placeholderTextColor={colors.textMuted}
        style={styles.body}
      />

      <Button title="⬇ SAVE TO OUTBOX" onPress={save} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, backgroundColor: colors.surfaceConsole },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  chip: { marginLeft: spacing.sm },
  subjRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderDivider, paddingTop: spacing.sm },
  subjInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.mono, fontSize: fontSize.body, padding: 0 },
  body: {
    marginTop: spacing.md,
    minHeight: 220,
    backgroundColor: colors.surfaceConsole,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.input,
    padding: spacing.md,
    color: colors.textBody,
    fontFamily: fonts.vga,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  save: { marginTop: spacing.lg },
});
