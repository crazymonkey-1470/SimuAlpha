/**
 * SimuAlpha Auth Middleware
 * Bearer token authentication using hashed API keys stored in Supabase.
 */

const crypto = require('crypto');
const supabase = require('../services/supabase');

// In-memory rate limit cache (sufficient for single-instance Railway deployment)
const rateLimitCache = new Map();

function requireAuth(...requiredScopes) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: key, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', hash)
      .eq('is_active', true)
      .single();

    if (error || !key) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ success: false, error: 'API key expired' });
    }

    if (requiredScopes.length > 0) {
      const hasScope = requiredScopes.some(s => key.scopes.includes(s));
      if (!hasScope) {
        return res.status(403).json({ success: false, error: `Requires scope: ${requiredScopes.join(' or ')}` });
      }
    }

    // Rate limiting (per-minute)
    const now = Date.now();
    const minuteWindow = Math.floor(now / 60000);
    const minuteKey = `${key.id}:${minuteWindow}`;
    const currentCount = rateLimitCache.get(minuteKey) || 0;

    if (currentCount >= key.rate_limit_per_minute) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retry_after_seconds: 60 - (Math.floor(now / 1000) % 60),
      });
    }

    rateLimitCache.set(minuteKey, currentCount + 1);

    // Cleanup old entries
    if (rateLimitCache.size > 1000) {
      for (const [k] of rateLimitCache) {
        const windowNum = parseInt(k.split(':')[1]);
        if (windowNum < minuteWindow - 2) rateLimitCache.delete(k);
      }
    }

    // Update last_used_at (fire-and-forget)
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => {});

    req.apiKey = { id: key.id, name: key.name, scopes: key.scopes };
    next();
  };
}

module.exports = { requireAuth };
