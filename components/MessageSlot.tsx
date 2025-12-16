import React from 'react';
import { Send, CheckCircle2, AlertTriangle, Loader2, Trash2, ArrowUp, ArrowDown, Pin, PinOff, Home } from 'lucide-react';
import { MessageState, SavedMessage, SendingStatus } from '../types';

interface MessageSlotProps {
  message: SavedMessage;
  index: number;
  total: number;
  state: MessageState;
  onUpdate: (id: number, text: string) => void;
  onSend: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onSetMain: (id: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  disabled: boolean;
}

export const MessageSlot: React.FC<MessageSlotProps> = ({ 
  message, 
  index,
  total,
  state, 
  onUpdate, 
  onSend,
  onDelete,
  onPin,
  onSetMain,
  onMove,
  disabled
}) => {
  const isSending = state.status === SendingStatus.SENDING;
  const isSuccess = state.status === SendingStatus.SUCCESS;
  const isError = state.status === SendingStatus.ERROR;
  const isPinned = message.isPinned;
  const isMain = message.isMain;

  // Determine container styling based on state
  let containerClass = "hover:bg-slate-800/50";
  let borderClass = "border-transparent";
  
  if (isMain) {
      containerClass = "bg-purple-900/10";
      borderClass = "border-purple-500/30";
  } else if (isPinned) {
      containerClass = "bg-amber-900/10";
      borderClass = "border-amber-900/30";
  }

  return (
    <div className={`flex gap-2 items-center mb-2 p-2 rounded-lg transition-colors border ${containerClass} ${borderClass}`}>
        {/* Controls Column */}
        <div className="flex flex-col gap-1 items-center justify-center">
            <button 
                onClick={() => onMove(index, 'up')}
                disabled={index === 0}
                className="text-slate-600 hover:text-blue-400 disabled:opacity-20 disabled:hover:text-slate-600 transition-colors"
                title="Вгору"
            >
                <ArrowUp className="w-3 h-3" />
            </button>
             <span className="text-xs font-mono text-slate-500 select-none w-4 text-center">{index + 1}</span>
            <button 
                onClick={() => onMove(index, 'down')}
                disabled={index === total - 1}
                className="text-slate-600 hover:text-blue-400 disabled:opacity-20 disabled:hover:text-slate-600 transition-colors"
                title="Вниз"
            >
                <ArrowDown className="w-3 h-3" />
            </button>
        </div>

        {/* Input Field */}
        <div className="relative flex-grow">
            <input
                type="text"
                value={message.text}
                onChange={(e) => onUpdate(message.id, e.target.value)}
                placeholder={`Повідомлення...`}
                className={`w-full bg-slate-800 border rounded-lg py-2 px-3 text-sm text-white focus:outline-none transition-all ${
                    isError ? 'border-red-500 focus:ring-2 focus:ring-red-500/50' : 
                    isSuccess ? 'border-green-500 focus:ring-2 focus:ring-green-500/50' :
                    isMain ? 'border-purple-500/50 focus:ring-2 focus:ring-purple-500/50' :
                    isPinned ? 'border-amber-700/50 focus:ring-2 focus:ring-amber-500/50' :
                    'border-slate-700 focus:ring-2 focus:ring-blue-500'
                }`}
            />
             <div className="absolute right-2 top-2.5 flex gap-1 pointer-events-none opacity-50">
                {isMain && <Home className="w-3 h-3 text-purple-500" />}
                {isPinned && <Pin className="w-3 h-3 text-amber-500" />}
             </div>
        </div>
        
        {/* Send Button */}
        <button
            onClick={() => onSend(message.id, message.text)}
            disabled={disabled || !message.text.trim() || isSending}
            className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all shadow-sm flex-shrink-0 ${
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

        {/* Action Buttons Group */}
        <div className="flex flex-col gap-1">
             <div className="flex gap-1">
                <button
                    onClick={() => onSetMain(message.id)}
                    className={`flex items-center justify-center w-8 h-4.5 rounded text-xs transition-colors ${
                        isMain
                        ? 'text-purple-400 bg-purple-900/30 hover:bg-purple-900/50' 
                        : 'text-slate-500 hover:text-purple-400 hover:bg-slate-700'
                    }`}
                    title={isMain ? "Прибрати головне" : "Зробити головним"}
                >
                    <Home className="w-3 h-3" />
                </button>
             </div>
             
             <div className="flex gap-1">
                <button
                    onClick={() => onPin(message.id)}
                    className={`flex items-center justify-center w-8 h-4.5 rounded text-xs transition-colors ${
                        isPinned 
                        ? 'text-amber-400 bg-amber-900/30 hover:bg-amber-900/50' 
                        : 'text-slate-500 hover:text-amber-400 hover:bg-slate-700'
                    }`}
                    title={isPinned ? "Відкріпити" : "Закріпити"}
                >
                    {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                </button>
             </div>
             
             <div className="flex gap-1">
                <button
                    onClick={() => onDelete(message.id)}
                    disabled={isPinned || isMain}
                    className={`flex items-center justify-center w-8 h-4.5 rounded text-xs transition-colors ${
                        isPinned || isMain
                        ? 'text-slate-700 cursor-not-allowed' 
                        : 'text-slate-500 hover:text-red-400 hover:bg-red-900/20'
                    }`}
                    title={(isPinned || isMain) ? "Неможливо видалити закріплене/головне" : "Видалити"}
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    </div>
  );
};