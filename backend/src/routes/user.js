import express from 'express';
import blendEngine from '../services/blendEngine.js';

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
 * GET /api/user/profile
 * Get current user's profile with listening stats
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { tokens, ...safeUser } = req.user;
    
    res.json({
      user: safeUser,
      isTokenExpired: req.user.tokens.expiresAt < Date.now()
    });
    
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/user/top-tracks
 * Get user's top tracks from their platform
 */
router.get('/top-tracks', requireAuth, async (req, res) => {
  try {
    const userData = await blendEngine.collectUserData(
      req.user.id,
      req.user.platform,
      req.user.tokens
    );
    
    res.json({
      tracks: userData.topTracks.slice(0, 50).map(track => ({
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
    console.error('Top tracks error:', error);
    res.status(500).json({ error: 'Failed to get top tracks' });
  }
});

/**
 * GET /api/user/recent-tracks
 * Get user's recently played tracks
 */
router.get('/recent-tracks', requireAuth, async (req, res) => {
  try {
    const userData = await blendEngine.collectUserData(
      req.user.id,
      req.user.platform,
      req.user.tokens
    );
    
    res.json({
      tracks: userData.recentTracks.slice(0, 50).map(track => ({
        id: track.id,
        title: track.title,
        artists: track.artists,
        album: track.album,
        duration_ms: track.duration_ms,
        playedAt: track.playedAt
      })),
      platform: req.user.platform
    });
    
  } catch (error) {
    console.error('Recent tracks error:', error);
    res.status(500).json({ error: 'Failed to get recent tracks' });
  }
});

/**
 * GET /api/user/stats
 * Get user's listening statistics
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userData = await blendEngine.collectUserData(
      req.user.id,
      req.user.platform,
      req.user.tokens
    );
    
    // Calculate stats
    const allTracks = userData.allTracks;
    const uniqueArtists = new Set(
      allTracks.flatMap(t => t.artists.map(a => a.name))
    );
    
    // Top artists by track count
    const artistCounts = {};
    allTracks.forEach(track => {
      track.artists.forEach(artist => {
        artistCounts[artist.name] = (artistCounts[artist.name] || 0) + 1;
      });
    });
    
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, trackCount: count }));
    
    // Audio features summary (Spotify only)
    let audioFeaturesSummary = null;
    if (userData.audioFeatures && userData.audioFeatures.length > 0) {
      const features = userData.audioFeatures.filter(Boolean);
      const avg = (arr, key) => arr.reduce((sum, f) => sum + (f[key] || 0), 0) / arr.length;
      
      audioFeaturesSummary = {
        danceability: Math.round(avg(features, 'danceability') * 100),
        energy: Math.round(avg(features, 'energy') * 100),
        valence: Math.round(avg(features, 'valence') * 100), // "happiness"
        acousticness: Math.round(avg(features, 'acousticness') * 100),
        averageTempo: Math.round(avg(features, 'tempo'))
      };
    }
    
    res.json({
      platform: req.user.platform,
      stats: {
        totalTracks: allTracks.length,
        uniqueArtists: uniqueArtists.size,
        topTracksCount: userData.topTracks.length,
        recentTracksCount: userData.recentTracks.length,
        likedTracksCount: userData.likedTracks.length
      },
      topArtists,
      audioFeatures: audioFeaturesSummary
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
