export const extractVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
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
    throw new Error('Відео не знайдено');
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