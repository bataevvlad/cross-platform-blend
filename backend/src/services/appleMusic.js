import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

/**
 * Apple Music Platform Adapter
 * Handles all interactions with Apple Music API via MusicKit
 */
class AppleMusicService {
  constructor() {
    this.teamId = process.env.APPLE_TEAM_ID;
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH;
    this._developerToken = null;
    this._tokenExpiry = null;
  }

  /**
   * Generate Apple Music Developer Token (JWT)
   * Valid for up to 6 months
   */
  generateDeveloperToken() {
    // Check if we have a valid cached token
    if (this._developerToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this._developerToken;
    }

    try {
      const privateKey = fs.readFileSync(
        path.resolve(this.privateKeyPath),
        'utf8'
      );

      const token = jwt.sign({}, privateKey, {
        algorithm: 'ES256',
        expiresIn: '180d', // 6 months max
        issuer: this.teamId,
        header: {
          alg: 'ES256',
          kid: this.keyId
        }
      });

      // Cache the token
      this._developerToken = token;
      this._tokenExpiry = Date.now() + (179 * 24 * 60 * 60 * 1000); // 179 days

      return token;
    } catch (error) {
      console.error('Error generating Apple Music developer token:', error);
      throw new Error('Failed to generate Apple Music developer token');
    }
  }

  /**
   * Get headers for API requests
   */
  getHeaders(musicUserToken = null) {
    const headers = {
      'Authorization': `Bearer ${this.generateDeveloperToken()}`,
      'Content-Type': 'application/json'
    };

    if (musicUserToken) {
      headers['Music-User-Token'] = musicUserToken;
    }

    return headers;
  }

  /**
   * Get MusicKit JS configuration for frontend
   */
  getMusicKitConfig() {
    return {
      developerToken: this.generateDeveloperToken(),
      app: {
        name: 'Cross-Platform Blend',
        build: '1.0.0'
      }
    };
  }

  /**
   * Get user's recently played tracks
   * Note: Apple Music API limits to 50 recent items
   */
  async getRecentlyPlayed(musicUserToken, limit = 10, offset = 0) {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/me/recent/played/tracks`,
      {
        headers: this.getHeaders(musicUserToken),
        params: {
          limit: Math.min(limit, 10), // API limit is 10 per request
          offset,
          types: 'songs'
        }
      }
    );

    return response.data.data?.map(track => this.normalizeTrack(track)) || [];
  }

  /**
   * Get all recently played (paginated)
   * Apple Music stores up to 50 recent tracks
   */
  async getAllRecentlyPlayed(musicUserToken) {
    const allTracks = [];
    const pageSize = 10;
    
    for (let offset = 0; offset < 50; offset += pageSize) {
      try {
        const tracks = await this.getRecentlyPlayed(musicUserToken, pageSize, offset);
        if (tracks.length === 0) break;
        allTracks.push(...tracks);
      } catch (error) {
        // Reached end of history
        break;
      }
    }

    return allTracks;
  }

  /**
   * Get user's library songs (liked/saved tracks)
   */
  async getLibrarySongs(musicUserToken, limit = 25, offset = 0) {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/me/library/songs`,
      {
        headers: this.getHeaders(musicUserToken),
        params: { limit, offset }
      }
    );

