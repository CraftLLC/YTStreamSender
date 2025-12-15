import React, { useState, useEffect } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { MessageSlot } from './components/MessageSlot';
import { AppConfig, SavedMessage, MessageState, SendingStatus, LiveStreamDetails } from './types';
import { STORAGE_KEYS, DEFAULT_MESSAGES } from './constants';
import { extractVideoId, fetchLiveChatId, sendMessageToChat } from './services/youtubeService';
import { MessageSquare, Zap } from 'lucide-react';

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
    streamUrl: ''
  });

  // State: Auth
  const [accessToken, setAccessToken] = useState<string>('');
  
  // State: Messages
  const [messages, setMessages] = useState<SavedMessage[]>(DEFAULT_MESSAGES);
  
  // State: Runtime
  const [liveDetails, setLiveDetails] = useState<LiveStreamDetails | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [messageStates, setMessageStates] = useState<Record<number, MessageState>>({});

  // Helper to persist token
  const updateAccessToken = (token: string) => {
    setAccessToken(token);
    if (token) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    }
  };

  // Load from local storage on mount
  useEffect(() => {
    const storedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
    const storedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    if (storedConfig) {
      const parsedConfig = JSON.parse(storedConfig);
      // Ensure we clean up old format if present (remove secret/token from persisted config)
      setConfig({
        clientId: parsedConfig.clientId || '',
        streamUrl: parsedConfig.streamUrl || ''
      });
    }
    if (storedMessages) {
      setMessages(JSON.parse(storedMessages));
    }
    if (storedToken) {
      setAccessToken(storedToken);
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

  // Update message handler
  const handleUpdateMessage = (id: number, text: string) => {
    const updatedMessages = messages.map(msg => 
      msg.id === id ? { ...msg, text } : msg
    );
    setMessages(updatedMessages);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updatedMessages));
    
    // Reset status when user types
    if (messageStates[id]?.status !== SendingStatus.IDLE) {
        setMessageStates(prev => ({
            ...prev,
            [id]: { id, status: SendingStatus.IDLE }
        }));
    }
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
            throw new Error('Невірний формат посилання на YouTube');
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

    // Set Sending State
    setMessageStates(prev => ({
        ...prev,
        [id]: { id, status: SendingStatus.SENDING }
    }));

    try {
        await sendMessageToChat(liveDetails.liveChatId, text, accessToken);
        
        // Set Success State
        setMessageStates(prev => ({
            ...prev,
            [id]: { id, status: SendingStatus.SUCCESS }
        }));

        // Reset to IDLE after 2 seconds
        setTimeout(() => {
            setMessageStates(prev => ({
                ...prev,
                [id]: { id, status: SendingStatus.IDLE }
            }));
        }, 2000);

    } catch (err: any) {
        // Set Error State
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
                onAccessTokenChange={updateAccessToken}
                isConnected={!!liveDetails?.liveChatId}
                streamTitle={liveDetails?.title || null}
                connectionError={connectionError}
                onConnect={handleConnect}
                isLoadingChat={isLoadingChat}
            />

            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 text-sm text-slate-400">
                <h3 className="font-semibold text-slate-300 mb-2">Інструкція:</h3>
                <ol className="list-decimal list-inside space-y-2">
                    <li>Введіть та збережіть <strong>Client ID</strong>.</li>
                    <li>Натисніть <strong>"Увійти через Google"</strong> (токен збережеться).</li>
                    <li>Якщо виникає помилка (400 invalid_request), розгорніть "Ввести токен вручну" і скористайтеся <a href="https://developers.google.com/oauthplayground/" target="_blank" className="text-blue-400 hover:underline">Playground</a>.</li>
                    <li>Вставте посилання на пряму трансляцію.</li>
                    <li>Натисніть <strong>"Знайти чат"</strong>.</li>
                    <li>Пишіть повідомлення та надсилайте їх в один клік.</li>
                </ol>
            </div>
        </div>

        {/* Right Column: Messages */}
        <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 h-full">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <MessageSquare className="w-5 h-5 text-green-400" />
                        Збережені повідомлення
                    </h2>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-slate-900 text-slate-500">
                        Storage: Local
                    </span>
                </div>

                <div className="space-y-1">
                    {messages.map((msg) => (
                        <MessageSlot
                            key={msg.id}
                            message={msg}
                            state={messageStates[msg.id] || { id: msg.id, status: SendingStatus.IDLE }}
                            onUpdate={handleUpdateMessage}
                            onSend={handleSendMessage}
                            disabled={!liveDetails?.liveChatId || !accessToken}
                        />
                    ))}
                </div>

                {!liveDetails?.liveChatId && (
                    <div className="mt-8 text-center p-8 border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
                        <p>Підключіться до трансляції, щоб активувати відправку.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;