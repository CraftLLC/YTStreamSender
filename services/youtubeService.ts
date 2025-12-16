
export const extractVideoId = (url: string): string | null => {
  if (!url) return null;

  // Pattern covering standard watch, embed, short links, and /live/ URLs
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([^#&?]+)/;
  const match = url.match(regExp);

  // If regex matched and length looks like a standard YouTube ID (11 chars), return it
  if (match && match[1].length === 11) {
    return match[1];
  }

  // Fallback: If the user just pasted the ID directly (11 chars)
  if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
    return url;
  }

  // Loose fallback: try to find any 11-char string in the input if strict parsing fails
  // This allows "messy" inputs to at least attempt a connection
  const looseMatch = url.match(/([a-zA-Z0-9_-]{11})/);
  if (looseMatch) {
    return looseMatch[1];
  }

  return null;
};

export const fetchLiveChatId = async (videoId: string, token: string): Promise<{ liveChatId: string, title: string }> => {
  if (!token) throw new Error("Access Token is required");

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Не вдалося отримати деталі відео');
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('Відео не знайдено. Перевірте ID або права доступу.');
  }

  const item = data.items[0];
  const liveChatId = item.liveStreamingDetails?.activeLiveChatId;
  const title = item.snippet?.title;

  if (!liveChatId) {
    throw new Error('Ця трансляція не має активного чату або вона завершена.');
  }

  return { liveChatId, title };
};

export const sendMessageToChat = async (liveChatId: string, messageText: string, token: string) => {
  if (!token) throw new Error("Access Token is required");

  const payload = {
    snippet: {
      liveChatId: liveChatId,
      type: 'textMessageEvent',
      textMessageDetails: {
        messageText: messageText,
      },
    },
  };

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Помилка надсилання повідомлення');
  }

  return await response.json();
};

export const fetchChatMessages = async (liveChatId: string, token: string, pageToken?: string) => {
    if (!token) throw new Error("Access Token is required");

    let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails`;
    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Помилка отримання чату');
    }

    return await response.json(); // Returns { items: [], nextPageToken: '', pollingIntervalMillis: 1000, ... }
};

export const refreshGoogleToken = async (clientId: string, clientSecret: string, refreshToken: string) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Не вдалося оновити токен');
  }

  return await response.json(); // Returns { access_token, expires_in, scope, token_type }
};

export const exchangeCodeForTokens = async (clientId: string, clientSecret: string, code: string) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: window.location.origin // Must match the origin where the request was initiated
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Не вдалося обміняти код на токени');
  }

  return await response.json(); // Returns { access_token, refresh_token, expires_in, ... }
};
