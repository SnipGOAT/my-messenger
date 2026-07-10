// lib/timeAgo.js

// Форматирование "последний раз был в сети"
export const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return 'был(а) в сети недавно';

  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Если был онлайн в последние 2 минуты — считаем онлайн
  if (diffMinutes < 2) {
    return 'онлайн';
  }

  if (diffMinutes < 60) {
    return `был(а) ${diffMinutes} мин. назад`;
  }

  if (diffHours < 24) {
    return `был(а) ${diffHours} ч. назад`;
  }

  if (diffDays < 7) {
    return `был(а) ${diffDays} дн. назад`;
  }

  // Если давно — показываем дату
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `был(а) ${day}.${month}.${year}`;
};

// Форматирование времени для сообщений (HH:MM)
export const formatTime = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  // Если сообщение сегодня — показываем только время
  if (date.toDateString() === now.toDateString()) {
    return `${hours}:${minutes}`;
  }
  
  // Если сообщение вчера
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Вчера ${hours}:${minutes}`;
  }
  
  // Иначе показываем дату
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
};