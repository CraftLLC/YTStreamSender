import React, { useState, useEffect } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { MessageSlot } from './components/MessageSlot';
import { AppConfig, SavedMessage, MessageState, SendingStatus, LiveStreamDetails } from './types';
import { STORAGE_KEYS, DEFAULT_MESSAGES } from './constants';
import { extractVideoId, fetchLiveChatId, sendMessageToChat, refreshGoogleToken } from './services/youtubeService';
import { MessageSquare, Zap, Plus, Trash2 } from 'lucide-react';

// Declaration for Google Identity Services
declare global {
  interface Window {
    google: any;
  }
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
      // alert("Токен успішно оновлено!"); 
    } catch (e: any) {
      setConnectionError("Помилка оновлення токена: " + e.message);
    }
  };

  // Google Auth Handler (Implicit Flow)
  const handleAuthorize = () => {
    if (!config.clientId) {
      setConnectionError("Будь ласка, введіть Client ID");
      return;
    }

    if (!window.google) {
      setConnectionError("Google Identity Services ще не завантажено. Перевірте інтернет.");
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
        callback: (response: any) => {
          if (response.access_token) {
            updateAccessToken(response.access_token);
            setConnectionError(null);
          } else {
            setConnectionError("Не вдалося отримати токен доступу.");
          }
        },
      });
      client.requestAccessToken();
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

  // Delete Single Message
  const handleDeleteMessage = (id: number) => {
    const msg = messages.find(m => m.id === id);
    if (msg?.isPinned) return; 
    updateMessages(messages.filter(m => m.id !== id));
  };

  // Delete All (Except Pinned)
  const handleDeleteAll = () => {
      if (window.confirm('Видалити всі незакріплені повідомлення?')) {
          updateMessages(messages.filter(m => m.isPinned));
      }
  };

  // Toggle Pin
  const handleTogglePin = (id: number) => {
      const updatedMessages = messages.map(msg => 
          msg.id === id ? { ...msg, isPinned: !msg.isPinned } : msg
      );
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
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
            />

            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 text-sm text-slate-400">
                <h3 className="font-semibold text-slate-300 mb-2">Підказки:</h3>
                <ul className="list-disc list-inside space-y-1.5 text-xs">
                    <li>Використовуйте <strong className="text-slate-300">↑ ↓</strong> для зміни порядку.</li>
                    <li>Натисніть <strong className="text-amber-400">📌</strong> щоб закріпити повідомлення.</li>
                    <li>Кнопка "Очистити" видаляє лише незакріплене.</li>
                    <li>
                        Для авто-оновлення токена введіть <strong>Client Secret</strong> та <strong>Refresh Token</strong> (з OAuth Playground).
                    </li>
                </ul>
            </div>
        </div>

        {/* Right Column: Messages */}
        <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700 shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <MessageSquare className="w-5 h-5 text-green-400" />
                        Збережені повідомлення
                    </h2>
                    <div className="flex items-center gap-3">
                         <span className="text-xs font-mono px-2 py-1 rounded bg-slate-900 text-slate-500">
                            Count: {messages.length}
                        </span>
                        {messages.some(m => !m.isPinned) && messages.length > 0 && (
                            <button 
                                onClick={handleDeleteAll}
                                className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-400 transition-colors"
                            >
                                <Trash2 className="w-3 h-3" />
                                Очистити
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                    {messages.map((msg, index) => (
                        <MessageSlot
                            key={msg.id}
                            index={index}
                            total={messages.length}
                            message={msg}
                            state={messageStates[msg.id] || { id: msg.id, status: SendingStatus.IDLE }}
                            onUpdate={handleUpdateMessageText}
                            onSend={handleSendMessage}
                            onDelete={handleDeleteMessage}
                            onPin={handleTogglePin}
                            onMove={handleMoveMessage}
                            disabled={!liveDetails?.liveChatId || !accessToken}
                        />
                    ))}
                    
                    {messages.length === 0 && (
                        <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-700/50 rounded-lg">
                            <p>Список порожній.</p>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700 shrink-0">
                    <button
                        onClick={handleAddMessage}
                        className="w-full py-3 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Додати повідомлення
                    </button>
                </div>

                {!liveDetails?.liveChatId && (
                    <div className="mt-4 text-center p-3 border border-yellow-900/30 bg-yellow-900/10 rounded-lg text-yellow-500/70 text-sm">
                        ⚠️ Підключіться до трансляції, щоб активувати відправку.
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;