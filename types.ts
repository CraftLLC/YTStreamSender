export interface AppConfig {
  clientId: string;
  clientSecret: string;
  streamUrl: string;
}

export interface SavedMessage {
  id: number;
  text: string;
  isPinned?: boolean;
  isMain?: boolean;
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

export interface ChatAuthor {
  displayName: string;
  profileImageUrl: string;
  isChatOwner: boolean;
  isChatModerator: boolean;
  isVerified: boolean;
}

export interface ChatMessage {
  id: string;
  publishedAt: string;
  messageText: string;
  author: ChatAuthor;
}