    return response.data.data?.map(track => this.normalizeTrack(track)) || [];
  }

  /**
   * Get heavy rotation (frequently played)
   */
  async getHeavyRotation(musicUserToken, limit = 10) {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/me/history/heavy-rotation`,
      {
        headers: this.getHeaders(musicUserToken),
        params: { limit }
      }
    );

    // This returns albums/playlists, extract tracks
    const items = response.data.data || [];
    const tracks = [];

    for (const item of items) {
      if (item.type === 'songs') {
        tracks.push(this.normalizeTrack(item));
      } else if (item.relationships?.tracks?.data) {
        tracks.push(...item.relationships.tracks.data.map(t => this.normalizeTrack(t)));
      }
    }

    return tracks;
  }

  /**
   * Search catalog for tracks
   */
  async searchTracks(musicUserToken, query, storefront = 'us', limit = 10) {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/catalog/${storefront}/search`,
      {
        headers: this.getHeaders(musicUserToken),
        params: {
          term: query,
          types: 'songs',
          limit
        }
      }
    );

    return response.data.results?.songs?.data?.map(track => this.normalizeTrack(track)) || [];
  }

  /**
   * Search by ISRC
   */
  async searchByISRC(musicUserToken, isrc, storefront = 'us') {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/catalog/${storefront}/songs`,
      {
        headers: this.getHeaders(musicUserToken),
        params: {
          'filter[isrc]': isrc
        }
      }
    );

    const track = response.data.data?.[0];
    return track ? this.normalizeTrack(track) : null;
  }

  /**
   * Get user's playlists
   */
  async getUserPlaylists(musicUserToken, limit = 25, offset = 0) {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/me/library/playlists`,
      {
        headers: this.getHeaders(musicUserToken),
        params: { limit, offset }
      }
    );

    return response.data.data?.map(playlist => ({
      id: playlist.id,
      name: playlist.attributes?.name,
      description: playlist.attributes?.description?.standard,
      canEdit: playlist.attributes?.canEdit,
      isPublic: playlist.attributes?.isPublic,
      trackCount: playlist.attributes?.trackCount
    })) || [];
  }

  /**
   * Create a new playlist in user's library
   */
  async createPlaylist(musicUserToken, name, description = '', trackIds = []) {
    const body = {
      attributes: {
        name,
        description
      }
    };

    // Optionally add tracks during creation
    if (trackIds.length > 0) {
      body.relationships = {
        tracks: {
          data: trackIds.map(id => ({
            id,
            type: 'songs'
          }))
        }
      };
    }

    const response = await axios.post(
      `${APPLE_MUSIC_API_BASE}/me/library/playlists`,
      body,
      {
        headers: this.getHeaders(musicUserToken)
      }
    );

    return {
      id: response.data.data?.[0]?.id,
      name: response.data.data?.[0]?.attributes?.name
    };
  }

  /**
   * Add tracks to an existing playlist
   */
  async addTracksToPlaylist(musicUserToken, playlistId, trackIds) {
    const body = {
      data: trackIds.map(id => ({
        id,
        type: 'songs'
      }))
    };

    await axios.post(
      `${APPLE_MUSIC_API_BASE}/me/library/playlists/${playlistId}/tracks`,
      body,
      {
        headers: this.getHeaders(musicUserToken)
      }
    );

    return true;
  }

  /**
   * Get catalog song by ID (for matching purposes)
   */
  async getSong(songId, storefront = 'us') {
    const response = await axios.get(
      `${APPLE_MUSIC_API_BASE}/catalog/${storefront}/songs/${songId}`,
      {
        headers: this.getHeaders()
      }
    );

    const track = response.data.data?.[0];
    return track ? this.normalizeTrack(track) : null;
  }

  /**
   * Normalize Apple Music track to universal format
   */
  normalizeTrack(appleMusicTrack) {
    const attrs = appleMusicTrack.attributes || {};
    
    return {
      id: appleMusicTrack.id,
      isrc: attrs.isrc || null,
      title: attrs.name,
      artists: [{
        id: null, // Apple Music doesn't provide artist IDs in track objects easily
        name: attrs.artistName
      }],
      album: {
        id: null,
        name: attrs.albumName,
        image: attrs.artwork?.url?.replace('{w}', '300').replace('{h}', '300')
      },
      duration_ms: attrs.durationInMillis,
      popularity: null, // Not available in Apple Music API
      explicit: attrs.contentRating === 'explicit',
      preview_url: attrs.previews?.[0]?.url,
      platforms: {
        appleMusic: {
          id: appleMusicTrack.id,
          url: attrs.url,
          playParams: attrs.playParams
        }
      },
      sourcePlatform: 'appleMusic',
      // Additional Apple Music specific data
      composerName: attrs.composerName,
      genreNames: attrs.genreNames,
      releaseDate: attrs.releaseDate
    };
  }

  /**
   * Get storefront for user's region
   */
  async getUserStorefront(musicUserToken) {
    try {
      const response = await axios.get(
        `${APPLE_MUSIC_API_BASE}/me/storefront`,
        {
          headers: this.getHeaders(musicUserToken)
        }
      );
      return response.data.data?.[0]?.id || 'us';
    } catch (error) {
      return 'us'; // Default to US storefront
    }
  }
}

export default new AppleMusicService();
