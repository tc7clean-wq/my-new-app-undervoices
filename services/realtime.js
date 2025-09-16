// Real-time Service
// Handles Supabase real-time subscriptions for collaborative features

const { getSupabase } = require('../config/supabase');
const { cache } = require('../config/cache');

class RealtimeService {
  constructor() {
    this.connections = new Map();
    this.subscriptions = new Map();
    this.maxConnections = parseInt(process.env.REALTIME_MAX_CONNECTIONS) || 100;
    this.heartbeatInterval = parseInt(process.env.REALTIME_HEARTBEAT_INTERVAL) || 30000;
  }

  // Initialize real-time handlers
  setupRealtimeHandlers() {
    const supabase = getSupabase();

    if (!supabase) {
      console.error('Supabase client not available for real-time setup');
      return;
    }

    console.log('Setting up real-time handlers...');

    // Handle storyboard changes for collaborative editing
    this.setupStoryboardRealtime();

    // Handle article updates
    this.setupArticleRealtime();

    // Handle review updates
    this.setupReviewRealtime();

    console.log('Real-time handlers configured');
  }

  // Setup storyboard real-time collaboration
  setupStoryboardRealtime() {
    const supabase = getSupabase();

    // Subscribe to storyboard changes
    const storyboardChannel = supabase
      .channel('storyboard-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'storyboards'
      }, (payload) => {
        this.handleStoryboardChange(payload);
      })
      .subscribe((status) => {
        console.log('Storyboard real-time status:', status);
      });

    this.subscriptions.set('storyboards', storyboardChannel);

