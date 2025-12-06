import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import spotifyService from '../services/spotify.js';
import appleMusicService from '../services/appleMusic.js';
import youtubeMusicService from '../services/youtubeMusic.js';

const router = express.Router();

/**
 * Generate state parameter for OAuth
 */
function generateState() {
  return uuidv4();
}

// ==================== SPOTIFY AUTH ====================

/**
 * GET /api/auth/spotify
 * Initiates Spotify OAuth flow
 */
router.get('/spotify', (req, res) => {
  const state = generateState();
  req.session.oauthState = state;
  req.session.returnTo = req.query.returnTo || '/';
  
  const authUrl = spotifyService.getAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/spotify/callback
 * Handles Spotify OAuth callback
 */
router.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    return res.redirect(`${frontendUrl}/auth/error?error=${encodeURIComponent(error)}`);
  }

  if (state !== req.session.oauthState) {
    return res.redirect(`${frontendUrl}/auth/error?error=state_mismatch`);
  }

  try {
    // Exchange code for tokens
    const tokens = await spotifyService.exchangeCode(code);
    
    // Get user profile
    const profile = await spotifyService.getUserProfile(tokens.accessToken);
    
    // Store user data
    const userId = `spotify:${profile.id}`;
    const userData = {
      id: userId,
      platform: 'spotify',
      platformUserId: profile.id,
      displayName: profile.displayName,
      email: profile.email,
      image: profile.images?.[0]?.url,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + (tokens.expiresIn * 1000)
      },
      createdAt: new Date().toISOString()
    };

    // Store in app locals (use DB in production)
    req.app.locals.users.set(userId, userData);

    // Set session
    req.session.userId = userId;
    req.session.platform = 'spotify';

    // Save session explicitly before redirecting (important for Safari)
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${frontendUrl}/auth/error?error=session_save_failed`);
      }

      console.log('Spotify auth successful, session saved:', { userId, sessionId: req.sessionID });

      // Redirect to frontend with success
      const returnTo = req.session.returnTo || '/';
      res.redirect(`${frontendUrl}${returnTo}?auth=success&platform=spotify`);
    });

  } catch (err) {
    console.error('Spotify auth error:', err);
    res.redirect(`${frontendUrl}/auth/error?error=token_exchange_failed`);
  }
});

/**
 * POST /api/auth/spotify/refresh
 * Refresh Spotify access token
 */
router.post('/spotify/refresh', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = req.app.locals.users.get(userId);
  if (!user || user.platform !== 'spotify') {
    return res.status(401).json({ error: 'Invalid user' });
  }

  try {
    const newTokens = await spotifyService.refreshToken(user.tokens.refreshToken);
    
    user.tokens.accessToken = newTokens.accessToken;
    user.tokens.expiresAt = Date.now() + (newTokens.expiresIn * 1000);
    
    req.app.locals.users.set(userId, user);
    
    res.json({ 
      success: true, 
      expiresAt: user.tokens.expiresAt 
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// ==================== APPLE MUSIC AUTH ====================

/**
 * GET /api/auth/apple-music/config
 * Returns MusicKit configuration for frontend
 */
router.get('/apple-music/config', (req, res) => {
  try {
    const config = appleMusicService.getMusicKitConfig();
    res.json(config);
  } catch (err) {
    console.error('Apple Music config error:', err);
    res.status(500).json({ error: 'Failed to generate MusicKit config' });
  }
});

/**
 * POST /api/auth/apple-music/callback
 * Receives Music User Token from frontend MusicKit auth
 */
router.post('/apple-music/callback', async (req, res) => {
  const { musicUserToken, userData } = req.body;

  if (!musicUserToken) {
    return res.status(400).json({ error: 'Missing musicUserToken' });
  }

  try {
    // Verify token by making a test request
    const storefront = await appleMusicService.getUserStorefront(musicUserToken);
    
    // Create user record
    const userId = `appleMusic:${userData?.id || uuidv4()}`;
    const userRecord = {
      id: userId,
      platform: 'appleMusic',
      platformUserId: userData?.id,
      displayName: userData?.name || 'Apple Music User',
      email: userData?.email,
      image: null,
      storefront,
      tokens: {
        musicUserToken,
        // Apple Music tokens last ~6 months but no refresh mechanism
        expiresAt: Date.now() + (180 * 24 * 60 * 60 * 1000)
      },
      createdAt: new Date().toISOString()
    };

    req.app.locals.users.set(userId, userRecord);
    
    req.session.userId = userId;
    req.session.platform = 'appleMusic';

    res.json({ 
      success: true, 
      userId,
      storefront 
    });

  } catch (err) {
    console.error('Apple Music auth error:', err);
    res.status(500).json({ error: 'Failed to authenticate with Apple Music' });
  }
});

// ==================== YOUTUBE MUSIC AUTH ====================

/**
 * GET /api/auth/youtube
 * Initiates YouTube Music (Google) OAuth flow
 */
router.get('/youtube', (req, res) => {
  const state = generateState();
  req.session.oauthState = state;
  req.session.returnTo = req.query.returnTo || '/';
  
  const authUrl = youtubeMusicService.getAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/youtube/callback
 * Handles YouTube Music OAuth callback
 */
router.get('/youtube/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    return res.redirect(`${frontendUrl}/auth/error?error=${encodeURIComponent(error)}`);
  }

  if (state !== req.session.oauthState) {
    return res.redirect(`${frontendUrl}/auth/error?error=state_mismatch`);
  }

  try {
    const tokens = await youtubeMusicService.exchangeCode(code);
    
    // Decode ID token to get user info
    const idTokenParts = tokens.idToken.split('.');
    const userInfo = JSON.parse(Buffer.from(idTokenParts[1], 'base64').toString());
    
    const userId = `youtube:${userInfo.sub}`;
    const userData = {
      id: userId,
      platform: 'youtubeMusic',
      platformUserId: userInfo.sub,
      displayName: userInfo.name,
      email: userInfo.email,
      image: userInfo.picture,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + (tokens.expiresIn * 1000)
      },
      createdAt: new Date().toISOString()
    };

    req.app.locals.users.set(userId, userData);

    req.session.userId = userId;
    req.session.platform = 'youtubeMusic';

    // Save session explicitly before redirecting
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${frontendUrl}/auth/error?error=session_save_failed`);
      }

      console.log('YouTube auth successful, session saved:', { userId, sessionId: req.sessionID });

      const returnTo = req.session.returnTo || '/';
      res.redirect(`${frontendUrl}${returnTo}?auth=success&platform=youtube`);
    });

  } catch (err) {
    console.error('YouTube auth error:', err);
    res.redirect(`${frontendUrl}/auth/error?error=token_exchange_failed`);
  }
});

