// Cache Configuration
// In-memory caching for performance optimization on free tier

const NodeCache = require('node-cache');

// Create cache instance with default TTL of 1 hour
const cache = new NodeCache({
  stdTTL: process.env.CACHE_TTL || 3600,
  checkperiod: process.env.CACHE_CHECK_PERIOD || 600,
  maxKeys: process.env.CACHE_MAX_KEYS || 1000,
  deleteOnExpire: true,
  enableLegacyCallbacks: false,
  useClones: false // Better performance, but be careful with object mutations
});

// Cache key prefixes for organization
const CacheKeys = {
  USER_PROFILE: 'profile:',
  ARTICLE: 'article:',
  STORYBOARD: 'storyboard:',
  VERIFICATION: 'verify:',
  RATE_LIMIT: 'rate:',
  SESSION: 'session:',
  NEWS_API: 'news:',
  STATS: 'stats:'
};

// Cache wrapper with error handling
class CacheService {
  // Get value from cache
  get(key) {
    try {
      return cache.get(key);
    } catch (err) {
      console.error(`Cache get error for key ${key}:`, err);
      return undefined;
    }
  }

  // Set value in cache with optional TTL
  set(key, value, ttl = null) {
    try {
      if (ttl) {
        return cache.set(key, value, ttl);
      }
      return cache.set(key, value);
    } catch (err) {
      console.error(`Cache set error for key ${key}:`, err);
      return false;
    }
  }

  // Delete key from cache
  del(key) {
    try {
      return cache.del(key);
    } catch (err) {
      console.error(`Cache delete error for key ${key}:`, err);
      return false;
    }
  }

  // Check if key exists
  has(key) {
    return cache.has(key);
  }

  // Clear all cache
  flush() {
    try {
      cache.flushAll();
      return true;
    } catch (err) {
      console.error('Cache flush error:', err);
      return false;
    }
  }

  // Flush only expired entries
  flushExpired() {
    try {
      const keys = cache.keys();
      let expiredCount = 0;

      keys.forEach(key => {
        const ttl = cache.getTtl(key);
        if (ttl && ttl < Date.now()) {
          cache.del(key);
          expiredCount++;
        }
      });

      console.log(`Flushed ${expiredCount} expired cache entries`);
      return expiredCount;
    } catch (err) {
      console.error('Cache flush expired error:', err);
      return 0;
    }
  }

  // Get cache statistics
  getStats() {
    return cache.getStats();
  }

  // Get or set pattern (fetch if not in cache)
  async getOrSet(key, fetchFunction, ttl = null) {
    try {
      // Check if exists in cache
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }

      // Fetch new value
      const value = await fetchFunction();

      // Store in cache
      if (value !== undefined && value !== null) {
        this.set(key, value, ttl);
      }

      return value;
    } catch (err) {
      console.error(`Cache getOrSet error for key ${key}:`, err);
      throw err;
    }
  }

  // Batch operations
  mget(keys) {
    try {
      return cache.mget(keys);
    } catch (err) {
      console.error('Cache mget error:', err);
      return {};
    }
  }

  mset(items) {
    try {
      // items should be array of {key, val, ttl}
      return cache.mset(items);
    } catch (err) {
      console.error('Cache mset error:', err);
      return false;
    }
  }

  // Pattern-based deletion
  deletePattern(pattern) {
    try {
      const keys = cache.keys();
      const toDelete = keys.filter(key => key.includes(pattern));
      return cache.del(toDelete);
    } catch (err) {
      console.error(`Cache delete pattern error for ${pattern}:`, err);
      return 0;
    }
  }

  // Cache warming for frequently accessed data
  async warmCache(warmupData) {
    try {
      const promises = warmupData.map(async (item) => {
        const value = await item.fetchFunction();
        this.set(item.key, value, item.ttl);
      });

      await Promise.all(promises);
      console.log(`Warmed cache with ${warmupData.length} items`);
      return true;
    } catch (err) {
      console.error('Cache warming error:', err);
      return false;
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

// Cache middleware for Express routes
const cacheMiddleware = (keyPrefix, ttl = 3600) => {
  return async (req, res, next) => {
    // Skip cache for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key based on URL and query params
    const cacheKey = `${keyPrefix}${req.originalUrl}`;

    // Check if response exists in cache
    const cachedResponse = cacheService.get(cacheKey);
    if (cachedResponse) {
      // Add cache hit header for debugging
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return res.json(cachedResponse);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache response
    res.json = function(data) {
      // Cache successful responses only
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, ttl);
      }

      // Add cache miss header
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);

      // Call original json method
      originalJson.call(this, data);
    };

    next();
  };
};

// Export cache service and utilities
module.exports = {
  cache: cacheService,
  CacheKeys,
  cacheMiddleware
};