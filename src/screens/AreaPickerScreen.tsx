import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Mono } from '../components';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaPicker'>;

export function AreaPickerScreen({ navigation }: Props) {
  return (
    <Screen title="NEW MESSAGE" onBack={() => navigation.goBack()}>
      <Mono>Area picker placeholder</Mono>
    </Screen>
  );
}
