# 🎵 Cross-Platform Music Blend

Сервис для создания музыкальных блендов между пользователями разных платформ (Spotify, Apple Music, YouTube Music).

## 🎯 Концепция

**Blend** — это совместный плейлист, который объединяет музыкальные вкусы двух пользователей. Наш сервис позволяет создавать такие плейлисты **между разными платформами** — например, пользователь Spotify может создать blend с пользователем Apple Music.

## 📊 Обзор API платформ

### Spotify API ✅
**Статус:** Полностью открытый и документированный

| Endpoint | Описание | Ограничения |
|----------|----------|-------------|
| `GET /v1/me/top/tracks` | Топ треки пользователя | До 50 треков, time_range: short/medium/long_term |
| `GET /v1/me/player/recently-played` | Недавно прослушанное | Только 50 последних треков |
| `POST /v1/users/{user_id}/playlists` | Создание плейлиста | Требует OAuth |
| `POST /v1/playlists/{id}/tracks` | Добавление треков | До 100 треков за запрос |

**Необходимые scopes:**
- `user-top-read` — чтение топ треков
- `user-read-recently-played` — недавно прослушанное  
- `playlist-modify-public` — создание публичных плейлистов
- `playlist-modify-private` — создание приватных плейлистов

### Apple Music API ⚠️
**Статус:** Требует Apple Developer Account + MusicKit

| Endpoint | Описание | Ограничения |
|----------|----------|-------------|
| `GET /v1/me/recent/played/tracks` | Недавно прослушанное | До 50 треков (offset работает) |
| `POST /v1/me/library/playlists` | Создание плейлиста | Требует Music-User-Token |
| `POST /v1/me/library/playlists/{id}/tracks` | Добавление треков | |

**Авторизация:**
- Developer Token (JWT, подписанный приватным ключом)
- Music-User-Token (получается через MusicKit JS, живёт ~6 месяцев)

### YouTube Music API ⚠️
**Статус:** Нет официального API, есть неофициальная библиотека `ytmusicapi`

| Функция | Описание | Ограничения |
|---------|----------|-------------|
| `get_history()` | История прослушивания | Требует OAuth |
| `get_library_songs()` | Библиотека пользователя | |
| `create_playlist()` | Создание плейлиста | |
| `add_playlist_items()` | Добавление треков | |

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ User Auth   │  │ Blend Match │  │ Playlist Preview    │  │
│  │ (OAuth)     │  │ Algorithm   │  │ & Export            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Node.js)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Blend Engine                          ││
│  │  - Track Matching (ISRC, название+артист)               ││
│  │  - Taste Similarity Score                                ││
│  │  - Playlist Generation Algorithm                         ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Spotify     │  │ Apple Music │  │ YouTube Music       │  │
│  │ Adapter     │  │ Adapter     │  │ Adapter             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External APIs                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Spotify     │  │ Apple Music │  │ YouTube Music       │  │
│  │ Web API     │  │ MusicKit    │  │ (ytmusicapi)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Алгоритм создания Blend

### 1. Сбор данных
```javascript
// Для каждого пользователя собираем:
{
  userId: "user123",
  platform: "spotify",
  topTracks: [...],      // Топ 50 треков
  recentTracks: [...],   // Последние 50 прослушанных
  likedTracks: [...]     // Сохранённые треки (если доступно)
}
```

### 2. Нормализация треков
```javascript
// Универсальный формат трека
{
  id: "internal_uuid",
  isrc: "USRC12345678",           // International Standard Recording Code
  title: "Song Name",
  artists: ["Artist 1", "Artist 2"],
  album: "Album Name",
  duration_ms: 240000,
  platforms: {
    spotify: { id: "xyz", uri: "spotify:track:xyz" },
    appleMusic: { id: "abc" },
    youtubeMusic: { videoId: "def" }
  }
}
```

### 3. Матчинг треков между платформами

