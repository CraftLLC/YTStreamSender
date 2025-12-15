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