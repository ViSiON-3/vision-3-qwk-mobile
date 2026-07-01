import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList } from './types';
import { TabBar } from './TabBar';
import { colors } from '../theme/tokens';
import { useStore } from '../store/useStore';

import { ConnectScreen } from '../screens/ConnectScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { PrivateMailScreen } from '../screens/PrivateMailScreen';
import { ConferencesScreen } from '../screens/ConferencesScreen';
import { AreasScreen } from '../screens/AreasScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { ComposeScreen } from '../screens/ComposeScreen';
import { OutboxScreen } from '../screens/OutboxScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BoardsScreen } from '../screens/BoardsScreen';
import { BoardFormScreen } from '../screens/BoardFormScreen';
import { StorageScreen } from '../screens/StorageScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Sync" component={SyncScreen} />
      <Tab.Screen name="Mail" component={PrivateMailScreen} />
      <Tab.Screen name="Conf" component={ConferencesScreen} />
      <Tab.Screen name="Outbox" component={OutboxScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const loggedIn = useStore((s) => s.loggedIn);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.appBg } }}>
      {loggedIn ? (
        <Stack.Group>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Areas" component={AreasScreen} />
          <Stack.Screen name="Messages" component={MessagesScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="Compose" component={ComposeScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Boards" component={BoardsScreen} />
          <Stack.Screen name="BoardForm" component={BoardFormScreen} />
          <Stack.Screen name="Storage" component={StorageScreen} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Connect" component={ConnectScreen} />
          <Stack.Screen name="Boards" component={BoardsScreen} />
          <Stack.Screen name="BoardForm" component={BoardFormScreen} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
