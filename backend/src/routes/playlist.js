import express from 'express';
import spotifyService from '../services/spotify.js';
import appleMusicService from '../services/appleMusic.js';
import youtubeMusicService from '../services/youtubeMusic.js';

const router = express.Router();

/**
 * Middleware to check authentication
 */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = req.app.locals.users.get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  req.user = user;
  next();
}

/**
 * GET /api/playlist/user-playlists
 * Get user's playlists from their platform
 */
router.get('/user-playlists', requireAuth, async (req, res) => {
  try {
    let playlists = [];
    
    switch (req.user.platform) {
      case 'spotify':
        // Spotify requires additional endpoint
        const response = await fetch(
          `https://api.spotify.com/v1/me/playlists?limit=50`,
          {
            headers: { 
              'Authorization': `Bearer ${req.user.tokens.accessToken}` 
            }
          }
        );
        const data = await response.json();
        playlists = data.items?.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          trackCount: p.tracks?.total,
          image: p.images?.[0]?.url,
          isPublic: p.public,
          url: p.external_urls?.spotify
        })) || [];
        break;
        
      case 'appleMusic':
        playlists = await appleMusicService.getUserPlaylists(
          req.user.tokens.musicUserToken
        );
        break;
        
      case 'youtubeMusic':
        playlists = await youtubeMusicService.getUserPlaylists(
          req.user.tokens.accessToken
        );
        break;
    }
    
    res.json({ 
      playlists,
      platform: req.user.platform 
    });
    
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists' });
  }
});

/**
 * POST /api/playlist/create
 * Create a new playlist on user's platform
 */
router.post('/create', requireAuth, async (req, res) => {
  const { name, description, isPublic = true, trackIds = [] } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }
  
  try {
    let playlist;
    
    switch (req.user.platform) {
      case 'spotify':
        playlist = await spotifyService.createPlaylist(
          req.user.tokens.accessToken,
          req.user.platformUserId,
          name,
          description,
          isPublic
        );
        
        // Add tracks if provided
        if (trackIds.length > 0) {
          const uris = trackIds.map(id => `spotify:track:${id}`);
          await spotifyService.addTracksToPlaylist(
            req.user.tokens.accessToken,
            playlist.id,
            uris
          );
        }
        break;
        
      case 'appleMusic':
        playlist = await appleMusicService.createPlaylist(
          req.user.tokens.musicUserToken,
          name,
          description,
          trackIds
        );
        break;
        
      case 'youtubeMusic':
        playlist = await youtubeMusicService.createPlaylist(
          req.user.tokens.accessToken,
          name,
          description,
          isPublic ? 'PUBLIC' : 'PRIVATE'
        );
        
        if (trackIds.length > 0) {
          await youtubeMusicService.addTracksToPlaylist(
            req.user.tokens.accessToken,
            playlist.id,
            trackIds
          );
        }
        break;
    }
    
    res.json({
      success: true,
      playlist,
      platform: req.user.platform
    });
    
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

/**
 * POST /api/playlist/:id/add-tracks
 * Add tracks to an existing playlist
 */
router.post('/:id/add-tracks', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { trackIds } = req.body;
  
  if (!trackIds || trackIds.length === 0) {
    return res.status(400).json({ error: 'Track IDs are required' });
  }
  
  try {
    switch (req.user.platform) {
      case 'spotify':
        const uris = trackIds.map(trackId => `spotify:track:${trackId}`);
        await spotifyService.addTracksToPlaylist(
          req.user.tokens.accessToken,
          id,
          uris
        );
        break;
        
      case 'appleMusic':
        await appleMusicService.addTracksToPlaylist(
          req.user.tokens.musicUserToken,
          id,
          trackIds
        );
        break;
        
      case 'youtubeMusic':
        await youtubeMusicService.addTracksToPlaylist(
          req.user.tokens.accessToken,
          id,
          trackIds
        );
        break;
    }
    
    res.json({
      success: true,
      tracksAdded: trackIds.length
    });
    
  } catch (error) {
    console.error('Add tracks error:', error);
    res.status(500).json({ error: 'Failed to add tracks to playlist' });
  }
});

/**
 * GET /api/playlist/search
 * Search for tracks across the user's platform
 */
router.get('/search', requireAuth, async (req, res) => {
  const { q, limit = 20 } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  try {
    let tracks = [];
    
    switch (req.user.platform) {
      case 'spotify':
        tracks = await spotifyService.searchTracks(
          req.user.tokens.accessToken,
          q,
          parseInt(limit)
        );
        break;
        
      case 'appleMusic':
        tracks = await appleMusicService.searchTracks(
          req.user.tokens.musicUserToken,
          q,
          req.user.storefront || 'us',
          parseInt(limit)
        );
        break;
        
      case 'youtubeMusic':
        tracks = await youtubeMusicService.searchTracks(
          req.user.tokens.accessToken,
          q,
          parseInt(limit)
        );
        break;
    }
    
    res.json({
      query: q,
      tracks: tracks.map(track => ({
        id: track.id,
        title: track.title,
        artists: track.artists,
        album: track.album,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url
      })),
      platform: req.user.platform
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search tracks' });
  }
});

export default router;
