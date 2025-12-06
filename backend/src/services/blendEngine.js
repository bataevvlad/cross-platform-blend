import { v4 as uuidv4 } from 'uuid';
import * as fuzz from 'fuzzball';
import spotifyService from './spotify.js';
import appleMusicService from './appleMusic.js';
import youtubeMusicService from './youtubeMusic.js';

/**
 * Blend Engine
 * Core algorithm for creating cross-platform music blends
 */
class BlendEngine {
  constructor() {
    this.services = {
      spotify: spotifyService,
      appleMusic: appleMusicService,
      youtubeMusic: youtubeMusicService
    };
  }

  /**
   * Collect all user listening data from their platform
   */
  async collectUserData(userId, platform, tokens) {
    const service = this.services[platform];
    if (!service) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const userData = {
      userId,
      platform,
      collectedAt: new Date().toISOString(),
      topTracks: [],
      recentTracks: [],
      likedTracks: []
    };

    try {
      switch (platform) {
        case 'spotify':
          // Get comprehensive listening data
          userData.topTracks = await service.getAllTopTracks(tokens.accessToken);
          userData.recentTracks = await service.getRecentlyPlayed(tokens.accessToken, 50);

          // Try to get liked tracks (may fail if scope not granted)
          try {
            userData.likedTracks = await service.getSavedTracks(tokens.accessToken, 50);
          } catch (e) {
            console.log('Could not fetch saved tracks, continuing without them');
            userData.likedTracks = [];
          }

          // Get audio features for taste analysis
          const trackIds = [...new Set([
            ...userData.topTracks.slice(0, 50).map(t => t.id),
            ...userData.recentTracks.slice(0, 50).map(t => t.id)
          ])];

          try {
            userData.audioFeatures = await service.getAudioFeatures(tokens.accessToken, trackIds);
          } catch (e) {
            console.log('Could not fetch audio features, continuing without them');
            userData.audioFeatures = [];
          }
          break;

        case 'appleMusic':
          userData.recentTracks = await service.getAllRecentlyPlayed(tokens.musicUserToken);
          userData.likedTracks = await service.getLibrarySongs(tokens.musicUserToken, 100);
          // Apple Music doesn't have a direct "top tracks" endpoint
          // We'll derive importance from library and recent plays
          userData.topTracks = this.deriveTopTracksFromLibrary(userData);
          break;

        case 'youtubeMusic':
          userData.recentTracks = await service.getHistory(tokens.accessToken);
          userData.likedTracks = await service.getLibrarySongs(tokens.accessToken, 100);
          userData.topTracks = this.deriveTopTracksFromLibrary(userData);
          break;
      }
    } catch (error) {
      console.error(`Error collecting data from ${platform}:`, error);
      throw error;
    }

    // Deduplicate and enrich all tracks
    userData.allTracks = this.deduplicateTracks([
      ...userData.topTracks,
      ...userData.recentTracks,
      ...userData.likedTracks
    ]);

    return userData;
  }

  /**
   * Derive top tracks from library when platform doesn't provide them directly
   */
  deriveTopTracksFromLibrary(userData) {
    const trackScores = new Map();

    // Score based on recent plays (more recent = higher score)
    userData.recentTracks.forEach((track, index) => {
      const key = this.getTrackKey(track);
      const currentScore = trackScores.get(key) || { track, score: 0 };
      currentScore.score += (userData.recentTracks.length - index) * 2;
      trackScores.set(key, currentScore);
    });

    // Score based on library position
    userData.likedTracks.forEach((track, index) => {
      const key = this.getTrackKey(track);
      const currentScore = trackScores.get(key) || { track, score: 0 };
      currentScore.score += 10; // Base score for being in library
      trackScores.set(key, currentScore);
    });

    // Sort by score and return tracks
    return Array.from(trackScores.values())
      .sort((a, b) => b.score - a.score)
      .map(item => item.track);
  }

