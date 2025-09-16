// Profile Routes
// User profile management with preferences and settings

const express = require('express');
const { getSupabase } = require('../config/supabase');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { cache, CacheKeys } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

const router = express.Router();

// Get user profile by ID or username
router.get('/:identifier', optionalAuth, asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const supabase = getSupabase();

  // Check cache first
  const cacheKey = `${CacheKeys.USER_PROFILE}${identifier}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ success: true, profile: cached });
  }

  // Determine if identifier is UUID or username
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const query = supabase
    .from('profiles')
    .select('*');

  if (isUuid) {
    query.eq('id', identifier);
  } else {
    query.eq('username', identifier);
  }

  const { data: profile, error } = await query.single();

  if (error || !profile) {
    throw new NotFoundError('Profile');
  }

  // Filter sensitive data for non-owner
  const isOwner = req.user && req.user.id === profile.id;
  const publicProfile = {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    isVerified: profile.is_verified,
    createdAt: profile.created_at,
    lastActive: isOwner ? profile.last_active : undefined,
    preferences: isOwner ? {
      theme: profile.theme_preference,
      language: profile.language,
      notifications: profile.notification_settings
    } : undefined,
    security: isOwner ? profile.security_settings : undefined
  };

  // Cache public profile
  cache.set(cacheKey, publicProfile, 300);

  res.json({
    success: true,
    profile: publicProfile
  });
}));

// Update user profile
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Ensure user can only update their own profile
  if (req.user.id !== id) {
    throw new ValidationError('You can only update your own profile');
  }

  const {
    username,
    displayName,
    bio,
    avatarUrl,
    themePreference,
    language,
    notificationSettings,
    securitySettings
  } = req.body;

  const supabase = getSupabase();

  // Build update object
  const updateData = {};
  if (username !== undefined) updateData.username = username;
  if (displayName !== undefined) updateData.display_name = displayName;
  if (bio !== undefined) updateData.bio = bio;
  if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
  if (themePreference !== undefined) updateData.theme_preference = themePreference;
  if (language !== undefined) updateData.language = language;
  if (notificationSettings !== undefined) updateData.notification_settings = notificationSettings;
  if (securitySettings !== undefined) updateData.security_settings = securitySettings;

  updateData.updated_at = new Date().toISOString();

  // Update profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ValidationError('Username already taken');
    }
    throw error;
  }

  // Clear cache
  cache.del(`${CacheKeys.USER_PROFILE}${id}`);
  cache.del(`${CacheKeys.USER_PROFILE}${profile.username}`);
  cache.del(`${CacheKeys.SESSION}${id}`);

  // Log activity
  activityLogger.log(id, 'profile:update', { fields: Object.keys(updateData) });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      preferences: {
        theme: profile.theme_preference,
        language: profile.language,
        notifications: profile.notification_settings
      },
      security: profile.security_settings
    }
  });
}));

// Toggle anonymous mode
router.post('/:id/toggle-anonymous', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    throw new ValidationError('You can only update your own settings');
  }

  const supabase = getSupabase();

  // Toggle anonymous status
  const { data: current } = await supabase
    .from('profiles')
    .select('is_anonymous')
    .eq('id', id)
    .single();

  const newStatus = !current.is_anonymous;

  const { error } = await supabase
    .from('profiles')
    .update({
      is_anonymous: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.USER_PROFILE}${id}`);
  cache.del(`${CacheKeys.SESSION}${id}`);

  // Log activity
  activityLogger.logSecurity(id, 'anonymous-toggle', { enabled: newStatus });

  res.json({
    success: true,
    message: `Anonymous mode ${newStatus ? 'enabled' : 'disabled'}`,
    isAnonymous: newStatus
  });
}));

// Get user's articles
router.get('/:id/articles', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10, status = 'published' } = req.query;

  const supabase = getSupabase();

  // Calculate offset
  const offset = (page - 1) * limit;

  // Build query
  const query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('author_id', id);

  // Filter by status (only show drafts to owner)
  if (req.user?.id === id) {
    if (status !== 'all') {
      query.eq('status', status);
    }
  } else {
    query.eq('status', 'published');
  }

  // Add pagination
  query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: articles, count, error } = await query;

  if (error) throw error;

  res.json({
    success: true,
    articles,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  });
}));

// Get user's storyboards
router.get('/:id/storyboards', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const supabase = getSupabase();

  // Calculate offset
  const offset = (page - 1) * limit;

  // Get storyboards where user is owner or collaborator
  const { data: storyboards, count, error } = await supabase
    .from('storyboards')
    .select('*', { count: 'exact' })
    .or(`owner_id.eq.${id},collaborators.cs.{${id}}`)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  res.json({
    success: true,
    storyboards,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  });
}));

// Get user's statistics
router.get('/:id/stats', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  // Check cache
  const cacheKey = `${CacheKeys.STATS}${id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ success: true, stats: cached });
  }

  // Get article stats
  const { count: articleCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', id)
    .eq('status', 'published');

  // Get total views
  const { data: viewData } = await supabase
    .from('articles')
    .select('view_count')
    .eq('author_id', id)
    .eq('status', 'published');

  const totalViews = viewData?.reduce((sum, article) => sum + article.view_count, 0) || 0;

  // Get average rating
  const { data: reviewData } = await supabase
    .from('reviews')
    .select('rating')
    .in('article_id',
      supabase
        .from('articles')
        .select('id')
        .eq('author_id', id)
    );

  const avgRating = reviewData?.length > 0
    ? reviewData.reduce((sum, review) => sum + review.rating, 0) / reviewData.length
    : 0;

  // Get storyboard count
  const { count: storyboardCount } = await supabase
    .from('storyboards')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', id);

  const stats = {
    articles: articleCount || 0,
    totalViews,
    avgRating: avgRating.toFixed(2),
    storyboards: storyboardCount || 0,
    joinedAt: req.user?.created_at
  };

  // Cache for 10 minutes
  cache.set(cacheKey, stats, 600);

  res.json({
    success: true,
    stats
  });
}));

// Delete profile (soft delete)
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    throw new ValidationError('You can only delete your own profile');
  }

  const supabase = getSupabase();

  // Soft delete by updating status
  const { error } = await supabase
    .from('profiles')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;

  // Clear all caches
  cache.del(`${CacheKeys.USER_PROFILE}${id}`);
  cache.del(`${CacheKeys.SESSION}${id}`);

  // Log activity
  activityLogger.logSecurity(id, 'profile:delete', { soft: true });

  res.json({
    success: true,
    message: 'Profile deleted successfully'
  });
}));

module.exports = router;