import React from 'react';
import { Send, CheckCircle2, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { MessageState, SavedMessage, SendingStatus } from '../types';

interface MessageSlotProps {
  message: SavedMessage;
  state: MessageState;
  onUpdate: (id: number, text: string) => void;
  onSend: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  disabled: boolean;
}

export const MessageSlot: React.FC<MessageSlotProps> = ({ 
  message, 
  state, 
  onUpdate, 
  onSend,
  onDelete,
  disabled
}) => {
  const isSending = state.status === SendingStatus.SENDING;
  const isSuccess = state.status === SendingStatus.SUCCESS;
  const isError = state.status === SendingStatus.ERROR;

  return (
    <div className="flex gap-2 items-center mb-3 group">
        <div className="relative flex-grow">
            <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-500 select-none">#{message.id}</span>
            <input
                type="text"
                value={message.text}
                onChange={(e) => onUpdate(message.id, e.target.value)}
                placeholder={`Повідомлення...`}
                className={`w-full bg-slate-800 border rounded-lg py-2 pl-10 pr-3 text-sm text-white focus:outline-none transition-all ${
                    isError ? 'border-red-500 focus:ring-2 focus:ring-red-500/50' : 
                    isSuccess ? 'border-green-500 focus:ring-2 focus:ring-green-500/50' :
                    'border-slate-700 focus:ring-2 focus:ring-blue-500'
                }`}
            />
        </div>
        
        <button
            onClick={() => onSend(message.id, message.text)}
            disabled={disabled || !message.text.trim() || isSending}
            className={`flex items-center justify-center w-12 h-10 rounded-lg transition-all shadow-sm ${
                isSuccess 
                  ? 'bg-green-600 text-white' 
                  : isError
                  ? 'bg-red-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed'
            }`}
            title={isError ? state.errorMessage : "Надіслати"}
        >
            {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : isSuccess ? (
                <CheckCircle2 className="w-5 h-5" />
            ) : isError ? (
                <AlertTriangle className="w-5 h-5" />
            ) : (
                <Send className="w-4 h-4" />
            )}
        </button>

        <button
            onClick={() => onDelete(message.id)}
            className="flex items-center justify-center w-8 h-10 rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Видалити"
            tabIndex={-1}
        >
            <Trash2 className="w-4 h-4" />
        </button>
    </div>
  );
};