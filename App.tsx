import React, { useState, useEffect, useRef } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { MessageSlot } from './components/MessageSlot';
import { AppConfig, SavedMessage, MessageState, SendingStatus, LiveStreamDetails } from './types';
import { STORAGE_KEYS, DEFAULT_MESSAGES } from './constants';
import { extractVideoId, fetchLiveChatId, sendMessageToChat, refreshGoogleToken, exchangeCodeForTokens } from './services/youtubeService';
import { MessageSquare, Zap, Plus, Trash2, Filter, Pin, Search, Undo, X } from 'lucide-react';

// Declaration for Google Identity Services
declare global {
  interface Window {
    google: any;
  }
}

type FilterType = 'all' | 'pinned';

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
  
  // State: Messages
  const [messages, setMessages] = useState<SavedMessage[]>(DEFAULT_MESSAGES);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
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

  // Save config handler
  const handleSaveConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
    
    // Reset connection info if URL changed
    if (newConfig.streamUrl !== config.streamUrl) {
        setLiveDetails(null);
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

    // Determine strategy: 
    // If Client Secret is present, use 'initCodeClient' (Authorization Code Flow) to get Refresh Token.
    // If NOT present, use 'initTokenClient' (Implicit Flow) for just Access Token.
    const useCodeFlow = !!config.clientSecret;

    try {
      if (useCodeFlow) {
        // --- Code Flow (Access + Refresh Token) ---
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: config.clientId,
          scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
          ux_mode: 'popup',
          select_account: true, // Forces account selection to ensure consent prompt for offline access
          callback: async (response: any) => {
            if (response.code) {
              try {
                // Exchange code for tokens
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
        // --- Implicit Flow (Access Token Only) ---
        // Fallback if user didn't provide Client Secret
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
          callback: (response: any) => {
            if (response.access_token) {
              updateAccessToken(response.access_token);
              setConnectionError(null);
              if (!config.clientSecret) {
                alert("Увага: Без Client Secret ви отримали лише Access Token, який діє 1 годину. Для отримання Refresh Token заповніть поле Client Secret.");
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

    // Clear previous timeout if exists
    if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
    }

    // Save for undo
    setLastDeleted({ message: msg, index });
    
    // Remove
    const newMessages = [...messages];
    newMessages.splice(index, 1);
    updateMessages(newMessages);

    // Set timeout to clear undo availability after 5 seconds
    undoTimeoutRef.current = setTimeout(() => {
        setLastDeleted(null);
        undoTimeoutRef.current = null;
    }, 5000);
  };

  // Restore deleted message
  const handleUndoDelete = () => {
      if (!lastDeleted) return;

      const newMessages = [...messages];
      // Insert back at original position or end if out of bounds
      const insertIndex = Math.min(lastDeleted.index, newMessages.length);
      newMessages.splice(insertIndex, 0, lastDeleted.message);
      
      updateMessages(newMessages);
      setLastDeleted(null);
      
      if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
          undoTimeoutRef.current = null;
      }
  };

  // Clear undo toast manually
  const handleDismissUndo = () => {
      setLastDeleted(null);
      if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
          undoTimeoutRef.current = null;
      }
  };

  // Delete All (Except Pinned and Main)
  const handleDeleteAll = () => {
      if (window.confirm('Видалити всі незакріплені повідомлення?')) {
          // Note: Bulk delete doesn't support undo for now to keep logic simple
          updateMessages(messages.filter(m => m.isPinned || m.isMain));
          setLastDeleted(null); // Clear any pending single undo
      }
  };

  // Toggle Pin
  const handleTogglePin = (id: number) => {
      const updatedMessages = messages.map(msg => 
          msg.id === id ? { ...msg, isPinned: !msg.isPinned } : msg
      );
      updateMessages(updatedMessages);
  };

  // Set Main Message (Mutual Exclusive)
  const handleSetMain = (id: number) => {
      const updatedMessages = messages.map(msg => ({
          ...msg,
          isMain: msg.id === id ? !msg.isMain : false // Toggle current, uncheck others
      }));
      updateMessages(updatedMessages);
  };

  // Move Message
  const handleMoveMessage = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === messages.length - 1) return;

      const newMessages = [...messages];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      // Swap
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
        
    } catch (err: any) {
        setLiveDetails(null);
        setConnectionError(err.message || 'Помилка підключення');
    } finally {
        setIsLoadingChat(false);
    }
  };

  // Send Message
  const handleSendMessage = async (id: number, text: string) => {
    if (!liveDetails?.liveChatId || !accessToken) return;

    setMessageStates(prev => ({
        ...prev,
        [id]: { id, status: SendingStatus.SENDING }
    }));

    try {
        await sendMessageToChat(liveDetails.liveChatId, text, accessToken);
        
        setMessageStates(prev => ({
            ...prev,
            [id]: { id, status: SendingStatus.SUCCESS }
        }));

        setTimeout(() => {
            setMessageStates(prev => ({
                ...prev,
                [id]: { id, status: SendingStatus.IDLE }
            }));
        }, 2000);

    } catch (err: any) {
        setMessageStates(prev => ({
            ...prev,
            [id]: { id, status: SendingStatus.ERROR, errorMessage: err.message }
        }));
    }
  };

  // Send Main Message
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
                    <li>Використовуйте <strong className="text-purple-400">🏠</strong> щоб зробити повідомлення головним (Main).</li>
                    <li>Кнопка <span className="inline-block w-4 h-4 bg-purple-600 rounded-sm align-middle mx-1"></span> в панелі налаштувань миттєво відправляє головне повідомлення.</li>
                    <li>Використовуйте <strong className="text-slate-300">↑ ↓</strong> для зміни порядку.</li>
                    <li>Натисніть <strong className="text-amber-400">📌</strong> щоб закріпити повідомлення.</li>
                </ul>
            </div>
        </div>

        {/* Right Column: Messages */}
        <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 h-full flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-4 border-b border-slate-700 shrink-0 gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <MessageSquare className="w-5 h-5 text-green-400" />
                        Повідомлення
                    </h2>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative group flex-grow sm:flex-grow-0">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input 
                                type="text" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Пошук..." 
                                className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full sm:w-32 focus:w-full sm:focus:w-48 transition-all"
                            />
                        </div>

                        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 shrink-0">
                             <button
                                onClick={() => setFilter('all')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${filter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                <Filter className="w-3 h-3" /> <span className="hidden sm:inline">Всі</span>
                             </button>
                             <button
                                onClick={() => setFilter('pinned')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${filter === 'pinned' ? 'bg-amber-900/40 text-amber-200' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                <Pin className="w-3 h-3" /> <span className="hidden sm:inline">Закріплені</span>
                             </button>
                        </div>
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
                        <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-700/50 rounded-lg">
                            <p>
                                {searchQuery 
                                    ? 'Нічого не знайдено за запитом' 
                                    : filter === 'pinned' 
                                        ? 'Немає закріплених повідомлень' 
                                        : 'Список порожній'
                                }
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-700 shrink-0 gap-4">
                     <button
                        onClick={handleAddMessage}
                        className="flex-grow py-3 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Додати повідомлення
                    </button>
                    
                     {messages.some(m => !m.isPinned && !m.isMain) && messages.length > 0 && (
                        <button 
                            onClick={handleDeleteAll}
                            className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-700 text-slate-500 hover:text-red-400 hover:bg-red-900/10 transition-colors"
                            title="Очистити список (крім закріплених)"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {!liveDetails?.liveChatId && (
                    <div className="mt-4 text-center p-3 border border-yellow-900/30 bg-yellow-900/10 rounded-lg text-yellow-500/70 text-sm">
                        ⚠️ Підключіться до трансляції, щоб активувати відправку.
                    </div>
                )}
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