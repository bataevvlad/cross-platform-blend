import axios from 'axios';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_BASE = 'https://accounts.spotify.com';

/**
 * Spotify Platform Adapter
 * Handles all interactions with Spotify Web API
 */
class SpotifyService {
  constructor() {
    // Credentials loaded lazily via getters
  }

  get clientId() {
    return process.env.SPOTIFY_CLIENT_ID;
  }

  get clientSecret() {
    return process.env.SPOTIFY_CLIENT_SECRET;
  }

  get redirectUri() {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(state) {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-top-read',
      'user-read-recently-played',
      'playlist-modify-public',
      'playlist-modify-private',
      'playlist-read-private',
      'user-library-read'
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      state: state
    });

    return `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code) {
    const response = await axios.post(
      `${SPOTIFY_AUTH_BASE}/api/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    const response = await axios.post(
      `${SPOTIFY_AUTH_BASE}/api/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      }
    );

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in
    };
  }

  /**
   * Get current user's profile
   */
  async getUserProfile(accessToken) {
    const response = await axios.get(`${SPOTIFY_API_BASE}/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    return {
      id: response.data.id,
      displayName: response.data.display_name,
      email: response.data.email,
      images: response.data.images,
      country: response.data.country,
      product: response.data.product
    };
  }

  /**
   * Get user's top tracks
   * @param {string} accessToken 
   * @param {string} timeRange - short_term (4 weeks), medium_term (6 months), long_term (1 year)
   * @param {number} limit - max 50
   * @param {number} offset
   */
  async getTopTracks(accessToken, timeRange = 'medium_term', limit = 50, offset = 0) {
    const response = await axios.get(`${SPOTIFY_API_BASE}/me/top/tracks`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: { time_range: timeRange, limit, offset }
    });

    return response.data.items.map(track => this.normalizeTrack(track));
  }

  /**
   * Get all top tracks (combining all time ranges)
   */
  async getAllTopTracks(accessToken) {
    const [shortTerm, mediumTerm, longTerm] = await Promise.all([
      this.getTopTracks(accessToken, 'short_term', 50),
      this.getTopTracks(accessToken, 'medium_term', 50),
      this.getTopTracks(accessToken, 'long_term', 50)
    ]);

    // Combine and deduplicate, prioritizing recent plays
    const trackMap = new Map();
    
    // Long term first (lowest priority)
    longTerm.forEach((track, index) => {
      trackMap.set(track.isrc || track.id, { ...track, score: 100 - index });
    });
    
    // Medium term (medium priority)
    mediumTerm.forEach((track, index) => {
      const existing = trackMap.get(track.isrc || track.id);
      const score = 150 - index;
      if (existing) {
        existing.score += score;
      } else {
        trackMap.set(track.isrc || track.id, { ...track, score });
      }
    });
    
    // Short term (highest priority)
    shortTerm.forEach((track, index) => {
      const existing = trackMap.get(track.isrc || track.id);
      const score = 200 - index;
      if (existing) {
        existing.score += score;
      } else {
        trackMap.set(track.isrc || track.id, { ...track, score });
      }
    });

    // Sort by score and return
    return Array.from(trackMap.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get recently played tracks
   */
  async getRecentlyPlayed(accessToken, limit = 50) {
    const response = await axios.get(`${SPOTIFY_API_BASE}/me/player/recently-played`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: { limit }
    });

    return response.data.items.map(item => ({
      ...this.normalizeTrack(item.track),
      playedAt: item.played_at
    }));
  }

  /**
   * Get saved/liked tracks
   */
  async getSavedTracks(accessToken, limit = 50, offset = 0) {
    const response = await axios.get(`${SPOTIFY_API_BASE}/me/tracks`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: { limit, offset }
    });

    return response.data.items.map(item => ({
      ...this.normalizeTrack(item.track),
      savedAt: item.added_at
    }));
  }

  /**
   * Get audio features for tracks (tempo, energy, danceability, etc.)
   */
  async getAudioFeatures(accessToken, trackIds) {
    if (trackIds.length === 0) return [];
    
    // API allows max 100 IDs per request
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(chunk => 
        axios.get(`${SPOTIFY_API_BASE}/audio-features`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          params: { ids: chunk.join(',') }
        })
      )
    );

    return results.flatMap(r => r.data.audio_features).filter(Boolean);
  }

  /**
   * Search for tracks
   */
  async searchTracks(accessToken, query, limit = 10) {
    const response = await axios.get(`${SPOTIFY_API_BASE}/search`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: { q: query, type: 'track', limit }
    });

    return response.data.tracks.items.map(track => this.normalizeTrack(track));
  }

  /**
   * Search by ISRC (International Standard Recording Code)
   */
  async searchByISRC(accessToken, isrc) {
    const results = await this.searchTracks(accessToken, `isrc:${isrc}`, 1);
    return results[0] || null;
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(accessToken, userId, name, description = '', isPublic = true) {
    const response = await axios.post(
      `${SPOTIFY_API_BASE}/users/${userId}/playlists`,
      {
        name,
        description,
        public: isPublic
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      id: response.data.id,
      name: response.data.name,
      url: response.data.external_urls.spotify,
      uri: response.data.uri
    };
  }

  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(accessToken, playlistId, trackUris) {
    // API allows max 100 tracks per request
    const chunks = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await axios.post(
        `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`,
        { uris: chunk },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return true;
  }

  /**
   * Upload custom playlist cover image
   */
  async uploadPlaylistCover(accessToken, playlistId, base64Image) {
    await axios.put(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}/images`,
      base64Image,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg'
        }
      }
    );
    return true;
  }

  /**
   * Normalize Spotify track to universal format
   */
  normalizeTrack(spotifyTrack) {
    return {
      id: spotifyTrack.id,
      isrc: spotifyTrack.external_ids?.isrc || null,
      title: spotifyTrack.name,
      artists: spotifyTrack.artists.map(a => ({
        id: a.id,
        name: a.name
      })),
      album: {
        id: spotifyTrack.album?.id,
        name: spotifyTrack.album?.name,
        image: spotifyTrack.album?.images?.[0]?.url
      },
      duration_ms: spotifyTrack.duration_ms,
      popularity: spotifyTrack.popularity,
      explicit: spotifyTrack.explicit,
      preview_url: spotifyTrack.preview_url,
      platforms: {
        spotify: {
          id: spotifyTrack.id,
          uri: spotifyTrack.uri,
          url: spotifyTrack.external_urls?.spotify
        }
      },
      sourcePlatform: 'spotify'
    };
  }
}

export default new SpotifyService();
