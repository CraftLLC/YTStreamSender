import React, { useState, useEffect, useRef } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { MessageSlot } from './components/MessageSlot';
import { AppConfig, SavedMessage, MessageState, SendingStatus, LiveStreamDetails, ChatMessage } from './types';
import { STORAGE_KEYS, DEFAULT_MESSAGES } from './constants';
import { extractVideoId, fetchLiveChatId, sendMessageToChat, refreshGoogleToken, exchangeCodeForTokens, fetchChatMessages } from './services/youtubeService';
import { MessageSquare, Zap, Plus, Trash2, Filter, Pin, Search, Undo, X, List, User, Send, Loader2 } from 'lucide-react';

// Declaration for Google Identity Services
declare global {
  interface Window {
    google: any;
  }
}

type FilterType = 'all' | 'pinned';
type TabType = 'saved' | 'chat';

interface DeletedMessageState {
  message: SavedMessage;
  index: number;
}

const App: React.FC = () => {
  // State: Configuration
  const [config, setConfig] = useState<AppConfig>({
    clientId: '',
    clientSecret: '',
    streamUrl: ''
  });

  // State: Auth
  const [accessToken, setAccessToken] = useState<string>('');
  const [refreshToken, setRefreshToken] = useState<string>('');
  
  // State: App View
  const [activeTab, setActiveTab] = useState<TabType>('saved');

  // State: Messages (Saved)
  const [messages, setMessages] = useState<SavedMessage[]>(DEFAULT_MESSAGES);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // State: Quick Message
  const [quickMessage, setQuickMessage] = useState('');
  const [quickMessageStatus, setQuickMessageStatus] = useState<SendingStatus>(SendingStatus.IDLE);

  // State: Live Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatNextPageToken, setChatNextPageToken] = useState<string | undefined>(undefined);
  const [chatPollingInterval, setChatPollingInterval] = useState<number>(3000);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingTimeoutRef = useRef<number | null>(null);

  // State: Undo / Deletion
  const [lastDeleted, setLastDeleted] = useState<DeletedMessageState | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  
  // State: Runtime
  const [liveDetails, setLiveDetails] = useState<LiveStreamDetails | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [messageStates, setMessageStates] = useState<Record<number, MessageState>>({});

  // Helper to persist tokens
  const updateAccessToken = (token: string) => {
    setAccessToken(token);
    if (token) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    }
  };

  const updateRefreshToken = (token: string) => {
    setRefreshToken(token);
    if (token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    }
  };

  // Helper to update messages
  const updateMessages = (newMessages: SavedMessage[]) => {
      setMessages(newMessages);
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(newMessages));
  };

  // Load from local storage on mount
  useEffect(() => {
    const storedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
    const storedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    const storedAccessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (storedConfig) {
      const parsedConfig = JSON.parse(storedConfig);
      setConfig({
        clientId: parsedConfig.clientId || '',
        clientSecret: parsedConfig.clientSecret || '',
        streamUrl: parsedConfig.streamUrl || ''
      });
    }
    if (storedMessages) {
      setMessages(JSON.parse(storedMessages));
    }
    if (storedAccessToken) {
      setAccessToken(storedAccessToken);
    }
    if (storedRefreshToken) {
      setRefreshToken(storedRefreshToken);
    }
  }, []);

  // Poll Chat Messages Effect
  useEffect(() => {
    const pollChat = async () => {
        if (!accessToken || !liveDetails?.liveChatId || activeTab !== 'chat') {
            return;
        }

        try {
            const data = await fetchChatMessages(liveDetails.liveChatId, accessToken, chatNextPageToken);
            
            setChatNextPageToken(data.nextPageToken);
            setChatPollingInterval(Math.max(data.pollingIntervalMillis || 3000, 1000));
            
            if (data.items && data.items.length > 0) {
                 const newMessages = data.items.map((item: any) => ({
                    id: item.id,
                    publishedAt: item.snippet.publishedAt,
                    messageText: item.snippet.displayMessage,
                    author: {
                        displayName: item.authorDetails.displayName,
                        profileImageUrl: item.authorDetails.profileImageUrl,
                        isChatOwner: item.authorDetails.isChatOwner,
                        isChatModerator: item.authorDetails.isChatModerator,
                        isVerified: item.authorDetails.isVerified
                    }
                }));

                setChatMessages(prev => {
                    // Avoid duplicates (though API usually handles this via pageToken)
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter((m: ChatMessage) => !existingIds.has(m.id));
                    if (uniqueNew.length === 0) return prev;
                    return [...prev, ...uniqueNew].slice(-200); // Keep last 200
                });
            }

        } catch (error) {
            console.error("Chat polling error", error);
        } finally {
            // Schedule next poll
            if (activeTab === 'chat' && liveDetails?.liveChatId) {
                pollingTimeoutRef.current = setTimeout(pollChat, chatPollingInterval) as unknown as number;
            }
        }
    };

    if (activeTab === 'chat' && liveDetails?.liveChatId) {
        // Start polling loop
        // If it's the first load (no token), do it immediately, otherwise wait interval
        if (!chatNextPageToken) {
            pollChat();
        } else {
             pollingTimeoutRef.current = setTimeout(pollChat, chatPollingInterval) as unknown as number;
        }
    }

    return () => {
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
        }
    };
  }, [activeTab, liveDetails, accessToken, chatNextPageToken, chatPollingInterval]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);


  // Save config handler
  const handleSaveConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
    
    // Reset connection info if URL changed
    if (newConfig.streamUrl !== config.streamUrl) {
        setLiveDetails(null);
        setChatMessages([]);
        setChatNextPageToken(undefined);
    }
  };

  // Refresh Token Logic
  const handleRefreshAuth = async () => {
    if (!refreshToken || !config.clientId || !config.clientSecret) {
      setConnectionError("Для оновлення потрібні: Client ID, Client Secret та Refresh Token");
      return;
    }

    try {
      const data = await refreshGoogleToken(config.clientId, config.clientSecret, refreshToken);
      updateAccessToken(data.access_token);
      setConnectionError(null);
    } catch (e: any) {
      setConnectionError("Помилка оновлення токена: " + e.message);
    }
  };

  // Google Auth Handler
  const handleAuthorize = () => {
    if (!config.clientId) {
      setConnectionError("Будь ласка, введіть Client ID");
      return;
    }

    if (!window.google) {
      setConnectionError("Google Identity Services ще не завантажено. Перевірте інтернет.");
      return;
    }

    const useCodeFlow = !!config.clientSecret;

    try {
      if (useCodeFlow) {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: config.clientId,
          scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
          ux_mode: 'popup',
          select_account: true,
          callback: async (response: any) => {
            if (response.code) {
              try {
                const data = await exchangeCodeForTokens(config.clientId, config.clientSecret, response.code);
                updateAccessToken(data.access_token);
                if (data.refresh_token) {
                  updateRefreshToken(data.refresh_token);
                }
                setConnectionError(null);
              } catch (e: any) {
                setConnectionError("Помилка обміну коду на токени: " + e.message);
              }
            } else {
              setConnectionError("Користувач скасував авторизацію або виникла помилка.");
            }
          },
        });
        client.requestCode();
      } else {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
          callback: (response: any) => {
            if (response.access_token) {
              updateAccessToken(response.access_token);
              setConnectionError(null);
              if (!config.clientSecret) {
                alert("Увага: Без Client Secret ви отримали лише Access Token, який діє 1 годину.");
              }
            } else {
              setConnectionError("Не вдалося отримати токен доступу.");
            }
          },
        });
        client.requestAccessToken();
      }
    } catch (e: any) {
      setConnectionError("Помилка ініціалізації OAuth: " + e.message);
    }
  };

  // Update text
  const handleUpdateMessageText = (id: number, text: string) => {
    const updatedMessages = messages.map(msg => 
      msg.id === id ? { ...msg, text } : msg
    );
    updateMessages(updatedMessages);
    
    if (messageStates[id]?.status !== SendingStatus.IDLE) {
        setMessageStates(prev => ({
            ...prev,
            [id]: { id, status: SendingStatus.IDLE }
        }));
    }
  };

  // Add Message
  const handleAddMessage = () => {
    const newMessage = { id: Date.now(), text: '', isPinned: false };
    updateMessages([...messages, newMessage]);
  };

  // Delete Single Message with Undo
  const handleDeleteMessage = (id: number) => {
    const index = messages.findIndex(m => m.id === id);
    if (index === -1) return;

    const msg = messages[index];
    if (msg.isPinned || msg.isMain) return; 

    if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
    }

    setLastDeleted({ message: msg, index });
    
    const newMessages = [...messages];
    newMessages.splice(index, 1);
    updateMessages(newMessages);

    undoTimeoutRef.current = setTimeout(() => {
        setLastDeleted(null);
        undoTimeoutRef.current = null;
    }, 5000);
  };

  // Restore deleted message
  const handleUndoDelete = () => {
      if (!lastDeleted) return;

      const newMessages = [...messages];
      const insertIndex = Math.min(lastDeleted.index, newMessages.length);
      newMessages.splice(insertIndex, 0, lastDeleted.message);
      
      updateMessages(newMessages);
      setLastDeleted(null);
      
      if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
          undoTimeoutRef.current = null;
      }
  };

  const handleDismissUndo = () => {
      setLastDeleted(null);
      if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
          undoTimeoutRef.current = null;
      }
  };

  const handleDeleteAll = () => {
      if (window.confirm('Видалити всі незакріплені повідомлення?')) {
          updateMessages(messages.filter(m => m.isPinned || m.isMain));
          setLastDeleted(null);
      }
  };

  const handleTogglePin = (id: number) => {
      const updatedMessages = messages.map(msg => 
          msg.id === id ? { ...msg, isPinned: !msg.isPinned } : msg
      );
      updateMessages(updatedMessages);
  };

  const handleSetMain = (id: number) => {
      const updatedMessages = messages.map(msg => ({
          ...msg,
          isMain: msg.id === id ? !msg.isMain : false
      }));
      updateMessages(updatedMessages);
  };

  const handleMoveMessage = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === messages.length - 1) return;

      const newMessages = [...messages];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      [newMessages[index], newMessages[targetIndex]] = [newMessages[targetIndex], newMessages[index]];
      updateMessages(newMessages);
  };

  // Connect to Live Stream
  const handleConnect = async () => {
    if (!accessToken) {
      setConnectionError("Необхідна авторизація через Google");
      return;
    }

    setConnectionError(null);
    setIsLoadingChat(true);

    try {
        const videoId = extractVideoId(config.streamUrl);
        if (!videoId) {
            throw new Error('Не вдалося розпізнати Video ID з посилання');
        }

        const details = await fetchLiveChatId(videoId, accessToken);
        setLiveDetails({ ...details, videoId });
        setChatMessages([]);
        setChatNextPageToken(undefined);
        
    } catch (err: any) {
        setLiveDetails(null);
        setConnectionError(err.message || 'Помилка підключення');
    } finally {
        setIsLoadingChat(false);
    }
  };

  // Send Message Generic
  const sendToYoutube = async (text: string, onSuccess: () => void, onError: (err: string) => void) => {
      if (!liveDetails?.liveChatId || !accessToken) return;
      try {
          await sendMessageToChat(liveDetails.liveChatId, text, accessToken);
          onSuccess();
      } catch (err: any) {
          onError(err.message);
      }
  };

  // Send Saved Message
  const handleSendMessage = (id: number, text: string) => {
    setMessageStates(prev => ({ ...prev, [id]: { id, status: SendingStatus.SENDING } }));

    sendToYoutube(
        text,
        () => {
            setMessageStates(prev => ({ ...prev, [id]: { id, status: SendingStatus.SUCCESS } }));
            setTimeout(() => {
                setMessageStates(prev => ({ ...prev, [id]: { id, status: SendingStatus.IDLE } }));
            }, 2000);
        },
        (err) => {
             setMessageStates(prev => ({ ...prev, [id]: { id, status: SendingStatus.ERROR, errorMessage: err } }));
        }
    );
  };

  // Send Quick Message
  const handleSendQuickMessage = () => {
      if (!quickMessage.trim()) return;
      setQuickMessageStatus(SendingStatus.SENDING);

      sendToYoutube(
          quickMessage,
          () => {
              setQuickMessageStatus(SendingStatus.SUCCESS);
              setQuickMessage('');
              setTimeout(() => setQuickMessageStatus(SendingStatus.IDLE), 2000);
          },
          (err) => {
              setQuickMessageStatus(SendingStatus.ERROR);
              alert('Помилка надсилання: ' + err); // Simple alert for quick message error
              setTimeout(() => setQuickMessageStatus(SendingStatus.IDLE), 3000);
          }
      )
  };

  const handleSendMainMessage = () => {
      const mainMsg = messages.find(m => m.isMain);
      if (mainMsg) {
          handleSendMessage(mainMsg.id, mainMsg.text);
      }
  };

  // Filter Messages
  const filteredMessages = messages.filter(msg => {
    const matchesFilter = filter === 'all' || msg.isPinned;
    const matchesSearch = msg.text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const hasMainMessage = messages.some(m => m.isMain);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex items-center justify-center relative">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 pb-16">
        
        {/* Header (Mobile only) */}
        <div className="lg:col-span-12 lg:hidden mb-4 text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2 text-blue-500">
                <Zap className="fill-current" />
                YT Stream Sender
            </h1>
        </div>

        {/* Left Column: Settings */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            <SettingsPanel 
                config={config} 
                onSave={handleSaveConfig}
                onAuthorize={handleAuthorize}
                isAuthorized={!!accessToken}
                accessToken={accessToken}
                refreshToken={refreshToken}
                onAccessTokenChange={updateAccessToken}
                onRefreshTokenChange={updateRefreshToken}
                onRefreshAuth={handleRefreshAuth}
                isConnected={!!liveDetails?.liveChatId}
                streamTitle={liveDetails?.title || null}
                connectionError={connectionError}
                onConnect={handleConnect}
                isLoadingChat={isLoadingChat}
                hasMainMessage={hasMainMessage}
                onSendMainMessage={handleSendMainMessage}
            />

            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 text-sm text-slate-400">
                <h3 className="font-semibold text-slate-300 mb-2">Підказки:</h3>
                <ul className="list-disc list-inside space-y-1.5 text-xs">
                    <li>Використовуйте <strong className="text-purple-400">🏠</strong> щоб зробити повідомлення головним.</li>
                    <li>Вкладка <strong>Чат</strong> дозволяє бачити повідомлення глядачів у реальному часі.</li>
                    <li>Нижня панель дозволяє швидко відправити будь-який текст без збереження.</li>
                </ul>
            </div>
        </div>

        {/* Right Column: Messages & Chat */}
        <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 h-[600px] flex flex-col relative overflow-hidden">
                
                {/* Tabs Header */}
                <div className="flex border-b border-slate-700">
                    <button
                        onClick={() => setActiveTab('saved')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'saved' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700/50 text-slate-400'}`}
                    >
                        <List className="w-4 h-4" />
                        Збережені
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'chat' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700/50 text-slate-400'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        Чат
                        {liveDetails?.liveChatId && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-hidden relative">
                    
                    {/* --- TAB: SAVED MESSAGES --- */}
                    {activeTab === 'saved' && (
                        <div className="absolute inset-0 flex flex-col p-4 pb-20"> {/* pb-20 for quick bar space */}
                             <div className="flex justify-between items-center mb-4 gap-2">
                                <div className="relative group flex-grow">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Пошук..." 
                                        className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full transition-all"
                                    />
                                </div>
                                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 shrink-0">
                                    <button onClick={() => setFilter('all')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${filter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}><Filter className="w-3 h-3" /></button>
                                    <button onClick={() => setFilter('pinned')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${filter === 'pinned' ? 'bg-amber-900/40 text-amber-200' : 'text-slate-500 hover:text-slate-300'}`}><Pin className="w-3 h-3" /></button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                {filteredMessages.map((msg, index) => (
                                    <MessageSlot
                                        key={msg.id}
                                        index={index}
                                        total={filteredMessages.length}
                                        message={msg}
                                        state={messageStates[msg.id] || { id: msg.id, status: SendingStatus.IDLE }}
                                        onUpdate={handleUpdateMessageText}
                                        onSend={handleSendMessage}
                                        onDelete={handleDeleteMessage}
                                        onPin={handleTogglePin}
                                        onSetMain={handleSetMain}
                                        onMove={handleMoveMessage}
                                        disabled={!liveDetails?.liveChatId || !accessToken}
                                    />
                                ))}
                                {filteredMessages.length === 0 && (
                                    <div className="text-center py-8 text-slate-600 border-2 border-dashed border-slate-700/50 rounded-lg">
                                        <p className="text-sm">Список порожній</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-700 shrink-0 gap-3">
                                <button onClick={handleAddMessage} className="flex-grow py-2 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 text-sm font-medium">
                                    <Plus className="w-4 h-4" /> Додати
                                </button>
                                {messages.some(m => !m.isPinned && !m.isMain) && messages.length > 0 && (
                                    <button onClick={handleDeleteAll} className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-700 text-slate-500 hover:text-red-400 hover:bg-red-900/10 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- TAB: LIVE CHAT --- */}
                    {activeTab === 'chat' && (
                        <div className="absolute inset-0 flex flex-col bg-slate-900/50 pb-20">
                            {!liveDetails?.liveChatId ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6 text-center">
                                    <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                                    <p>Підключіться до трансляції, щоб бачити чат.</p>
                                </div>
                            ) : chatMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-500/50" />
                                    <p className="text-sm">Завантаження повідомлень...</p>
                                </div>
                            ) : (
                                <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {chatMessages.map((msg) => (
                                        <div key={msg.id} className="flex gap-3 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300">
                                            <div className="shrink-0">
                                                {msg.author.profileImageUrl ? (
                                                    <img src={msg.author.profileImageUrl} alt={msg.author.displayName} className="w-8 h-8 rounded-full bg-slate-700" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center"><User className="w-4 h-4" /></div>
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-medium truncate ${msg.author.isChatOwner ? 'text-yellow-400' : msg.author.isChatModerator ? 'text-blue-400' : 'text-slate-300'}`}>
                                                        {msg.author.displayName}
                                                    </span>
                                                    <span className="text-[10px] text-slate-600">{new Date(msg.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</span>
                                                </div>
                                                <p className="text-slate-100 break-words leading-relaxed">{msg.messageText}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- GLOBAL: QUICK SEND BAR (Persistent Footer) --- */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-slate-800 border-t border-slate-700 z-10">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={quickMessage}
                                onChange={(e) => setQuickMessage(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendQuickMessage()}
                                placeholder="Швидке повідомлення..."
                                className="flex-grow bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-600"
                                disabled={!liveDetails?.liveChatId || quickMessageStatus === SendingStatus.SENDING}
                            />
                            <button
                                onClick={handleSendQuickMessage}
                                disabled={!liveDetails?.liveChatId || !quickMessage.trim() || quickMessageStatus === SendingStatus.SENDING}
                                className={`flex items-center justify-center w-10 rounded-lg transition-colors ${
                                    quickMessageStatus === SendingStatus.SUCCESS ? 'bg-green-600 text-white' :
                                    quickMessageStatus === SendingStatus.ERROR ? 'bg-red-600 text-white' :
                                    'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-700 disabled:text-slate-500'
                                }`}
                            >
                                {quickMessageStatus === SendingStatus.SENDING ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                        {!liveDetails?.liveChatId && (
                            <p className="text-[10px] text-center text-slate-500 mt-1">Підключіться до трансляції для відправки</p>
                        )}
                    </div>

                </div>
            </div>
        </div>

        {/* Undo Toast Notification */}
        {lastDeleted && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-slate-200 px-4 py-3 rounded-lg shadow-xl shadow-black/50 flex items-center gap-4 animate-in slide-in-from-bottom-2 z-50">
                <span className="text-sm">Повідомлення видалено</span>
                <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
                    <button 
                        onClick={handleUndoDelete}
                        className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                    >
                        <Undo className="w-4 h-4" />
                        Відновити
                    </button>
                    <button 
                        onClick={handleDismissUndo}
                        className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-slate-300 transition-colors ml-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;