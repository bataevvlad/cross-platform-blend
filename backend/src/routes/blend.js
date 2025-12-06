import express from 'express';
import { v4 as uuidv4 } from 'uuid';
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
 * POST /api/blend/create-session
 * Create a new blend session and get an invite code
 */
router.post('/create-session', requireAuth, async (req, res) => {
  try {
    // Collect user's music data
    const userData = await blendEngine.collectUserData(
      req.user.id,
      req.user.platform,
      req.user.tokens
    );

    // Generate unique invite code
    const inviteCode = uuidv4().slice(0, 8).toUpperCase();
    
    // Create blend session
    const session = {
      id: uuidv4(),
      inviteCode,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      users: [{
        id: req.user.id,
        platform: req.user.platform,
        displayName: req.user.displayName,
        image: req.user.image,
        data: userData
      }],
      blend: null
    };

    // Store session
    req.app.locals.blendSessions.set(session.id, session);
    req.app.locals.pendingBlends.set(inviteCode, session.id);

    res.json({
      sessionId: session.id,
      inviteCode,
      inviteUrl: `${process.env.FRONTEND_URL}/blend/join/${inviteCode}`,
      user: {
        id: req.user.id,
        platform: req.user.platform,
        displayName: req.user.displayName,
        tracksCollected: userData.allTracks.length
      }
    });

  } catch (err) {
    console.error('Create session error:', err.message);
    console.error('Full error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to create blend session', details: err.message });
  }
});

/**
 * POST /api/blend/join/:inviteCode
 * Join an existing blend session
 */
router.post('/join/:inviteCode', requireAuth, async (req, res) => {
  const { inviteCode } = req.params;
  
  // Find session by invite code
  const sessionId = req.app.locals.pendingBlends.get(inviteCode.toUpperCase());
  if (!sessionId) {
    return res.status(404).json({ error: 'Invalid invite code' });
  }

  const session = req.app.locals.blendSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Check if user already in session
  if (session.users.some(u => u.id === req.user.id)) {
    return res.status(400).json({ error: 'Already in this blend session' });
  }

  // Check if session is full
  if (session.users.length >= 2) {
    return res.status(400).json({ error: 'Blend session is full' });
  }

  try {
    // Collect user's music data
    const userData = await blendEngine.collectUserData(
      req.user.id,
      req.user.platform,
      req.user.tokens
    );

    // Add user to session
    session.users.push({
      id: req.user.id,
      platform: req.user.platform,
      displayName: req.user.displayName,
      image: req.user.image,
      data: userData
    });

    // Generate blend if we have 2 users
    if (session.users.length === 2) {
      const blend = await blendEngine.generateBlend(
        session.users[0].data,
        session.users[1].data,
        {
          size: 30,
          name: `${session.users[0].displayName} + ${session.users[1].displayName} Blend`
        }
      );

      session.blend = blend;
      session.status = 'ready';
      
      // Clean up invite code
      req.app.locals.pendingBlends.delete(inviteCode.toUpperCase());
    }

    req.app.locals.blendSessions.set(sessionId, session);

    res.json({
      sessionId: session.id,
      status: session.status,
      users: session.users.map(u => ({
        id: u.id,
        platform: u.platform,
        displayName: u.displayName,
        image: u.image,
        tracksCollected: u.data.allTracks.length
      })),
      blend: session.blend ? {
        id: session.blend.id,
        name: session.blend.name,
        similarity: session.blend.similarity,
        trackCount: session.blend.tracks.length,
        preview: session.blend.tracks.slice(0, 5)
      } : null
    });

  } catch (err) {
    console.error('Join session error:', err);
    res.status(500).json({ error: 'Failed to join blend session' });
  }
});

/**
 * GET /api/blend/session/:sessionId
 * Get blend session status and data
 */
router.get('/session/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  
  const session = req.app.locals.blendSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Check if user is part of this session
  if (!session.users.some(u => u.id === req.user.id)) {
    return res.status(403).json({ error: 'Not authorized to view this session' });
  }

  res.json({
    sessionId: session.id,
    inviteCode: session.status === 'pending' ? session.inviteCode : null,
    status: session.status,
    createdAt: session.createdAt,
    users: session.users.map(u => ({
      id: u.id,
      platform: u.platform,
      displayName: u.displayName,
      image: u.image,
      tracksCollected: u.data.allTracks.length,
      isCurrentUser: u.id === req.user.id
    })),
    blend: session.blend ? {
      id: session.blend.id,
      name: session.blend.name,
      description: session.blend.description,
      similarity: session.blend.similarity,
      trackCount: session.blend.tracks.length,
      tracks: session.blend.tracks.map(t => ({
        id: t.id,
        title: t.title,
        artists: t.artists.map(a => a.name).join(', '),
        album: t.album?.name,
        albumArt: t.album?.image,
        addedBy: t.addedBy,
        reason: t.reason,
        platforms: Object.keys(t.platforms)
      }))
    } : null
  });
});

