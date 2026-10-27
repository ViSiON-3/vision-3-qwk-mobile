import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Eyebrow, Chip, Mono, Button, useToast } from '../components';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard, getActiveSession } from '../store/useStore';
import { makeClient, describeSyncError, needsRepair } from '../store/net';
import { loginForPairing, PairedDevice, QwkAuthError, QwkClient } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Devices'>;

/** ISO timestamp → short local stamp; '' for null/invalid. */
function stamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Paired devices of the active board: list them, unpair any (drop a lost
 * phone). Uses the live device session when dialled in; otherwise — e.g. from
 * Connect on a phone that is not paired yet — a password login gives a pair
 * token that works for the devices endpoints and is logged out on leave.
 */
export function DevicesScreen({ navigation }: Props) {
  const board = useStore(activeBoard);
  const loggedIn = useStore((s) => s.loggedIn);
  const demoMode = useStore((s) => s.settings.demoMode);
  const forgetPairing = useStore((s) => s.forgetPairing);
  const toast = useToast();

  const session = loggedIn ? getActiveSession() : null;
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Pair-token path (no live session): the client + token live for this screen
  // only. State so the password form reappears when the token stops working; a
  // ref mirror so the unmount cleanup can log it out.
  const [pairAuth, setPairAuth] = useState<{ client: QwkClient; token: string } | null>(null);
  const pairAuthRef = useRef(pairAuth);
  pairAuthRef.current = pairAuth;

  /** Show an error. One that means "this phone is no longer paired" (unpaired
   * elsewhere, or the password changed) also drops the local pairing + session,
   * as the store does, so the screen falls back to the password login. */
  const fail = (e: unknown) => {
    setError(describeSyncError(e));
    if (needsRepair(e) && board) void forgetPairing(board.id);
  };

  /** A pair token that was refused is useless: drop it (best-effort logout) so
   * the password form comes back. */
  const dropPairAuth = () => {
    const auth = pairAuthRef.current;
    setPairAuth(null);
    if (auth) auth.client.logout(auth.token).catch(() => undefined);
  };

  const loadWithSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setDevices(await session.listDevices());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [session]);

  useEffect(() => {
    if (session && !demoMode) void loadWithSession();
  }, [session, demoMode, loadWithSession]);

  // A pair token has one job here; invalidate it when the screen goes away.
  useEffect(
    () => () => {
      const auth = pairAuthRef.current;
      if (auth) auth.client.logout(auth.token).catch(() => undefined);
    },
    []
  );

  const onPasswordLogin = async () => {
    if (!board || !password) return;
    if (!board.handle.trim()) {
      setError('Enter a handle for this board first (Boards › edit).');
      return;
    }
    const pw = password;
    setPassword('');
    setBusy(true);
    setError(null);
    try {
      const client = makeClient(board);
      const { token } = await loginForPairing(client, board.handle, pw);
      try {
        const list = await client.listDevices(token);
        setPairAuth({ client, token });
        setDevices(list);
      } catch (e) {
        // Keep the password form: a token that could not list is not kept.
        client.logout(token).catch(() => undefined);
        throw e;
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const unpair = async (device: PairedDevice) => {
    if (!board) return;
    setConfirmId(null);
    setBusy(true);
    setError(null);
    try {
      if (session) await session.unpairDevice(device.id);
      else if (pairAuth) {
        try {
          await pairAuth.client.deleteDevice(pairAuth.token, device.id);
        } catch (e) {
          if (e instanceof QwkAuthError) dropPairAuth(); // pair token expired (10 min)
          throw e;
        }
      } else throw new Error('Log in first.');
      setDevices((list) => (list ?? []).filter((d) => d.id !== device.id));
      const thisPhone = device.current || device.id === board.pairing?.deviceId;
      if (thisPhone) {
        // The server has already ended this phone's session; mirror that here.
        await forgetPairing(board.id);
        toast('This phone is unpaired — pair again from Dial In');
      } else {
        toast(`Unpaired ${device.name}`);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const needsPassword = !session && !pairAuth;

  return (
    <Screen title="PAIRED DEVICES" onBack={() => navigation.goBack()} scroll>
      <Eyebrow>{board ? `${board.name.toUpperCase()} · ${board.handle || '—'}` : 'NO BOARD'}</Eyebrow>

      {demoMode ? (
        <Card>
          <Mono size={fontSize.listMeta} color={colors.textMuted}>
            Demo mode uses a sample packet and no live board. Turn on Live connection in Settings to manage the
            devices paired with your account.
          </Mono>
        </Card>
      ) : needsPassword ? (
        <Card>
          <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.hint}>
            Not dialled in. Log in with your password to see and unpair the devices on this account — for
            example a phone you no longer have. The password is used for this screen only.
          </Mono>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={onPasswordLogin}
            editable={!busy}
          />
          <Button
            title={busy ? 'LOGGING IN…' : 'LOG IN'}
            variant="secondary"
            onPress={onPasswordLogin}
            disabled={busy || !password}
            style={styles.loginBtn}
          />
          {error && (
            <Mono size={fontSize.listMeta} color={colors.red} style={styles.hint}>
              ✗ {error}
            </Mono>
          )}
        </Card>
      ) : (
        <>
          {error && (
            <Card style={styles.error}>
              <Mono color={colors.red} size={fontSize.listMeta}>
                ✗ {error}
              </Mono>
            </Card>
          )}
          {devices === null && busy && (
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.hint}>
              loading…
            </Mono>
          )}
          {devices?.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.textDim} />
              <Mono size={fontSize.listPrimary} color={colors.textMuted} style={styles.emptyText}>
                No devices paired
              </Mono>
            </View>
          )}
          {devices?.map((d) => {
            const thisPhone = d.current || d.id === board?.pairing?.deviceId;
            const confirming = confirmId === d.id;
            return (
              <View key={d.id} style={styles.rowWrap}>
                <Card style={thisPhone ? [styles.card, styles.cardCurrent] : styles.card}>
                  <View style={styles.nameRow}>
                    <Mono size={fontSize.listPrimary} color={colors.textPrimary} numberOfLines={1} style={styles.name}>
                      {d.name || d.id}
                    </Mono>
                    {thisPhone && <Chip label="THIS PHONE" color={colors.green} />}
                  </View>
                  <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
                    {`paired ${stamp(d.createdAt) || '—'}`}
                  </Mono>
                  <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
                    {d.lastUsed ? `last used ${stamp(d.lastUsed)}` : 'never used'}
                  </Mono>
                </Card>
                {confirming ? (
                  <Pressable
                    onPress={() => unpair(d)}
                    disabled={busy}
                    style={({ pressed }) => [styles.iconButton, styles.confirmButton, pressed && styles.iconPressed]}
                  >
                    <Mono size={9.5} weight="semibold" color={colors.red} spacing={0.5}>
                      UNPAIR
                    </Mono>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setConfirmId(d.id)}
                    disabled={busy}
                    accessibilityLabel={`Unpair ${d.name}`}
                    style={({ pressed }) => [styles.iconButton, styles.deleteButton, pressed && styles.iconPressed]}
                    hitSlop={6}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.red} />
                  </Pressable>
                )}
              </View>
            );
          })}
          <Mono size={fontSize.listMeta} color={colors.textDim} style={styles.footer}>
            Unpairing a device ends its session at once. Changing your password on the BBS unpairs every device.
          </Mono>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: spacing.sm, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.input,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: fontSize.listPrimary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  loginBtn: { marginTop: spacing.md },
  error: { marginBottom: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.red },
  rowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginBottom: spacing.md },
  card: { flex: 1, justifyContent: 'center' },
  cardCurrent: { borderLeftWidth: 2, borderLeftColor: colors.green },
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
  confirmButton: { width: 64, borderColor: colors.red },
  iconPressed: { backgroundColor: colors.surfaceInset },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { marginTop: spacing.md },
  footer: { marginTop: spacing.md },
});