    // Subscribe to storyboard locks for conflict prevention
    const lockChannel = supabase
      .channel('storyboard-locks')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'storyboards',
        filter: 'locked_by=not.is.null'
      }, (payload) => {
        this.handleStoryboardLock(payload);
      })
      .subscribe();

    this.subscriptions.set('storyboard-locks', lockChannel);
  }

  // Setup article real-time updates
  setupArticleRealtime() {
    const supabase = getSupabase();

    const articleChannel = supabase
      .channel('article-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'articles',
        filter: 'status=eq.published'
      }, (payload) => {
        this.handleArticleUpdate(payload);
      })
      .subscribe();

    this.subscriptions.set('articles', articleChannel);
  }

  // Setup review real-time updates
  setupReviewRealtime() {
    const supabase = getSupabase();

    const reviewChannel = supabase
      .channel('review-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'reviews'
      }, (payload) => {
        this.handleReviewUpdate(payload);
      })
      .subscribe();

    this.subscriptions.set('reviews', reviewChannel);
  }

  // Handle storyboard changes
  handleStoryboardChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log('Storyboard change detected:', eventType, newRecord?.id);

    // Clear relevant caches
    if (newRecord?.id) {
      cache.del(`storyboard:${newRecord.id}`);

      // Broadcast to connected clients if needed
      this.broadcastToStoryboardUsers(newRecord.id, {
        type: 'storyboard-updated',
        eventType,
        storyboard: newRecord,
        timestamp: new Date().toISOString()
      });
    }

    // Handle version updates
    if (eventType === 'UPDATE' && newRecord?.version !== oldRecord?.version) {
      this.handleVersionUpdate(newRecord);
    }
  }

  // Handle storyboard locks
  handleStoryboardLock(payload) {
    const { new: newRecord } = payload;

    console.log('Storyboard lock detected:', newRecord?.id, 'locked by:', newRecord?.locked_by);

    // Broadcast lock status to collaborators
    this.broadcastToStoryboardUsers(newRecord.id, {
      type: 'storyboard-locked',
      storyboardId: newRecord.id,
      lockedBy: newRecord.locked_by,
      lockedAt: newRecord.locked_at,
      timestamp: new Date().toISOString()
    });
  }

  // Handle article updates
  handleArticleUpdate(payload) {
    const { new: newRecord, old: oldRecord } = payload;

    console.log('Article update detected:', newRecord?.id);

    // Clear article cache
    if (newRecord?.id) {
      cache.del(`article:${newRecord.id}`);
      cache.del(`article:${newRecord.slug}`);
    }

    // Notify if article verification status changed
    if (newRecord?.verification_status !== oldRecord?.verification_status) {
      this.broadcastArticleVerification(newRecord);
    }
  }

  // Handle review updates
  handleReviewUpdate(payload) {
    const { eventType, new: newRecord } = payload;

    console.log('Review update detected:', eventType, newRecord?.id);

    // Clear article cache since reviews affect article rating
    if (newRecord?.article_id) {
      cache.del(`article:${newRecord.article_id}`);

      // Broadcast review update to article viewers
      this.broadcastToArticleUsers(newRecord.article_id, {
        type: 'review-updated',
        eventType,
        reviewId: newRecord.id,
        articleId: newRecord.article_id,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Handle version updates for storyboards
  handleVersionUpdate(storyboard) {
    console.log('Storyboard version updated:', storyboard.id, 'version:', storyboard.version);

    // Store version in cache for quick access
    cache.set(`storyboard:${storyboard.id}:version`, storyboard.version, 3600);

    // Broadcast version update
    this.broadcastToStoryboardUsers(storyboard.id, {
      type: 'version-updated',
      storyboardId: storyboard.id,
      version: storyboard.version,
      nodes: storyboard.nodes,
      edges: storyboard.edges,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast to storyboard users (owner + collaborators)
  broadcastToStoryboardUsers(storyboardId, message) {
    // In a full implementation, this would maintain WebSocket connections
    // and broadcast to connected users. For now, we'll cache the message
    // for clients to poll if needed.

    const cacheKey = `broadcast:storyboard:${storyboardId}`;
    const cachedMessages = cache.get(cacheKey) || [];

    cachedMessages.push(message);

    // Keep only last 10 messages
    if (cachedMessages.length > 10) {
      cachedMessages.shift();
    }

    cache.set(cacheKey, cachedMessages, 300); // 5 minutes

    console.log('Broadcast to storyboard users:', storyboardId, message.type);
  }

  // Broadcast to article users
  broadcastToArticleUsers(articleId, message) {
    const cacheKey = `broadcast:article:${articleId}`;
    const cachedMessages = cache.get(cacheKey) || [];

    cachedMessages.push(message);

    // Keep only last 5 messages
    if (cachedMessages.length > 5) {
      cachedMessages.shift();
    }

    cache.set(cacheKey, cachedMessages, 300); // 5 minutes

    console.log('Broadcast to article users:', articleId, message.type);
  }

  // Broadcast article verification changes
  broadcastArticleVerification(article) {
    this.broadcastToArticleUsers(article.id, {
      type: 'verification-updated',
      articleId: article.id,
      verificationStatus: article.verification_status,
      verificationData: article.verification_data,
      timestamp: new Date().toISOString()
    });
  }

  // Get cached messages for polling clients
  getMessages(type, id, lastTimestamp = null) {
    const cacheKey = `broadcast:${type}:${id}`;
    const messages = cache.get(cacheKey) || [];

    if (lastTimestamp) {
      return messages.filter(msg => new Date(msg.timestamp) > new Date(lastTimestamp));
    }

    return messages;
  }

  // Clean up old connections
  cleanupConnections() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastSeen > timeout) {
        this.connections.delete(connectionId);
        console.log('Cleaned up inactive connection:', connectionId);
      }
    }
  }

  // Register a new connection
  registerConnection(connectionId, userId, type, resourceId) {
    if (this.connections.size >= this.maxConnections) {
      throw new Error('Maximum connections exceeded');
    }

    this.connections.set(connectionId, {
      userId,
      type, // 'storyboard', 'article', etc.
      resourceId,
      connectedAt: Date.now(),
      lastSeen: Date.now()
    });

    console.log('Registered connection:', connectionId, 'for', type, resourceId);
  }

  // Update connection heartbeat
  updateHeartbeat(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastSeen = Date.now();
    }
  }

  // Remove connection
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      console.log('Removed connection:', connectionId);
    }
  }

  // Get connection stats
  getConnectionStats() {
    const stats = {
      totalConnections: this.connections.size,
      connectionsByType: {},
      activeUsers: new Set()
    };

    for (const connection of this.connections.values()) {
      stats.connectionsByType[connection.type] = (stats.connectionsByType[connection.type] || 0) + 1;
      stats.activeUsers.add(connection.userId);
    }

    stats.activeUsers = stats.activeUsers.size;

    return stats;
  }

  // Shutdown real-time service
  shutdown() {
    console.log('Shutting down real-time service...');

    // Unsubscribe from all channels
    for (const [name, channel] of this.subscriptions.entries()) {
      try {
        channel.unsubscribe();
        console.log('Unsubscribed from channel:', name);
      } catch (error) {
        console.error('Error unsubscribing from channel:', name, error);
      }
    }

    // Clear all connections
    this.connections.clear();
    this.subscriptions.clear();

    console.log('Real-time service shutdown complete');
  }
}

// Create singleton instance
const realtimeService = new RealtimeService();

// Setup cleanup interval
setInterval(() => {
  realtimeService.cleanupConnections();
}, 60000); // Every minute

// Export service and setup function
module.exports = {
  realtimeService,
  setupRealtimeHandlers: () => realtimeService.setupRealtimeHandlers()
};