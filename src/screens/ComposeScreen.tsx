import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fonts, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Card, Button, Chip, useToast } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

export function ComposeScreen({ navigation, route }: Props) {
  const { mode, editDraftId } = route.params;
  const board = useStore(activeBoard);
  const drafts = useStore((s) => s.drafts);
  const addDraft = useStore((s) => s.addDraft);
  const updateDraft = useStore((s) => s.updateDraft);
  const removeDraft = useStore((s) => s.removeDraft);
  const toast = useToast();

  // When editing an existing draft, its stored fields win over route params.
  const editing = editDraftId ? drafts.find((d) => d.id === editDraftId) : undefined;

  const isNew = mode === 'new' && !editing;
  const [to, setTo] = useState(editing?.to ?? route.params.toHandle ?? (isNew ? 'All' : ''));
  const [subject, setSubject] = useState(editing?.subject ?? route.params.subject ?? '');
  const [body, setBody] = useState(editing?.body ?? route.params.initialBody ?? '');

  const priv = editing?.priv ?? !!route.params.priv;
  const areaName = editing?.areaName ?? route.params.areaName ?? '';
  const conferenceNumber = editing?.conferenceNumber ?? route.params.conferenceNumber ?? 0;
  const reference = editing?.reference ?? route.params.reference;
  const inReplyTo = editing?.inReplyTo ?? route.params.inReplyTo;

  const canSave = body.trim().length > 0;
  const repName = `${board?.bbsId ?? 'BBS'}.REP`;

  const commitSave = () => {
    const fields = {
      to: to.trim() || 'All',
      from: board?.handle ?? '',
      subject: subject.trim() || (mode === 'reply' ? 'Re:' : '(no subject)'),
      areaName,
      conferenceNumber,
      priv,
      body,
      reference,
      inReplyTo,
    };
    if (editing) updateDraft(editing.id, fields);
    else addDraft(fields);
    navigation.goBack();
    toast(`Saved to ${repName}`);
  };

  const kill = () => {
    if (editing) removeDraft(editing.id);
    navigation.goBack();
    toast('Message killed');
  };

  // Classic BBS save prompt: Save (default) / Kill (destructive) / Edit (cancel).
  const onSave = () => {
    if (!canSave) return;
    Alert.alert('Save message?', undefined, [
      { text: 'Edit', style: 'cancel' },
      { text: 'Kill', style: 'destructive', onPress: kill },
      { text: 'Save', onPress: commitSave },
    ]);
  };

  const title = isNew ? 'NEW MESSAGE' : editing ? 'EDIT REPLY' : 'REPLY';

  return (
    <Screen title={title} onBack={() => navigation.goBack()} scroll>
      <Card style={styles.header}>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>To{'  '}</Mono>
          {isNew ? (
            <TextInput
              value={to}
              onChangeText={setTo}
              style={styles.toInput}
              placeholder="All"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          ) : (
            <Mono size={fontSize.body} color={colors.blueText} weight="semibold">{to}</Mono>
          )}
          {priv && <View style={styles.chip}><Chip label="PRIVATE" color={colors.magenta} /></View>}
        </View>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>Area{'  '}</Mono>
          <Mono size={fontSize.body} color={colors.textBody}>{areaName}</Mono>
        </View>
        <View style={styles.subjRow}>
          <Mono size={fontSize.listMeta} color={colors.magenta} spacing={letterSpacing.label}>Subj{'  '}</Mono>
          {isNew ? (
            <TextInput
              value={subject}
              onChangeText={setSubject}
              style={styles.subjInput}
              placeholder="Subject"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Mono size={fontSize.body} color={colors.textPrimary} style={styles.subjFixed} numberOfLines={1}>{subject}</Mono>
          )}
        </View>
      </Card>

      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        autoCorrect
        spellCheck
        textAlignVertical="top"
        placeholder="Write your message…"
        placeholderTextColor={colors.textMuted}
        style={styles.body}
      />

      <Button title="⬇ SAVE" onPress={onSave} disabled={!canSave} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, backgroundColor: colors.surfaceConsole },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  chip: { marginLeft: spacing.sm },
  toInput: { flex: 1, color: colors.blueText, fontFamily: fonts.mono, fontSize: fontSize.body, padding: 0 },
  subjRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderDivider, paddingTop: spacing.sm },
  subjInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.mono, fontSize: fontSize.body, padding: 0 },
  subjFixed: { flex: 1 },
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
