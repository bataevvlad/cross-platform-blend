import axios from 'axios';

/**
 * YouTube Music Platform Adapter
 * Uses Google OAuth and YouTube Data API v3
 *
 * NOTE: Uses YouTube Data API which has quota limits.
 * For production, consider implementing caching.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_BASE = 'https://oauth2.googleapis.com/token';

class YouTubeMusicService {
  constructor() {
    // No special context needed for official API
  }

  /**
   * Get credentials from environment (lazy loading)
   */
  get clientId() {
    return process.env.GOOGLE_CLIENT_ID;
  }

  get clientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
  }

  get redirectUri() {
    return process.env.GOOGLE_REDIRECT_URI;
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(state) {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube',
      'openid',
      'email',
      'profile'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code) {
    const response = await axios.post(GOOGLE_TOKEN_BASE, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code'
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
      idToken: response.data.id_token
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    const response = await axios.post(GOOGLE_TOKEN_BASE, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in
    };
  }

  /**
   * Make authenticated request to YouTube Data API
   */
  async makeRequest(endpoint, params, accessToken) {
    const url = `${YOUTUBE_API_BASE}/${endpoint}`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      params
    });

    return response.data;
  }

  /**
   * Get user's liked videos (music)
   */
  async getHistory(accessToken) {
    // Get liked videos as a proxy for listening history
    try {
      const response = await this.makeRequest('videos', {
        part: 'snippet,contentDetails',
        myRating: 'like',
        maxResults: 50
      }, accessToken);

      return (response.items || []).map(item => this.normalizeVideo(item));
    } catch (error) {
      console.error('Error getting YouTube history:', error.message);
      return [];
    }
  }

  /**
   * Get user's library songs (liked videos)
   */
  async getLibrarySongs(accessToken, limit = 100) {
    try {
      const response = await this.makeRequest('videos', {
        part: 'snippet,contentDetails',
        myRating: 'like',
        maxResults: Math.min(limit, 50)
      }, accessToken);

      return (response.items || []).map(item => this.normalizeVideo(item));
    } catch (error) {
      console.error('Error getting YouTube library:', error.message);
      return [];
    }
  }

  /**
   * Get user's playlists
   */
  async getUserPlaylists(accessToken) {
    try {
      const response = await this.makeRequest('playlists', {
        part: 'snippet,contentDetails',
        mine: true,
        maxResults: 50
      }, accessToken);

      return (response.items || []).map(item => ({
        id: item.id,
        name: item.snippet.title,
        description: item.snippet.description,
        trackCount: item.contentDetails?.itemCount || 0,
        image: item.snippet.thumbnails?.default?.url
      }));
    } catch (error) {
      console.error('Error getting YouTube playlists:', error.message);
      return [];
    }
  }

  /**
   * Search for tracks/videos
   */
  async searchTracks(accessToken, query, limit = 20) {
    try {
      const response = await this.makeRequest('search', {
        part: 'snippet',
        q: query + ' music',
        type: 'video',
        videoCategoryId: '10', // Music category
        maxResults: Math.min(limit, 50)
      }, accessToken);

      return (response.items || []).map(item => this.normalizeSearchResult(item));
    } catch (error) {
      console.error('Error searching YouTube:', error.message);
      return [];
    }
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(accessToken, title, description = '', privacy = 'private') {
    try {
      const response = await axios.post(
        `${YOUTUBE_API_BASE}/playlists`,
        {
          snippet: { title, description },
          status: { privacyStatus: privacy.toLowerCase() }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          params: { part: 'snippet,status' }
        }
      );

      return {
        id: response.data.id,
        title: response.data.snippet.title,
        url: `https://www.youtube.com/playlist?list=${response.data.id}`
      };
    } catch (error) {
      console.error('Error creating YouTube playlist:', error.message);
      throw error;
    }
  }

  /**
   * Add tracks to playlist
   */
  async addTracksToPlaylist(accessToken, playlistId, videoIds) {
    for (const videoId of videoIds) {
      try {
        await axios.post(
          `${YOUTUBE_API_BASE}/playlistItems`,
          {
            snippet: {
              playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId
              }
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            params: { part: 'snippet' }
          }
        );
      } catch (error) {
        console.error(`Error adding video ${videoId} to playlist:`, error.message);
      }
    }
    return true;
  }

  /**
   * Normalize a YouTube video to track format
   */
  normalizeVideo(video) {
    const title = video.snippet?.title || 'Unknown';
    // Try to extract artist from title (common format: "Artist - Song")
    const parts = title.split(' - ');
    const artistName = parts.length > 1 ? parts[0] : video.snippet?.channelTitle || 'Unknown Artist';
    const trackTitle = parts.length > 1 ? parts.slice(1).join(' - ') : title;

    return {
      id: video.id,
      isrc: null,
      title: trackTitle,
      artists: [{ id: null, name: artistName }],
      album: { id: null, name: null, image: video.snippet?.thumbnails?.default?.url },
      duration_ms: this.parseDuration(video.contentDetails?.duration),
      popularity: null,
      explicit: false,
      preview_url: null,
      platforms: {
        youtubeMusic: {
          videoId: video.id,
          url: `https://www.youtube.com/watch?v=${video.id}`
        }
      },
      sourcePlatform: 'youtubeMusic'
    };
  }

  /**
   * Normalize a YouTube search result to track format
   */
  normalizeSearchResult(item) {
    const title = item.snippet?.title || 'Unknown';
    const parts = title.split(' - ');
    const artistName = parts.length > 1 ? parts[0] : item.snippet?.channelTitle || 'Unknown Artist';
    const trackTitle = parts.length > 1 ? parts.slice(1).join(' - ') : title;

    return {
      id: item.id?.videoId,
      isrc: null,
      title: trackTitle,
      artists: [{ id: null, name: artistName }],
      album: { id: null, name: null, image: item.snippet?.thumbnails?.default?.url },
      duration_ms: null,
      popularity: null,
      explicit: false,
      preview_url: null,
      platforms: {
        youtubeMusic: {
          videoId: item.id?.videoId,
          url: `https://www.youtube.com/watch?v=${item.id?.videoId}`
        }
      },
      sourcePlatform: 'youtubeMusic'
    };
  }

  /**
   * Parse ISO 8601 duration to milliseconds
   */
  parseDuration(duration) {
    if (!duration) return null;

    // Format: PT#H#M#S
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
}

export default new YouTubeMusicService();