  /**
   * Create a unique key for track deduplication
   */
  getTrackKey(track) {
    if (track.isrc) return `isrc:${track.isrc}`;
    const normalizedTitle = track.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedArtist = (track.artists[0]?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${normalizedTitle}:${normalizedArtist}`;
  }

  /**
   * Deduplicate tracks array
   */
  deduplicateTracks(tracks) {
    const seen = new Map();
    
    for (const track of tracks) {
      const key = this.getTrackKey(track);
      if (!seen.has(key)) {
        seen.set(key, track);
      } else {
        // Merge platform data if track exists
        const existing = seen.get(key);
        existing.platforms = { ...existing.platforms, ...track.platforms };
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Match a track across platforms
   */
  async matchTrack(track, targetPlatform, tokens) {
    const service = this.services[targetPlatform];
    if (!service) return null;

    // If already has this platform's data
    if (track.platforms[targetPlatform]) {
      return track;
    }

    // Try ISRC first (most accurate)
    if (track.isrc) {
      try {
        let match;
        switch (targetPlatform) {
          case 'spotify':
            match = await service.searchByISRC(tokens.accessToken, track.isrc);
            break;
          case 'appleMusic':
            match = await service.searchByISRC(tokens.musicUserToken, track.isrc);
            break;
        }
        
        if (match) {
          return {
            ...track,
            platforms: { ...track.platforms, ...match.platforms }
          };
        }
      } catch (error) {
        console.log(`ISRC search failed for ${track.title}, trying fuzzy match`);
      }
    }

    // Fuzzy search by title and artist
    const query = `${track.title} ${track.artists[0]?.name || ''}`;
    
    try {
      let searchResults;
      switch (targetPlatform) {
        case 'spotify':
          searchResults = await service.searchTracks(tokens.accessToken, query, 5);
          break;
        case 'appleMusic':
          searchResults = await service.searchTracks(tokens.musicUserToken, query, 5);
          break;
        case 'youtubeMusic':
          searchResults = await service.searchTracks(tokens.accessToken, query, 5);
          break;
      }

      if (searchResults && searchResults.length > 0) {
        const bestMatch = this.findBestMatch(track, searchResults);
        if (bestMatch && bestMatch.confidence > 0.8) {
          return {
            ...track,
            platforms: { ...track.platforms, ...bestMatch.track.platforms }
          };
        }
      }
    } catch (error) {
      console.log(`Search failed for ${track.title}:`, error.message);
    }

    return null;
  }

  /**
   * Find best matching track using fuzzy string matching
   */
  findBestMatch(originalTrack, candidates) {
    let bestMatch = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      // Compare titles
      const titleScore = fuzz.ratio(
        originalTrack.title.toLowerCase(),
        candidate.title.toLowerCase()
      );

      // Compare artists
      const originalArtist = originalTrack.artists[0]?.name?.toLowerCase() || '';
      const candidateArtist = candidate.artists[0]?.name?.toLowerCase() || '';
      const artistScore = fuzz.ratio(originalArtist, candidateArtist);

      // Compare duration (if available)
      let durationScore = 100;
      if (originalTrack.duration_ms && candidate.duration_ms) {
        const diff = Math.abs(originalTrack.duration_ms - candidate.duration_ms);
        durationScore = Math.max(0, 100 - (diff / 1000)); // Penalize by 1 point per second difference
      }

      // Weighted score
      const totalScore = (titleScore * 0.4) + (artistScore * 0.4) + (durationScore * 0.2);
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = candidate;
      }
    }

    return bestMatch ? {
      track: bestMatch,
      confidence: bestScore / 100
    } : null;
  }

  /**
   * Calculate taste similarity between two users
   */
  calculateTasteSimilarity(user1Data, user2Data) {
    const scores = {
      commonTracks: 0,
      commonArtists: 0,
      audioFeatureSimilarity: 0
    };

    // Find common tracks
    const user1Keys = new Set(user1Data.allTracks.map(t => this.getTrackKey(t)));
    const user2Keys = new Set(user2Data.allTracks.map(t => this.getTrackKey(t)));
    
    const commonTracks = [...user1Keys].filter(k => user2Keys.has(k));
    scores.commonTracks = commonTracks.length;

    // Find common artists
    const user1Artists = new Set(
      user1Data.allTracks.flatMap(t => t.artists.map(a => a.name?.toLowerCase()))
    );
    const user2Artists = new Set(
      user2Data.allTracks.flatMap(t => t.artists.map(a => a.name?.toLowerCase()))
    );
    
    const commonArtists = [...user1Artists].filter(a => a && user2Artists.has(a));
    scores.commonArtists = commonArtists.length;

    // Audio feature comparison (if available from Spotify)
    if (user1Data.audioFeatures && user2Data.audioFeatures) {
      scores.audioFeatureSimilarity = this.compareAudioFeatures(
        user1Data.audioFeatures,
        user2Data.audioFeatures
      );
    }

    // Calculate weighted similarity score (0-100)
    const maxCommonTracks = Math.min(user1Data.allTracks.length, user2Data.allTracks.length) || 1;
    const maxCommonArtists = Math.min(user1Artists.size, user2Artists.size) || 1;

    const similarity = (
      (scores.commonTracks / maxCommonTracks) * 40 +
      (scores.commonArtists / maxCommonArtists) * 35 +
      (scores.audioFeatureSimilarity / 100) * 25
    );

    return {
      score: Math.round(Math.min(100, similarity * 2)), // Scale up, cap at 100
      details: {
        commonTracks: scores.commonTracks,
        commonArtists: scores.commonArtists,
        audioFeatureSimilarity: Math.round(scores.audioFeatureSimilarity)
      }
    };
  }

  /**
   * Compare audio features between two sets of tracks
   */
  compareAudioFeatures(features1, features2) {
    if (!features1.length || !features2.length) return 50;

    const avgFeatures = (features) => {
      const sum = features.reduce((acc, f) => ({
        danceability: (acc.danceability || 0) + (f?.danceability || 0),
        energy: (acc.energy || 0) + (f?.energy || 0),
        valence: (acc.valence || 0) + (f?.valence || 0),
        tempo: (acc.tempo || 0) + (f?.tempo || 0),
        acousticness: (acc.acousticness || 0) + (f?.acousticness || 0)
      }), {});

      const count = features.length;
      return {
        danceability: sum.danceability / count,
        energy: sum.energy / count,
        valence: sum.valence / count,
        tempo: sum.tempo / count,
        acousticness: sum.acousticness / count
      };
    };

    const avg1 = avgFeatures(features1);
    const avg2 = avgFeatures(features2);

    // Calculate distance for each feature
    const featureDiffs = [
      Math.abs(avg1.danceability - avg2.danceability),
      Math.abs(avg1.energy - avg2.energy),
      Math.abs(avg1.valence - avg2.valence),
      Math.abs((avg1.tempo - avg2.tempo) / 200), // Normalize tempo
      Math.abs(avg1.acousticness - avg2.acousticness)
    ];

    // Average difference (0 = identical, 1 = completely different)
    const avgDiff = featureDiffs.reduce((a, b) => a + b, 0) / featureDiffs.length;
    
    // Convert to similarity score (0-100)
    return (1 - avgDiff) * 100;
  }

  /**
   * Generate the blend playlist
   */
  async generateBlend(user1Data, user2Data, options = {}) {
    const {
      size = 30,
      includeCommonOnly = false,
      balanceRatio = 0.5, // 0.5 = equal split
      name = null
    } = options;

    const blend = {
      id: uuidv4(),
      name: name || `${user1Data.userId} + ${user2Data.userId} Blend`,
      description: '',
      tracks: [],
      createdAt: new Date().toISOString(),
      users: [
        { id: user1Data.userId, platform: user1Data.platform },
        { id: user2Data.userId, platform: user2Data.platform }
      ]
    };

    // Calculate similarity
    const similarity = this.calculateTasteSimilarity(user1Data, user2Data);
    blend.similarity = similarity;
    blend.description = `Cross-platform blend • Taste match: ${similarity.score}% • ${similarity.details.commonTracks} shared tracks`;

    // 1. Find and add common tracks first
    const commonTracks = this.findCommonTracks(user1Data.allTracks, user2Data.allTracks);
    const commonToAdd = commonTracks.slice(0, Math.ceil(size * 0.3));
    
    commonToAdd.forEach(track => {
      blend.tracks.push({
        ...track,
        addedBy: 'both',
        reason: 'shared_favorite'
      });
    });

    if (includeCommonOnly) {
      return blend;
    }

    // 2. Add unique tracks from each user
    const remainingSlots = size - blend.tracks.length;
    const user1Slots = Math.ceil(remainingSlots * balanceRatio);
    const user2Slots = remainingSlots - user1Slots;

    // Get tracks that aren't already in the blend
    const blendKeys = new Set(blend.tracks.map(t => this.getTrackKey(t)));
    
    const user1UniqueTracks = user1Data.topTracks
      .filter(t => !blendKeys.has(this.getTrackKey(t)));
    const user2UniqueTracks = user2Data.topTracks
      .filter(t => !blendKeys.has(this.getTrackKey(t)));

    // Select tracks that might appeal to the other user
    const user1Picks = this.selectTracksForBlend(
      user1UniqueTracks, 
      user2Data.allTracks, 
      user1Slots
    );
    
    const user2Picks = this.selectTracksForBlend(
      user2UniqueTracks, 
      user1Data.allTracks, 
      user2Slots
    );

    // Interleave tracks from both users
    for (let i = 0; i < Math.max(user1Picks.length, user2Picks.length); i++) {
      if (user1Picks[i]) {
        blend.tracks.push({
          ...user1Picks[i].track,
          addedBy: user1Data.userId,
          reason: user1Picks[i].reason
        });
      }
      if (user2Picks[i]) {
        blend.tracks.push({
          ...user2Picks[i].track,
          addedBy: user2Data.userId,
          reason: user2Picks[i].reason
        });
      }
    }

    // Trim to exact size
    blend.tracks = blend.tracks.slice(0, size);

    return blend;
  }

  /**
   * Find common tracks between two track lists
   */
  findCommonTracks(tracks1, tracks2) {
    const keys2 = new Map(tracks2.map(t => [this.getTrackKey(t), t]));
    
    return tracks1
      .filter(t => keys2.has(this.getTrackKey(t)))
      .map(t => ({
        ...t,
        // Merge platform data
        platforms: { ...t.platforms, ...keys2.get(this.getTrackKey(t)).platforms }
      }));
  }

  /**
   * Select tracks from one user that might appeal to another
   */
  selectTracksForBlend(candidateTracks, targetUserTracks, count) {
    const targetArtists = new Set(
      targetUserTracks.flatMap(t => t.artists.map(a => a.name?.toLowerCase()))
    );

    const scored = candidateTracks.map(track => {
      let score = 0;
      let reason = 'top_track';

      // Bonus if artist is known to the other user
      const trackArtists = track.artists.map(a => a.name?.toLowerCase());
      const knownArtist = trackArtists.some(a => targetArtists.has(a));
      
      if (knownArtist) {
        score += 50;
        reason = 'familiar_artist';
      }

      // Popularity bonus (if available)
      if (track.popularity) {
        score += track.popularity * 0.3;
      }

      return { track, score, reason };
    });

    // Sort by score and take top N
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Export blend to a specific platform
   */
  async exportBlendToPlatform(blend, platform, tokens, userId) {
    const service = this.services[platform];
    if (!service) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Match all tracks to the target platform
    const matchedTracks = [];
    for (const track of blend.tracks) {
      const matched = await this.matchTrack(track, platform, tokens);
      if (matched && matched.platforms[platform]) {
        matchedTracks.push(matched);
      }
    }

    if (matchedTracks.length === 0) {
      throw new Error('Could not match any tracks to the target platform');
    }

    // Create playlist on the platform
    let playlist;
    switch (platform) {
      case 'spotify':
        playlist = await service.createPlaylist(
          tokens.accessToken,
          userId,
          blend.name,
          blend.description,
          true // public
        );
        
        const spotifyUris = matchedTracks
          .map(t => t.platforms.spotify?.uri)
          .filter(Boolean);
        
        await service.addTracksToPlaylist(
          tokens.accessToken,
          playlist.id,
          spotifyUris
        );
        break;

      case 'appleMusic':
        const appleMusicIds = matchedTracks
          .map(t => t.platforms.appleMusic?.id)
          .filter(Boolean);
        
        playlist = await service.createPlaylist(
          tokens.musicUserToken,
          blend.name,
          blend.description,
          appleMusicIds
        );
        break;

      case 'youtubeMusic':
        playlist = await service.createPlaylist(
          tokens.accessToken,
          blend.name,
          blend.description
        );
        
        const videoIds = matchedTracks
          .map(t => t.platforms.youtubeMusic?.videoId)
          .filter(Boolean);
        
        await service.addTracksToPlaylist(
          tokens.accessToken,
          playlist.id,
          videoIds
        );
        break;
    }

    return {
      platform,
      playlistId: playlist.id,
      playlistUrl: playlist.url,
      tracksAdded: matchedTracks.length,
      tracksNotMatched: blend.tracks.length - matchedTracks.length
    };
  }
}

export default new BlendEngine();
