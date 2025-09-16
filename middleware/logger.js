// Request Logger Middleware
// Lightweight logging for monitoring and debugging

const requestLogger = (req, res, next) => {
  // Skip logging for health checks
  if (req.path === '/health') {
    return next();
  }

  const startTime = Date.now();
  const requestId = require('uuid').v4();

  // Attach request ID for tracking
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Capture request details
  const requestLog = {
    id: requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    deviceType: detectDeviceType(req.get('user-agent')),
    timestamp: new Date().toISOString()
  };

  // Log request (only in development or if DEBUG is enabled)
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    console.log('Request:', requestLog);
  }

  // Intercept response to log completion
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;

    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Log response details
    const responseLog = {
      id: requestId,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      mobile: requestLog.deviceType === 'mobile',
      slow: responseTime > (parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS) || 2000)
    };

    // Log slow requests or errors
    if (responseLog.slow || res.statusCode >= 400) {
      console.log('Response:', responseLog);
    }

    // Add performance headers
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.setHeader('X-Device-Type', requestLog.deviceType);

    return res.send(data);
  };

  next();
};

// Detect device type from user agent
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
    return 'mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    return 'tablet';
  } else if (/bot|crawler|spider|crawling/i.test(ua)) {
    return 'bot';
  }

  return 'desktop';
}

// Activity logger for important events
const activityLogger = {
  log: (userId, action, details = {}) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      details,
      environment: process.env.NODE_ENV || 'development'
    };

    // In production, this could send to a logging service
    console.log('Activity:', logEntry);

    // Store in database if needed
    const { getSupabase } = require('../config/supabase');
    const supabase = getSupabase();

    if (supabase && userId) {
      supabase
        .from('activity_logs')
        .insert({
          user_id: userId,
          action,
          details
        })
        .then(() => {})
        .catch(err => console.error('Activity log DB error:', err));
    }

    return logEntry;
  },

  // Specific activity types
  logAuth: (userId, action, success) => {
    return activityLogger.log(userId, `auth:${action}`, { success });
  },

  logArticle: (userId, articleId, action) => {
    return activityLogger.log(userId, `article:${action}`, { articleId });
  },

  logStoryboard: (userId, storyboardId, action) => {
    return activityLogger.log(userId, `storyboard:${action}`, { storyboardId });
  },

  logSecurity: (userId, action, details) => {
    return activityLogger.log(userId, `security:${action}`, details);
  }
};

module.exports = {
  requestLogger,
  activityLogger,
  detectDeviceType
};