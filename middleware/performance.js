// Performance Monitoring Middleware
// Tracks and optimizes response times for mobile-first experience

const { cache } = require('../config/cache');

// Performance metrics storage
const metrics = {
  requests: [],
  slowRequests: [],
  errors: []
};

// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  // Skip monitoring for health checks
  if (req.path === '/health') {
    return next();
  }

  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  // Add performance headers for client-side monitoring
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Server-Timing', `start;dur=0`);

  // Monitor response
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();

    // Calculate metrics
    const responseTime = Number((endTime - startTime) / BigInt(1000000)); // Convert to ms
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

    // Create metric object
    const metric = {
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      memoryDelta: Math.round(memoryDelta / 1024), // KB
      timestamp: Date.now(),
      mobile: req.get('user-agent')?.toLowerCase().includes('mobile'),
      cached: res.getHeader('X-Cache') === 'HIT'
    };

    // Track slow requests (> 2 seconds for mobile optimization)
    const threshold = parseInt(process.env.MOBILE_RESPONSE_TIMEOUT) || 2000;
    if (responseTime > threshold) {
      metrics.slowRequests.push(metric);
      console.warn(`Slow request detected: ${req.method} ${req.path} took ${responseTime}ms`);

      // Limit stored slow requests
      if (metrics.slowRequests.length > 100) {
        metrics.slowRequests.shift();
      }
    }

    // Track errors
    if (res.statusCode >= 400) {
      metrics.errors.push(metric);

      // Limit stored errors
      if (metrics.errors.length > 100) {
        metrics.errors.shift();
      }
    }

    // Store general metrics (limit to last 1000)
    metrics.requests.push(metric);
    if (metrics.requests.length > 1000) {
      metrics.requests.shift();
    }

    // Update Server-Timing header with actual duration
    res.setHeader('Server-Timing', `total;dur=${responseTime}`);

    // Cache performance stats every 100 requests
    if (metrics.requests.length % 100 === 0) {
      updatePerformanceStats();
    }
  });

  next();
};

// Calculate and cache performance statistics
function updatePerformanceStats() {
  const stats = calculateStats();
  cache.set('performance:stats', stats, 300); // Cache for 5 minutes
  return stats;
}

// Calculate performance statistics
function calculateStats() {
  if (metrics.requests.length === 0) {
    return {
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      slowRequestRate: 0,
      mobilePercentage: 0,
      cacheHitRate: 0
    };
  }

  const responseTimes = metrics.requests.map(r => r.responseTime).sort((a, b) => a - b);
  const totalRequests = metrics.requests.length;

  // Calculate percentiles
  const p50Index = Math.floor(totalRequests * 0.5);
  const p95Index = Math.floor(totalRequests * 0.95);
  const p99Index = Math.floor(totalRequests * 0.99);

  // Calculate rates
  const errorCount = metrics.requests.filter(r => r.statusCode >= 400).length;
  const slowCount = metrics.slowRequests.length;
  const mobileCount = metrics.requests.filter(r => r.mobile).length;
  const cacheHits = metrics.requests.filter(r => r.cached).length;

  return {
    avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / totalRequests),
    p50ResponseTime: responseTimes[p50Index],
    p95ResponseTime: responseTimes[p95Index],
    p99ResponseTime: responseTimes[p99Index],
    errorRate: ((errorCount / totalRequests) * 100).toFixed(2),
    slowRequestRate: ((slowCount / totalRequests) * 100).toFixed(2),
    mobilePercentage: ((mobileCount / totalRequests) * 100).toFixed(2),
    cacheHitRate: ((cacheHits / totalRequests) * 100).toFixed(2),
    totalRequests,
    timestamp: new Date().toISOString()
  };
}

// Get current performance metrics
function getPerformanceMetrics() {
  // Try to get from cache first
  const cached = cache.get('performance:stats');
  if (cached) {
    return cached;
  }

  // Calculate fresh stats
  return updatePerformanceStats();
}

// Clear metrics (useful for testing or reset)
function clearMetrics() {
  metrics.requests = [];
  metrics.slowRequests = [];
  metrics.errors = [];
  cache.del('performance:stats');
}

// Performance optimization suggestions based on metrics
function getOptimizationSuggestions() {
  const stats = getPerformanceMetrics();
  const suggestions = [];

  if (stats.p95ResponseTime > 3000) {
    suggestions.push({
      type: 'response_time',
      severity: 'high',
      message: 'P95 response time exceeds 3 seconds. Consider implementing caching or optimizing database queries.'
    });
  }

  if (stats.errorRate > 5) {
    suggestions.push({
      type: 'error_rate',
      severity: 'high',
      message: `Error rate is ${stats.errorRate}%. Investigate error logs for common issues.`
    });
  }

  if (stats.cacheHitRate < 30) {
    suggestions.push({
      type: 'cache',
      severity: 'medium',
      message: 'Cache hit rate is low. Consider caching frequently accessed data.'
    });
  }

  if (stats.mobilePercentage > 50 && stats.avgResponseTime > 1500) {
    suggestions.push({
      type: 'mobile',
      severity: 'high',
      message: 'High mobile traffic with slow response times. Prioritize mobile optimization.'
    });
  }

  return suggestions;
}

module.exports = {
  performanceMonitor,
  getPerformanceMetrics,
  clearMetrics,
  getOptimizationSuggestions
};