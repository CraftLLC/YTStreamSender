export interface AppConfig {
  clientId: string;
  streamUrl: string;
}

export interface SavedMessage {
  id: number;
  text: string;
  isPinned?: boolean;
}

export interface LiveStreamDetails {
  videoId: string;
  liveChatId: string | null;
  title: string | null;
}

export enum SendingStatus {
  IDLE = 'IDLE',
  SENDING = 'SENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface MessageState {
  id: number;
  status: SendingStatus;
  errorMessage?: string;
}