/**
 * POST /api/blend/:sessionId/regenerate
 * Regenerate blend with different options
 */
router.post('/:sessionId/regenerate', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { size, includeCommonOnly, balanceRatio } = req.body;

  const session = req.app.locals.blendSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.users.some(u => u.id === req.user.id)) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (session.users.length < 2) {
    return res.status(400).json({ error: 'Need 2 users to generate blend' });
  }

  try {
    const blend = await blendEngine.generateBlend(
      session.users[0].data,
      session.users[1].data,
      {
        size: size || 30,
        includeCommonOnly: includeCommonOnly || false,
        balanceRatio: balanceRatio || 0.5,
        name: `${session.users[0].displayName} + ${session.users[1].displayName} Blend`
      }
    );

    session.blend = blend;
    req.app.locals.blendSessions.set(sessionId, session);

    res.json({
      success: true,
      blend: {
        id: blend.id,
        name: blend.name,
        description: blend.description,
        similarity: blend.similarity,
        trackCount: blend.tracks.length,
        tracks: blend.tracks.map(t => ({
          id: t.id,
          title: t.title,
          artists: t.artists.map(a => a.name).join(', '),
          album: t.album?.name,
          albumArt: t.album?.image,
          addedBy: t.addedBy,
          reason: t.reason
        }))
      }
    });

  } catch (err) {
    console.error('Regenerate blend error:', err);
    res.status(500).json({ error: 'Failed to regenerate blend' });
  }
});

/**
 * POST /api/blend/:sessionId/export/:platform
 * Export blend to a specific platform
 */
router.post('/:sessionId/export/:platform', requireAuth, async (req, res) => {
  const { sessionId, platform } = req.params;

  const session = req.app.locals.blendSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.blend) {
    return res.status(400).json({ error: 'No blend to export' });
  }

  // Find user data for export
  const user = session.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Check if user's platform matches or if they have tokens for target platform
  const currentUser = req.app.locals.users.get(req.user.id);
  if (currentUser.platform !== platform) {
    return res.status(400).json({ 
      error: `You need to be logged into ${platform} to export there` 
    });
  }

  try {
    const result = await blendEngine.exportBlendToPlatform(
      session.blend,
      platform,
      currentUser.tokens,
      currentUser.platformUserId
    );

    // Store export info
    if (!session.exports) session.exports = [];
    session.exports.push({
      platform,
      userId: req.user.id,
      exportedAt: new Date().toISOString(),
      ...result
    });
    
    req.app.locals.blendSessions.set(sessionId, session);

    res.json({
      success: true,
      platform,
      playlistId: result.playlistId,
      playlistUrl: result.playlistUrl,
      tracksAdded: result.tracksAdded,
      tracksNotMatched: result.tracksNotMatched
    });

  } catch (err) {
    console.error('Export blend error:', err);
    res.status(500).json({ error: 'Failed to export blend' });
  }
});

/**
 * GET /api/blend/my-sessions
 * Get all blend sessions for current user
 */
router.get('/my-sessions', requireAuth, (req, res) => {
  const userSessions = [];
  
  for (const [id, session] of req.app.locals.blendSessions) {
    if (session.users.some(u => u.id === req.user.id)) {
      userSessions.push({
        id: session.id,
        status: session.status,
        createdAt: session.createdAt,
        inviteCode: session.status === 'pending' ? session.inviteCode : null,
        users: session.users.map(u => ({
          displayName: u.displayName,
          platform: u.platform,
          image: u.image
        })),
        blend: session.blend ? {
          name: session.blend.name,
          similarity: session.blend.similarity?.score,
          trackCount: session.blend.tracks.length
        } : null
      });
    }
  }

  res.json({
    sessions: userSessions.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  });
});

/**
 * DELETE /api/blend/session/:sessionId
 * Delete a blend session
 */
router.delete('/session/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  
  const session = req.app.locals.blendSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only creator can delete
  if (session.createdBy !== req.user.id) {
    return res.status(403).json({ error: 'Only session creator can delete' });
  }

  // Clean up
  if (session.inviteCode) {
    req.app.locals.pendingBlends.delete(session.inviteCode);
  }
  req.app.locals.blendSessions.delete(sessionId);

  res.json({ success: true });
});

export default router;
