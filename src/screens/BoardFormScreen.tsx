import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Vga, Mono, Button, useToast } from '../components';
import { colors, fonts, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  normalizeFingerprint,
  isValidFingerprint,
  formatFingerprint,
  fingerprintsEqual,
  probeServerFingerprint,
  PinningUnavailableError,
} from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'BoardForm'>;

/** Screen 12 — create or edit a board's connection + credentials. */
export function BoardFormScreen({ navigation, route }: Props) {
  const boardId = route.params?.boardId;
  const boards = useStore((s) => s.boards);
  const addBoard = useStore((s) => s.addBoard);
  const updateBoard = useStore((s) => s.updateBoard);
  const toast = useToast();

  const existing = boardId ? boards.find((b) => b.id === boardId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(existing ? String(existing.port) : '');
  const [handle, setHandle] = useState(existing?.handle ?? '');
  const [pass, setPass] = useState(existing?.pass ?? '');
  const [fingerprint, setFingerprint] = useState(existing?.fingerprint ? formatFingerprint(existing.fingerprint) : '');
  const [probing, setProbing] = useState(false);
  // True when a freshly probed fingerprint differs from the board's saved pin —
  // the SSH "host key changed" warning: don't trust it unless the sysop rotated.
  const [changed, setChanged] = useState(false);

  const fpEntered = fingerprint.trim().length > 0;
  const fpValid = fpEntered && isValidFingerprint(fingerprint);

  const onTrustServer = async () => {
    const h = host.trim();
    if (!h) {
      toast('Enter the host first');
      return;
    }
    setProbing(true);
    try {
      const fp = await probeServerFingerprint(h, parseInt(port, 10) || 8666);
      setChanged(!!existing?.fingerprint && !fingerprintsEqual(fp, existing.fingerprint));
      setFingerprint(formatFingerprint(fp));
      toast('Fingerprint captured — verify, then save');
    } catch (e) {
      if (e instanceof PinningUnavailableError) toast('Fetching needs a dev build (not Expo Go)');
      else toast(e instanceof Error ? e.message : 'Could not reach the server');
    } finally {
      setProbing(false);
    }
  };

  const onSave = () => {
    if (!name.trim() || !host.trim()) {
      toast('Name and host are required');
      return;
    }
    if (fpEntered && !fpValid) {
      toast('Fingerprint must be a full SHA-256 (64 hex chars)');
      return;
    }
    const input = {
      name: name.trim(),
      host: host.trim(),
      port: parseInt(port, 10) || 8666,
      handle: handle.trim(),
      pass,
      fingerprint: fpEntered ? normalizeFingerprint(fingerprint) : undefined,
    };
    if (boardId) updateBoard(boardId, input);
    else addBoard(input);
    navigation.goBack();
    toast(boardId ? 'Board updated' : 'Board added');
  };

  return (
    <Screen title={boardId ? 'EDIT BOARD' : 'ADD BOARD'} onBack={() => navigation.goBack()} scroll>
      <Field label="BOARD NAME">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ViSiON/3 BBS"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      <View style={styles.rowFields}>
        <Field label="HOST" style={styles.flex2}>
          <TextInput
            value={host}
            onChangeText={setHost}
            placeholder="bbs.example.net"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        <Field label="PORT" style={styles.flex1}>
          <TextInput
            value={port}
            onChangeText={setPort}
            placeholder="8666"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            keyboardType="number-pad"
          />
        </Field>
      </View>

      <View style={styles.rowFields}>
        <Field label="HANDLE" style={styles.flex1}>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="handle"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
        <Field label="PASSWORD" style={styles.flex1}>
          <TextInput
            value={pass}
            onChangeText={setPass}
            placeholder="password"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
      </View>

      <Field label="TLS FINGERPRINT (SHA-256)">
        <TextInput
          value={fingerprint}
          onChangeText={(t) => {
            setFingerprint(t);
            setChanged(false); // manual edit clears the changed-cert warning
          }}
          placeholder="tap Trust Server, or paste from the BBS startup log"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.fpInput]}
          autoCapitalize="characters"
          autoCorrect={false}
          multiline
        />
        <View style={styles.fpActions}>
          <Button
            title={probing ? 'FETCHING…' : '⟳ TRUST SERVER'}
            variant="secondary"
            onPress={onTrustServer}
            disabled={probing || !host.trim()}
            style={styles.trustBtn}
          />
        </View>
        {changed ? (
          <Mono size={fontSize.listMeta} color={colors.red} style={styles.fpHint}>
            ⚠ Differs from the pinned cert — only trust this if the sysop regenerated it.
          </Mono>
        ) : (
          <Mono
            size={fontSize.listMeta}
            color={fpEntered && !fpValid ? colors.red : colors.textDim}
            style={styles.fpHint}
          >
            {fpEntered
              ? fpValid
                ? '✓ pinned — connections must match this cert'
                : `${normalizeFingerprint(fingerprint).length}/64 hex chars`
              : 'Trust-on-first-use: fetch + pin the cert, or paste it from the BBS startup log.'}
          </Mono>
        )}
      </Field>

      <View style={styles.saveWrap}>
        <Button title="SAVE BOARD" variant="primary" onPress={onSave} />
      </View>
    </Screen>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Vga color={colors.magenta} size={fontSize.eyebrow} spacing={letterSpacing.label} style={styles.label}>
        {label}
      </Vga>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { marginBottom: spacing.sm },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
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
  },
  fpInput: { fontSize: fontSize.listMeta, minHeight: 44 },
  fpActions: { flexDirection: 'row', marginTop: spacing.sm },
  trustBtn: { flex: 1 },
  fpHint: { marginTop: spacing.sm },
  saveWrap: { marginTop: spacing.md },
});
