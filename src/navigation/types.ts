import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Sync: undefined;
  Mail: undefined;
  Conf: undefined;
  Outbox: undefined;
};

export type RootStackParamList = {
  Connect: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Areas: { conferenceId: string };
  Messages: { areaId: string };
  Reader: { areaId: string; messageId: string };
  Compose: {
    toHandle: string;
    subject: string;
    conferenceNumber: number;
    areaName: string;
    priv?: boolean;
  };
  Settings: undefined;
  Boards: undefined;
  BoardForm: { boardId?: string };
  Storage: undefined;
};
