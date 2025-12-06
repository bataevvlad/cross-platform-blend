import React, { useState, useEffect } from 'react';
import { Music, Music2, Youtube, Apple, Disc3, Users, Share2, Sparkles, Play, ExternalLink, Copy, Check, Loader2, ChevronRight, Heart, Shuffle } from 'lucide-react';

// ============ API Service ============
const API_BASE = 'http://127.0.0.1:3001/api';

const api = {
  async get(endpoint) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err) {
      console.error(`API GET ${endpoint} failed:`, err);
      throw err;
    }
  },
  async post(endpoint, data) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err) {
      console.error(`API POST ${endpoint} failed:`, err);
      throw err;
    }
  }
};

// ============ Platform Config ============
const PLATFORMS = {
  spotify: {
    name: 'Spotify',
    icon: Music,
    color: '#1DB954',
    gradient: 'from-green-500 to-green-600',
    bgGradient: 'from-green-500/20 to-green-600/10'
  },
  appleMusic: {
    name: 'Apple Music',
    icon: Apple,
    color: '#FA243C',
    gradient: 'from-red-500 to-pink-500',
    bgGradient: 'from-red-500/20 to-pink-500/10'
  },
  youtubeMusic: {
    name: 'YouTube Music',
    icon: Youtube,
    color: '#FF0000',
    gradient: 'from-red-600 to-red-500',
    bgGradient: 'from-red-600/20 to-red-500/10'
  }
};

// ============ Components ============

function GlowOrb({ className, color }) {
  return (
    <div 
      className={`absolute rounded-full blur-3xl opacity-30 animate-pulse ${className}`}
      style={{ background: color }}
    />
  );
}

function PlatformButton({ platform, onClick, selected, disabled }) {
  const config = PLATFORMS[platform];
  const Icon = config.icon;
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative group flex flex-col items-center gap-3 p-6 rounded-2xl
        border-2 transition-all duration-300 
        ${selected 
          ? `border-white/50 bg-gradient-to-br ${config.bgGradient}` 
          : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className={`
        p-4 rounded-xl bg-gradient-to-br ${config.gradient}
        shadow-lg group-hover:scale-110 transition-transform duration-300
      `}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <span className="font-medium text-white/90">{config.name}</span>
      {selected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
          <Check className="w-4 h-4 text-black" />
        </div>
      )}
    </button>
  );
}

function TrackCard({ track, index, showFrom }) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div
      className="group flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-200"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="w-8 text-center text-white/40 font-mono text-sm">
        {String(index + 1).padStart(2, '0')}
      </span>
      
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
        {track.album?.image ? (
          <img src={track.album.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-6 h-6 text-white/30" />
          </div>
        )}
        {isHovered && track.preview_url && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white" fill="white" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{track.title}</p>
        <p className="text-sm text-white/50 truncate">
          {typeof track.artists === 'string'
            ? track.artists
            : track.artists?.map(a => a.name).join(', ')}
        </p>
      </div>
      
      {showFrom && track.addedBy && (
        <div className={`
          px-2 py-1 rounded-full text-xs font-medium
          ${track.addedBy === 'both' 
            ? 'bg-purple-500/30 text-purple-300' 
            : 'bg-white/10 text-white/60'}
        `}>
          {track.addedBy === 'both' ? '💜 Shared' : track.reason === 'familiar_artist' ? '🎤 Artist match' : '🎵 Top pick'}
        </div>
      )}
    </div>
  );
}

