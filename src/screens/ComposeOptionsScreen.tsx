import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, letterSpacing, spacing } from '../theme/tokens';
import { Screen, Mono, Card, Button } from '../components';
import { RootStackParamList } from '../navigation/types';
import { buildQuote } from '../qwk/quote';

type Props = NativeStackScreenProps<RootStackParamList, 'ComposeOptions'>;

export function ComposeOptionsScreen({ navigation, route }: Props) {
  const {
    toHandle, subject, conferenceNumber, areaName, privateArea,
    reference, inReplyTo, parentBody, parentAuthor, mode,
  } = route.params;

  const [priv, setPriv] = useState(privateArea); // forced on in the private area
  const [quote, setQuote] = useState(false);
  const canQuote = mode === 'reply' && !!parentBody;

  const start = () => {
    const initialBody = quote && parentBody ? buildQuote(parentBody, parentAuthor ?? toHandle) + '\n\n' : '';
    navigation.replace('Compose', {
      mode,
      toHandle,
      subject,
      conferenceNumber,
      areaName,
      priv: privateArea || priv,
      reference,
      inReplyTo,
      initialBody,
    });
  };

  return (
    <Screen title="OPTIONS" onBack={() => navigation.goBack()}>
      <Card style={styles.card}>
        {!privateArea && (
          <View style={styles.row}>
            <Mono size={fontSize.body} color={colors.textPrimary}>Private message?</Mono>
            <Switch value={priv} onValueChange={setPriv} />
          </View>
        )}
        {privateArea && (
          <Mono size={fontSize.listMeta} color={colors.magenta} spacing={letterSpacing.label}>
            PRIVATE MAIL — always private
          </Mono>
        )}
        {canQuote && (
          <View style={styles.row}>
            <Mono size={fontSize.body} color={colors.textPrimary}>Quote message?</Mono>
            <Switch value={quote} onValueChange={setQuote} />
          </View>
        )}
      </Card>
      <Button title="▸ START" onPress={start} style={styles.start} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, backgroundColor: colors.surfaceConsole },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  start: { marginTop: spacing.lg },
});