```javascript
function matchTrack(track, targetPlatform) {
  // Приоритет 1: ISRC (100% точность)
  if (track.isrc) {
    const match = searchByISRC(targetPlatform, track.isrc);
    if (match) return match;
  }
  
  // Приоритет 2: Точное название + артист
  const exactMatch = searchExact(targetPlatform, track.title, track.artists[0]);
  if (exactMatch && similarityScore(exactMatch, track) > 0.95) {
    return exactMatch;
  }
  
  // Приоритет 3: Fuzzy matching
  const fuzzyResults = searchFuzzy(targetPlatform, track.title, track.artists);
  return bestMatch(fuzzyResults, track);
}
```

### 4. Подсчёт Taste Similarity Score

```javascript
function calculateTasteSimilarity(user1Tracks, user2Tracks) {
  const scores = {
    // Общие треки (высший вес)
    commonTracks: findCommonTracks(user1Tracks, user2Tracks).length,
    
    // Общие артисты
    commonArtists: findCommonArtists(user1Tracks, user2Tracks).length,
    
    // Похожие жанры (если доступно)
    genreOverlap: calculateGenreOverlap(user1Tracks, user2Tracks),
    
    // Похожие характеристики треков (tempo, energy, etc.)
    audioFeatureSimilarity: compareAudioFeatures(user1Tracks, user2Tracks)
  };
  
  // Взвешенная формула
  return (
    scores.commonTracks * 0.4 +
    scores.commonArtists * 0.3 +
    scores.genreOverlap * 0.2 +
    scores.audioFeatureSimilarity * 0.1
  ) / normalizeScore;
}
```

### 5. Генерация Blend плейлиста

```javascript
function generateBlend(user1, user2, options = {}) {
  const playlistSize = options.size || 30;
  const blend = [];
  
  // 1. Общие треки (обязательно включаем)
  const common = findCommonTracks(user1.tracks, user2.tracks);
  blend.push(...common.slice(0, Math.min(common.length, playlistSize * 0.3)));
  
  // 2. Топ треки от каждого пользователя (чередуем)
  const remaining = playlistSize - blend.length;
  const perUser = Math.floor(remaining / 2);
  
  // Выбираем треки, которые понравятся другому пользователю
  const user1Picks = selectTracksForUser(user1.topTracks, user2.profile, perUser);
  const user2Picks = selectTracksForUser(user2.topTracks, user1.profile, perUser);
  
  // Чередуем треки
  for (let i = 0; i < Math.max(user1Picks.length, user2Picks.length); i++) {
    if (user1Picks[i]) blend.push({ ...user1Picks[i], from: user1.id });
    if (user2Picks[i]) blend.push({ ...user2Picks[i], from: user2.id });
  }
  
  return {
    name: `${user1.name} + ${user2.name} Blend`,
    description: `Cross-platform blend • Taste match: ${similarity}%`,
    tracks: blend,
    similarity: calculateTasteSimilarity(user1.tracks, user2.tracks),
    createdAt: new Date()
  };
}
```

## 🚀 Установка и запуск

### Требования
- Node.js 18+
- npm или yarn
- Spotify Developer Account
- Apple Developer Account (для Apple Music)
- Google Account (для YouTube Music OAuth)

### Настройка

1. **Клонируйте репозиторий**
```bash
git clone https://github.com/your/cross-platform-blend.git
cd cross-platform-blend
```

2. **Установите зависимости**
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

3. **Настройте переменные окружения**
```bash
cp .env.example .env
# Отредактируйте .env файл
```

4. **Запустите приложение**
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

## 📝 Примечания по API

### Ограничения Spotify
- Rate limit: ~180 запросов в минуту
- История прослушивания: только 50 последних треков
- Топ треки: можно получить больше через offset (до ~100-200)

### Ограничения Apple Music
- Music-User-Token истекает через 6 месяцев
- Нужно ручное обновление токена (нет refresh token)
- Требуется Apple Developer Account ($99/год)

### Ограничения YouTube Music
- Нет официального API
- ytmusicapi может сломаться при обновлении YT Music
- OAuth токены нужно периодически обновлять

## 🔮 Будущие улучшения

- [ ] Поддержка Deezer, Tidal, Amazon Music
- [ ] Real-time синхронизация плейлистов
- [ ] Blend для групп (3+ пользователей)
- [ ] AI-рекомендации новых треков для blend
- [ ] Mobile приложение (React Native)
