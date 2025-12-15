import React, { useState, useEffect } from 'react';
import { AppConfig } from '../types';
import { Key, Link as LinkIcon, Save, AlertCircle, PlayCircle, ShieldCheck, LogIn, Check } from 'lucide-react';

interface SettingsPanelProps {
  config: AppConfig;
  onSave: (newConfig: AppConfig) => void;
  // Auth
  onAuthorize: () => void;
  isAuthorized: boolean;
  // Connection
  onConnect: () => void;
  isConnected: boolean;
  streamTitle: string | null;
  connectionError: string | null;
  isLoadingChat: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  config, 
  onSave, 
  onAuthorize,
  isAuthorized,
  onConnect,
  isConnected, 
  streamTitle, 
  connectionError,
  isLoadingChat
}) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local config if parent config changes (e.g. initial load)
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (field: keyof AppConfig, value: string) => {
    const updated = { ...localConfig, [field]: value };
    setLocalConfig(updated);
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(localConfig);
    setIsDirty(false);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
        <Key className="w-5 h-5 text-blue-400" />
        Налаштування
      </h2>
      
      <div className="space-y-5">
        {/* Client ID */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Google Client ID</label>
          <div className="relative">
            <input
              type="text"
              value={localConfig.clientId}
              onChange={(e) => handleChange('clientId', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-600"
              placeholder="YOUR_CLIENT_ID.apps.googleusercontent.com"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Збережіть Client ID перед авторизацією.</p>
        </div>

        {/* Authorization Status / Button */}
        <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
           <div className="flex justify-between items-center">
             <div>
               <label className="block text-sm font-medium text-white mb-1">Авторизація</label>
               <p className="text-xs text-slate-400">
                 {isAuthorized 
                   ? 'Токен доступу отримано' 
                   : 'Необхідно увійти в Google обліковий запис'}
               </p>
             </div>
             
             {isAuthorized ? (
               <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 text-green-400 rounded-full border border-green-900/50 text-xs font-medium">
                 <Check className="w-3.5 h-3.5" />
                 Authorized
               </div>
             ) : (
               <button
                 onClick={onAuthorize}
                 disabled={!config.clientId || isDirty}
                 className="flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <LogIn className="w-4 h-4" />
                 Увійти через Google
               </button>
             )}
           </div>
           {!config.clientId && (
             <p className="text-xs text-amber-500 mt-2">
               ⚠️ Спочатку введіть та збережіть Client ID.
             </p>
           )}
           {isDirty && config.clientId && (
             <p className="text-xs text-amber-500 mt-2">
               ⚠️ Збережіть зміни перед авторизацією.
             </p>
           )}
        </div>

        {/* Stream URL */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">URL Трансляції</label>
          <div className="relative">
            <input
              type="text"
              value={localConfig.streamUrl}
              onChange={(e) => handleChange('streamUrl', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-600"
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <LinkIcon className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors ${
              isDirty 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            Зберегти
          </button>
          
          <button
            onClick={onConnect}
            disabled={!localConfig.streamUrl || !isAuthorized || isLoadingChat}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors ${
              isConnected
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-700 disabled:text-slate-500'
            }`}
          >
             {isLoadingChat ? (
               <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
             ) : isConnected ? (
               <ShieldCheck className="w-4 h-4" />
             ) : (
               <PlayCircle className="w-4 h-4" />
             )}
             {isConnected ? 'Підключено' : 'Знайти чат'}
          </button>
        </div>

        {/* Feedback Messages */}
        {connectionError && (
          <div className="mt-3 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{connectionError}</span>
          </div>
        )}

        {isConnected && streamTitle && (
          <div className="mt-3 p-3 bg-green-900/20 border border-green-900/50 rounded-lg flex items-start gap-2 text-green-400 text-sm">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Чат знайдено</p>
              <p className="text-green-400/80 text-xs truncate max-w-[250px]">{streamTitle}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};