function SimilarityGauge({ score }) {
  const getColor = () => {
    if (score >= 70) return 'from-green-400 to-emerald-500';
    if (score >= 40) return 'from-yellow-400 to-orange-500';
    return 'from-red-400 to-pink-500';
  };
  
  const getMessage = () => {
    if (score >= 80) return 'Musical Soulmates! 🎵💕';
    if (score >= 60) return 'Great Match! 🎶';
    if (score >= 40) return 'Interesting Mix! 🌈';
    return 'Opposite Tastes! 🔀';
  };

  return (
    <div className="text-center">
      <div className="relative w-32 h-32 mx-auto mb-4">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${score * 2.83} 283`}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">{score}%</span>
        </div>
      </div>
      <p className="text-lg font-medium text-white/80">{getMessage()}</p>
    </div>
  );
}

// ============ Pages ============

function LandingPage({ onStart }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" />
      <GlowOrb className="w-96 h-96 -top-48 -left-48" color="#8B5CF6" />
      <GlowOrb className="w-96 h-96 -bottom-48 -right-48" color="#EC4899" />
      <GlowOrb className="w-64 h-64 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="#06B6D4" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-3xl mx-auto">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-purple-500/50">
                <Disc3 className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-200 to-pink-200 mb-6 leading-tight">
            Cross-Platform
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Music Blend
            </span>
          </h1>
          
          <p className="text-xl text-white/60 mb-12 max-w-xl mx-auto leading-relaxed">
            Create musical connections across platforms. 
            Blend your taste with friends on Spotify, Apple Music, or YouTube Music.
          </p>
          
          {/* Platform icons */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {Object.entries(PLATFORMS).map(([key, config], i) => (
              <div 
                key={key}
                className={`
                  w-14 h-14 rounded-xl bg-gradient-to-br ${config.gradient}
                  flex items-center justify-center shadow-lg
                  animate-bounce
                `}
                style={{ animationDelay: `${i * 0.1}s`, animationDuration: '2s' }}
              >
                <config.icon className="w-7 h-7 text-white" />
              </div>
            ))}
          </div>
          
          {/* CTA Button */}
          <button
            onClick={onStart}
            className="group relative px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl font-bold text-lg text-white shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
          >
            <span className="flex items-center gap-2">
              Start Blending
              <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
            </span>
          </button>
          
          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            {[
              { icon: Share2, title: 'Cross-Platform', desc: 'Connect with friends on any service' },
              { icon: Heart, title: 'Taste Match', desc: 'Discover your musical compatibility' },
              { icon: Shuffle, title: 'Smart Blend', desc: 'AI-curated playlist for both of you' }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
                <Icon className="w-8 h-8 text-purple-400 mb-4" />
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-white/50 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectPage({ onConnect }) {
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  
  const handleConnect = () => {
    if (!selectedPlatform) return;
    const authPath = {
      spotify: 'spotify',
      appleMusic: 'apple-music',
      youtubeMusic: 'youtube'
    }[selectedPlatform];
    window.location.href = `${API_BASE}/auth/${authPath}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" />
      <GlowOrb className="w-96 h-96 top-0 right-0" color="#8B5CF6" />
      
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Connect Your Music
          </h2>
          <p className="text-white/60 mb-12">
            Choose your streaming platform to get started
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            {Object.entries(PLATFORMS).map(([key, config]) => (
              <PlatformButton
                key={key}
                platform={key}
                selected={selectedPlatform === key}
                onClick={() => setSelectedPlatform(key)}
              />
            ))}
          </div>
          
          <button
            onClick={handleConnect}
            disabled={!selectedPlatform}
            className={`
              px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300
              ${selectedPlatform 
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:scale-105' 
                : 'bg-white/10 text-white/30 cursor-not-allowed'}
            `}
          >
            Connect {selectedPlatform ? PLATFORMS[selectedPlatform].name : 'Platform'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ user, onCreateBlend, onViewBlend }) {
  const [blends, setBlends] = useState([]);
  const [loading, setLoading] = useState(true);

  const platformConfig = PLATFORMS[user?.platform];

  useEffect(() => {
    api.get('/blend/my-sessions')
      .then(data => setBlends(data.sessions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" />
      
      <div className="relative z-10 p-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${platformConfig?.gradient || 'from-purple-500 to-pink-500'} flex items-center justify-center`}>
              {platformConfig?.icon && <platformConfig.icon className="w-7 h-7 text-white" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{user?.displayName}</h1>
              <p className="text-white/50">{platformConfig?.name}</p>
            </div>
          </div>
          
          <button
            onClick={onCreateBlend}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium text-white hover:scale-105 transition-transform"
          >
            <Sparkles className="w-5 h-5" />
            New Blend
          </button>
        </header>
        
        {/* Blends Grid */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6">Your Blends</h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : blends.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
              <Disc3 className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">No blends yet</p>
              <p className="text-white/30 text-sm">Create your first blend with a friend!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {blends.map(blend => (
                <div
                  key={blend.id}
                  onClick={() => onViewBlend(blend.id)}
                  className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-4">
                    {blend.users?.map((u, i) => (
                      <div
                        key={i}
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${PLATFORMS[u.platform]?.gradient || 'from-gray-500 to-gray-600'} flex items-center justify-center ${i > 0 ? '-ml-3' : ''}`}
                      >
                        {u.image ? (
                          <img src={u.image} alt="" className="w-full h-full rounded-full" />
                        ) : (
                          <span className="text-white font-bold text-sm">{u.displayName?.[0]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <h3 className="font-bold text-white mb-1">{blend.blend?.name || 'Pending Blend'}</h3>
                  <div className="flex items-center gap-2 text-sm text-white/50">
                    {blend.blend?.similarity && (
                      <span className="text-purple-400">{blend.blend.similarity}% match</span>
                    )}
                    {blend.blend?.trackCount && (
                      <>
                        <span>•</span>
                        <span>{blend.blend.trackCount} tracks</span>
                      </>
                    )}
                    <span>•</span>
                    <span className={blend.status === 'ready' ? 'text-green-400' : 'text-yellow-400'}>
                      {blend.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateBlendPage({ user, onBack }) {
  const [step, setStep] = useState('create'); // create, waiting, ready
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blend, setBlend] = useState(null);
  const [session, setSession] = useState(null);

  const createSession = async () => {
    setLoading(true);
    try {
      const result = await api.post('/blend/create-session', { name: `${user.displayName}'s Blend` });
      setInviteCode(result.inviteCode);
      setSession(result);
      setStep('waiting');
      pollSession(result.sessionId);
    } catch (error) {
      console.error('Create session error:', error);
      alert('Failed to create blend: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const joinSession = async (code) => {
    if (!code || !code.trim()) {
      alert('Please enter an invite code');
      return;
    }
    setLoading(true);
    try {
      const result = await api.post(`/blend/join/${code.trim().toUpperCase()}`, {});
      setInviteCode(code.trim().toUpperCase());

      if (result.blend) {
        // Blend is ready, get full session data
        const sessionData = await api.get(`/blend/session/${result.sessionId}`);
        setBlend(sessionData.blend);
        setSession(sessionData);
        setStep('ready');
      } else {
        // Wait for other user
        setSession(result);
        setStep('waiting');
        pollSession(result.sessionId);
      }
    } catch (error) {
      console.error('Join session error:', error);
      alert('Failed to join blend: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const pollSession = async (sessionId) => {
    const interval = setInterval(async () => {
      try {
        const sessionData = await api.get(`/blend/session/${sessionId}`);
        setSession(sessionData);
        if (sessionData.status === 'ready' && sessionData.blend) {
          clearInterval(interval);
          setBlend(sessionData.blend);
          setStep('ready');
        }
      } catch (error) {
        console.error(error);
      }
    }, 3000);
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/blend/join/${inviteCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportToplatform = async () => {
    setLoading(true);
    try {
      const result = await api.post(`/blend/${session.sessionId}/export/${user.platform}`, {});
      if (result.playlistId) {
        // Open directly in Spotify desktop app
        const spotifyUri = `spotify:playlist:${result.playlistId}`;
        window.location.href = spotifyUri;
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" />
      <GlowOrb className="w-96 h-96 top-20 right-20" color="#8B5CF6" />
      <GlowOrb className="w-64 h-64 bottom-20 left-20" color="#EC4899" />
      
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        {step === 'create' && (
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Users className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">Create a Blend</h2>
            <p className="text-white/60 mb-8">
              Start a new blend session and invite a friend from any platform
            </p>
            
            <div className="space-y-4">
              <button
                onClick={createSession}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-bold text-white hover:scale-105 transition-transform disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  'Create New Blend'
                )}
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 bg-slate-950 text-white/40 text-sm">or</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter invite code"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && e.target.value && joinSession(e.target.value)}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector('input');
                    if (input.value) joinSession(input.value);
                  }}
                  className="px-6 py-3 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
            
            <button
              onClick={onBack}
              className="mt-8 text-white/50 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        )}
        
        {step === 'waiting' && (
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">Waiting for Friend</h2>
            <p className="text-white/60 mb-8">
              Share this code with a friend to create your blend
            </p>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
              <p className="text-sm text-white/50 mb-2">Invite Code</p>
              <p className="text-4xl font-mono font-bold text-white tracking-wider mb-4">
                {inviteCode}
              </p>
              <button
                onClick={copyInvite}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
            
            {session?.users?.length > 0 && (
              <div className="flex items-center justify-center gap-2 text-white/60">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span>{session.users.length}/2 users connected</span>
              </div>
            )}
          </div>
        )}
        
        {step === 'ready' && blend && (
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <SimilarityGauge score={blend.similarity?.score || 0} />
              <h2 className="text-3xl font-bold text-white mt-6 mb-2">{blend.name}</h2>
              <p className="text-white/60">{blend.description}</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">Your Blend Playlist</h3>
                <span className="text-white/50">{blend.tracks?.length} tracks</span>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {blend.tracks?.map((track, i) => (
                  <TrackCard key={track.id} track={track} index={i} showFrom />
                ))}
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={exportToplatform}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-bold text-white hover:scale-105 transition-transform disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="w-5 h-5" />
                    Export to {PLATFORMS[user?.platform]?.name}
                  </>
                )}
              </button>
              <button
                onClick={onBack}
                className="px-6 py-4 bg-white/10 rounded-xl font-bold text-white hover:bg-white/20 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewBlendPage({ user, sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get(`/blend/session/${sessionId}`)
      .then(data => setSession(data))
      .catch(err => {
        console.error('Failed to load session:', err);
        alert('Failed to load blend');
        onBack();
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const exportToplatform = async () => {
    setExporting(true);
    try {
      const result = await api.post(`/blend/${sessionId}/export/${user.platform}`, {});
      if (result.playlistUrl) {
        // Convert web URL to desktop app URI and open it
        // Spotify web URL: https://open.spotify.com/playlist/xxxxx
        // Spotify URI: spotify:playlist:xxxxx
        const playlistId = result.playlistId;
        const spotifyUri = `spotify:playlist:${playlistId}`;
        window.location.href = spotifyUri;
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
      </div>
    );
  }

  const blend = session?.blend;

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" />
      <GlowOrb className="w-96 h-96 top-20 right-20" color="#8B5CF6" />
      <GlowOrb className="w-64 h-64 bottom-20 left-20" color="#EC4899" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        {blend ? (
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <SimilarityGauge score={blend.similarity?.score || 0} />
              <h2 className="text-3xl font-bold text-white mt-6 mb-2">{blend.name}</h2>
              <p className="text-white/60">{blend.description}</p>

              <div className="flex items-center justify-center gap-4 mt-4">
                {session.users?.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${PLATFORMS[u.platform]?.gradient || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                      {u.image ? (
                        <img src={u.image} alt="" className="w-full h-full rounded-full" />
                      ) : (
                        <span className="text-white font-bold text-xs">{u.displayName?.[0]}</span>
                      )}
                    </div>
                    <span className="text-white/70 text-sm">{u.displayName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">Playlist</h3>
                <span className="text-white/50">{blend.tracks?.length} tracks</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {blend.tracks?.map((track, i) => (
                  <TrackCard key={track.id || i} track={track} index={i} showFrom />
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={exportToplatform}
                disabled={exporting}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-bold text-white hover:scale-105 transition-transform disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="w-5 h-5" />
                    Export to {PLATFORMS[user?.platform]?.name}
                  </>
                )}
              </button>
              <button
                onClick={onBack}
                className="px-6 py-4 bg-white/10 rounded-xl font-bold text-white hover:bg-white/20 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-purple-400 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Waiting for Friend</h2>
            <p className="text-white/60 mb-4">Share this code with a friend</p>
            <p className="text-4xl font-mono font-bold text-white tracking-wider mb-6">
              {session?.inviteCode}
            </p>
            <button
              onClick={onBack}
              className="text-white/50 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Main App ============

export default function App() {
  const [page, setPage] = useState('landing');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    // Check for existing session
    const checkAuth = async () => {
      try {
        const data = await api.get('/auth/me');
        setUser(data.user);
        setPage('dashboard');
        // Clear auth params from URL
        if (window.location.search.includes('auth=success')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (err) {
        console.log('Not authenticated:', err.message);
        // Not logged in - stay on landing page
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const viewBlend = (sessionId) => {
    setSelectedSessionId(sessionId);
    setPage('view');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
      </div>
    );
  }

  switch (page) {
    case 'landing':
      return <LandingPage onStart={() => setPage('connect')} />;
    case 'connect':
      return <ConnectPage onConnect={() => {}} />;
    case 'dashboard':
      return <DashboardPage user={user} onCreateBlend={() => setPage('create')} onViewBlend={viewBlend} />;
    case 'create':
      return <CreateBlendPage user={user} onBack={() => setPage('dashboard')} />;
    case 'view':
      return <ViewBlendPage user={user} sessionId={selectedSessionId} onBack={() => setPage('dashboard')} />;
    default:
      return <LandingPage onStart={() => setPage('connect')} />;
  }
}