/**
 * POST /api/auth/youtube/refresh
 * Refresh YouTube access token
 */
router.post('/youtube/refresh', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = req.app.locals.users.get(userId);
  if (!user || user.platform !== 'youtubeMusic') {
    return res.status(401).json({ error: 'Invalid user' });
  }

  try {
    const newTokens = await youtubeMusicService.refreshToken(user.tokens.refreshToken);
    
    user.tokens.accessToken = newTokens.accessToken;
    user.tokens.expiresAt = Date.now() + (newTokens.expiresIn * 1000);
    
    req.app.locals.users.set(userId, user);
    
    res.json({ 
      success: true, 
      expiresAt: user.tokens.expiresAt 
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// ==================== GENERAL AUTH ====================

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', (req, res) => {
  console.log('GET /auth/me - Session:', {
    id: req.sessionID?.slice(0, 8),
    userId: req.session?.userId,
    platform: req.session?.platform,
    cookie: req.headers.cookie?.slice(0, 50)
  });

  const userId = req.session.userId;

  if (!userId) {
    console.log('No userId in session');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = req.app.locals.users.get(userId);

  if (!user) {
    console.log('User not found in storage:', userId);
    return res.status(401).json({ error: 'User not found' });
  }

  console.log('User found:', { id: user.id, displayName: user.displayName });

  // Don't expose tokens
  const { tokens, ...safeUser } = user;

  res.json({
    user: safeUser,
    isTokenExpired: user.tokens.expiresAt < Date.now()
  });
});

/**
 * POST /api/auth/logout
 * Log out current user
 */
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

export default router;
