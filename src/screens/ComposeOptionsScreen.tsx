import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Mono } from '../components';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ComposeOptions'>;

export function ComposeOptionsScreen({ navigation }: Props) {
  return (
    <Screen title="OPTIONS" onBack={() => navigation.goBack()}>
      <Mono>Options placeholder</Mono>
    </Screen>
  );
}
