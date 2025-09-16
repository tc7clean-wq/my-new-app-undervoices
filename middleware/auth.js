// Authentication Middleware
// JWT-based authentication with Supabase integration

const jwt = require('jsonwebtoken');
const { getSupabase } = require('../config/supabase');
const { cache, CacheKeys } = require('../config/cache');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token expired');
    }
    throw new AuthenticationError('Invalid token');
  }
};

// Generate JWT tokens
const generateTokens = (userId, email) => {
  const accessToken = jwt.sign(
    { userId, email, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );

  return { accessToken, refreshToken };
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);

    // Check token in cache first (for revoked tokens)
    const isRevoked = cache.get(`revoked:${token}`);
    if (isRevoked) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify token
    const decoded = verifyToken(token);

    // Check user session in cache
    const cachedUser = cache.get(`${CacheKeys.SESSION}${decoded.userId}`);
    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    // Fetch user from database
    const supabase = getSupabase();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !profile) {
      throw new AuthenticationError('User not found');
    }

    // Update last active
    await supabase
      .from('profiles')
      .update({ last_active: new Date().toISOString() })
      .eq('id', decoded.userId);

    // Cache user session
    cache.set(`${CacheKeys.SESSION}${decoded.userId}`, profile, 300); // 5 minutes

    // Attach user to request
    req.user = profile;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    // Try to get user from cache or database
    const cachedUser = cache.get(`${CacheKeys.SESSION}${decoded.userId}`);
    if (cachedUser) {
      req.user = cachedUser;
    } else {
      const supabase = getSupabase();
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', decoded.userId)
        .single();

      req.user = profile || null;
      if (profile) {
        cache.set(`${CacheKeys.SESSION}${decoded.userId}`, profile, 300);
      }
    }
  } catch (error) {
    req.user = null;
  }

  next();
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
};

// Anonymous posting authentication
const anonymousAuth = async (req, res, next) => {
  try {
    // Check if anonymous posting is enabled
    if (process.env.ALLOW_ANONYMOUS_POSTING !== 'true') {
      return next(new AuthorizationError('Anonymous posting is disabled'));
    }

    // Check rate limiting for anonymous users
    const ip = req.ip || req.connection.remoteAddress;
    const anonymousKey = `anon:${ip}`;
    const postCount = cache.get(anonymousKey) || 0;

    if (postCount >= parseInt(process.env.ANONYMOUS_POST_LIMIT || 5)) {
      return next(new AuthorizationError('Anonymous posting limit exceeded'));
    }

    // Create temporary anonymous user
    req.user = {
      id: `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      is_anonymous: true,
      ip_address: ip,
      created_at: new Date().toISOString()
    };

    // Update post count
    cache.set(anonymousKey, postCount + 1, 3600); // Reset every hour

    next();
  } catch (error) {
    next(error);
  }
};

// Refresh token middleware
const refreshAuth = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AuthenticationError('Refresh token required');
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = generateTokens(decoded.userId, decoded.email);

    // Revoke old refresh token
    cache.set(`revoked:${refreshToken}`, true, 86400 * 30); // 30 days

    res.json({
      success: true,
      ...tokens
    });
  } catch (error) {
    next(error);
  }
};

// Logout middleware
const logout = async (req, res, next) => {
  try {
    if (req.token) {
      // Revoke current token
      cache.set(`revoked:${req.token}`, true, 86400 * 7); // 7 days

      // Clear session cache
      if (req.user) {
        cache.del(`${CacheKeys.SESSION}${req.user.id}`);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  anonymousAuth,
  generateTokens,
  verifyToken,
  refreshAuth,
  logout
};