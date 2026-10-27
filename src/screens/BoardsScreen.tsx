import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Eyebrow, Chip, Vga, Mono, useToast } from '../components';
import { colors, fontSize, radius, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Boards'>;

/** Screen 11 — manage saved boards; tap to switch the active one. */
export function BoardsScreen({ navigation }: Props) {
  const boards = useStore((s) => s.boards);
  const activeBoardId = useStore((s) => s.activeBoardId);
  const selectBoard = useStore((s) => s.selectBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const toast = useToast();

  return (
    <Screen title="BOARDS" onBack={() => navigation.goBack()} scroll>
      <Eyebrow>{`SAVED BOARDS · ${boards.length}`}</Eyebrow>

      {boards.map((board) => {
        const active = board.id === activeBoardId;
        return (
          <View key={board.id} style={styles.rowWrap}>
            <Pressable
              onPress={() => {
                const { disconnected } = selectBoard(board.id);
                toast(
                  disconnected
                    ? `Switched to ${board.name} — dial in to sync`
                    : `Active board: ${board.name}`
                );
              }}
              style={({ pressed }) => [styles.cardPress, pressed && { opacity: 0.85 }]}
            >
              <Card style={active ? [styles.card, styles.cardActive] : styles.card}>
                <View style={styles.nameRow}>
                  <Vga size={16} color={colors.textPrimary} numberOfLines={1} style={styles.name}>
                    {board.name}
                  </Vga>
                  {active && <Chip label="ACTIVE" color={colors.green} />}
                </View>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
                  {`${board.host}:${board.port}`}
                </Mono>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
                  login <Mono size={fontSize.listMeta} color={colors.textSecondary}>{board.handle || '—'}</Mono>
                  {' · '}
                  <Mono size={fontSize.listMeta} color={board.pairing ? colors.green : colors.amber}>
                    {board.pairing ? 'paired' : 'not paired'}
                  </Mono>
                </Mono>
              </Card>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('BoardForm', { boardId: board.id })}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              hitSlop={6}
            >
              <Ionicons name="pencil" size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => {
                if (!deleteBoard(board.id)) toast('Keep at least one board');
              }}
              style={({ pressed }) => [styles.iconButton, styles.deleteButton, pressed && styles.iconPressed]}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={16} color={colors.red} />
            </Pressable>
          </View>
        );
      })}

      <Pressable
        onPress={() => navigation.navigate('BoardForm', {})}
        style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="add" size={18} color={colors.blueText} />
        <Mono weight="semibold" size={fontSize.button} color={colors.blueText} spacing={1}>
          ADD BOARD
        </Mono>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardPress: { flex: 1 },
  card: { flex: 1, justifyContent: 'center' },
  cardActive: { borderLeftWidth: 2, borderLeftColor: colors.green },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  sub: { marginTop: 4 },
  iconButton: {
    width: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: { borderColor: colors.redAlt },
  iconPressed: { backgroundColor: colors.surfaceInset },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radius.button,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    marginTop: spacing.xs,
  },
});
