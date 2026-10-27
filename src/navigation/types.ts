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
    mode: 'reply' | 'new';
    /** When set, edit this existing outbox draft (fields loaded from the store). */
    editDraftId?: string;
    /** Reply/new target (ignored when editDraftId is set). */
    toHandle?: string;
    subject?: string;
    conferenceNumber?: number;
    areaName?: string;
    priv?: boolean;
    /** Parent message number, when composing a threaded reply. */
    reference?: number;
    /** Parent Message-ID, for durable In-Reply-To threading. */
    inReplyTo?: string;
    /** Seed text for the body (e.g. a quoted block). */
    initialBody?: string;
  };
  ComposeOptions: {
    /** Where this compose will post; forwarded to Compose on Start. */
    toHandle: string;
    subject: string;
    conferenceNumber: number;
    areaName: string;
    /** True when composing in the private-mail area (forces private, hides toggle). */
    privateArea: boolean;
    /** Reply threading + quote source (absent for New Message). */
    reference?: number;
    inReplyTo?: string;
    parentBody?: string;
    parentAuthor?: string;
    mode: 'reply' | 'new';
  };
  AreaPicker: undefined;
  Settings: undefined;
  Boards: undefined;
  BoardForm: { boardId?: string };
  /** Paired devices of the active board (list / unpair). */
  Devices: undefined;
  Storage: undefined;
};
