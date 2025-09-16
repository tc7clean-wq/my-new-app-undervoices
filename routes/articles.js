// Articles Routes
// CRUD operations for journalist articles with tags and encryption

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const { getSupabase } = require('../config/supabase');
const { authenticate, optionalAuth, anonymousAuth } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError, AuthorizationError } = require('../middleware/errorHandler');
const { cache, CacheKeys, cacheMiddleware } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

const router = express.Router();

// Helper function to create article slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim() + '-' + Date.now();
};

// Helper function to encrypt sensitive content
const encryptContent = (content) => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;

  return CryptoJS.AES.encrypt(content, key).toString();
};

// Helper function to decrypt content
const decryptContent = (encryptedContent) => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !encryptedContent) return null;

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedContent, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

// Get all published articles with filtering and pagination
router.get('/', cacheMiddleware(CacheKeys.ARTICLE, 300), asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    tags,
    category,
    search,
    sortBy = 'created_at',
    order = 'desc'
  } = req.query;

  const supabase = getSupabase();
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from('articles')
    .select(`
      id, title, slug, summary, tags, category, status,
      view_count, share_count, is_anonymous, published_at,
      created_at, updated_at,
      profiles!articles_author_id_fkey(username, display_name, avatar_url, is_verified)
    `, { count: 'exact' })
    .eq('status', 'published');

  // Apply filters
  if (tags) {
    const tagArray = tags.split(',').map(tag => tag.trim());
    query = query.overlaps('tags', tagArray);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  // Apply sorting
  const validSortFields = ['created_at', 'updated_at', 'view_count', 'published_at'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const sortOrder = order === 'asc' ? { ascending: true } : { ascending: false };

  query = query
    .order(sortField, sortOrder)
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

// Get article by ID or slug
router.get('/:identifier', optionalAuth, asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const supabase = getSupabase();

  // Check cache first
  const cacheKey = `${CacheKeys.ARTICLE}${identifier}`;
  const cached = cache.get(cacheKey);
  if (cached && !req.user) {
    return res.json({ success: true, article: cached });
  }

  // Determine if identifier is UUID or slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const query = supabase
    .from('articles')
    .select(`
      *,
      profiles!articles_author_id_fkey(
        id, username, display_name, avatar_url, is_verified, is_anonymous
      )
    `);

  if (isUuid) {
    query.eq('id', identifier);
  } else {
    query.eq('slug', identifier);
  }

  const { data: article, error } = await query.single();

  if (error || !article) {
    throw new NotFoundError('Article');
  }

  // Check if user has permission to view
  const isOwner = req.user && req.user.id === article.author_id;
  const isPublished = article.status === 'published';

  if (!isPublished && !isOwner) {
    throw new NotFoundError('Article');
  }

  // Decrypt content if encrypted and user has permission
  if (article.encrypted_content && isOwner) {
    const decryptedContent = decryptContent(article.encrypted_content);
    if (decryptedContent) {
      article.content = decryptedContent;
    }
  }

  // Increment view count for published articles
  if (isPublished && !isOwner) {
    supabase
      .from('articles')
      .update({ view_count: article.view_count + 1 })
      .eq('id', article.id)
      .then(() => {})
      .catch(() => {}); // Silent fail for view count
  }

  // Remove sensitive data
  delete article.encrypted_content;

  // Cache article if published
  if (isPublished) {
    cache.set(cacheKey, article, 600); // 10 minutes
  }

  res.json({
    success: true,
    article
  });
}));

// Create new article
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const {
    title,
    content,
    summary,
    tags = [],
    category,
    status = 'draft',
    isAnonymous = false,
    encrypt = false
  } = req.body;

  // Validate required fields
  if (!title || !content) {
    throw new ValidationError('Title and content are required');
  }

  const supabase = getSupabase();
  const articleId = uuidv4();
  const slug = createSlug(title);

  // Prepare article data
  const articleData = {
    id: articleId,
    author_id: req.user.id,
    title: title.trim(),
    slug,
    content: encrypt ? '' : content, // Clear content if encrypting
    encrypted_content: encrypt ? encryptContent(content) : null,
    summary: summary || content.substring(0, 200) + '...',
    tags: Array.isArray(tags) ? tags : [],
    category: category || 'general',
    status,
    is_anonymous: isAnonymous,
    published_at: status === 'published' ? new Date().toISOString() : null,
    metadata: {
      wordCount: content.split(' ').length,
      readingTime: Math.ceil(content.split(' ').length / 200), // Avg 200 WPM
      encrypted: encrypt
    }
  };

  const { data: article, error } = await supabase
    .from('articles')
    .insert(articleData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ValidationError('Article with this title already exists');
    }
    throw error;
  }

  // Log activity
  activityLogger.logArticle(req.user.id, articleId, 'create');

  res.status(201).json({
    success: true,
    message: 'Article created successfully',
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      status: article.status,
      isAnonymous: article.is_anonymous,
      createdAt: article.created_at
    }
  });
}));

// Update article
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    content,
    summary,
    tags,
    category,
    status,
    isAnonymous,
    encrypt
  } = req.body;

  const supabase = getSupabase();

  // Check if article exists and user has permission
  const { data: existingArticle, error: fetchError } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingArticle) {
    throw new NotFoundError('Article');
  }

  if (existingArticle.author_id !== req.user.id) {
    throw new AuthorizationError('You can only edit your own articles');
  }

  // Build update object
  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (title !== undefined) {
    updateData.title = title.trim();
    updateData.slug = createSlug(title);
  }

  if (content !== undefined) {
    if (encrypt) {
      updateData.content = '';
      updateData.encrypted_content = encryptContent(content);
    } else {
      updateData.content = content;
      updateData.encrypted_content = null;
    }

    updateData.metadata = {
      ...existingArticle.metadata,
      wordCount: content.split(' ').length,
      readingTime: Math.ceil(content.split(' ').length / 200),
      encrypted: encrypt || false
    };
  }

  if (summary !== undefined) updateData.summary = summary;
  if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
  if (category !== undefined) updateData.category = category;
  if (isAnonymous !== undefined) updateData.is_anonymous = isAnonymous;

  // Handle status changes
  if (status !== undefined) {
    updateData.status = status;
    if (status === 'published' && existingArticle.status !== 'published') {
      updateData.published_at = new Date().toISOString();
    }
  }

  const { data: article, error } = await supabase
    .from('articles')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.ARTICLE}${id}`);
  cache.del(`${CacheKeys.ARTICLE}${existingArticle.slug}`);

  // Log activity
  activityLogger.logArticle(req.user.id, id, 'update');

  res.json({
    success: true,
    message: 'Article updated successfully',
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      status: article.status,
      updatedAt: article.updated_at
    }
  });
}));

// Delete article
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  // Check if article exists and user has permission
  const { data: article, error: fetchError } = await supabase
    .from('articles')
    .select('author_id, slug')
    .eq('id', id)
    .single();

  if (fetchError || !article) {
    throw new NotFoundError('Article');
  }

  if (article.author_id !== req.user.id) {
    throw new AuthorizationError('You can only delete your own articles');
  }

  // Soft delete by updating status
  const { error } = await supabase
    .from('articles')
    .update({
      status: 'deleted',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.ARTICLE}${id}`);
  cache.del(`${CacheKeys.ARTICLE}${article.slug}`);

  // Log activity
  activityLogger.logArticle(req.user.id, id, 'delete');

  res.json({
    success: true,
    message: 'Article deleted successfully'
  });
}));

// Share article (increment share count)
router.post('/:id/share', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  const { error } = await supabase
    .rpc('increment_share_count', { article_id: id });

  if (error) {
    // Create the function if it doesn't exist (for reference)
    console.error('Share count function not found. Create this function in Supabase:');
    console.error(`
      CREATE OR REPLACE FUNCTION increment_share_count(article_id UUID)
      RETURNS void AS $$
      BEGIN
        UPDATE articles SET share_count = share_count + 1 WHERE id = article_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  res.json({
    success: true,
    message: 'Article shared'
  });
}));

// Get trending articles
router.get('/trending/now', cacheMiddleware(CacheKeys.ARTICLE + 'trending:', 600), asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const supabase = getSupabase();

  // Get articles trending in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: articles, error } = await supabase
    .from('articles')
    .select(`
      id, title, slug, summary, tags, category,
      view_count, share_count, created_at, published_at,
      profiles!articles_author_id_fkey(username, display_name, is_verified)
    `)
    .eq('status', 'published')
    .gte('published_at', sevenDaysAgo.toISOString())
    .order('view_count', { ascending: false })
    .limit(limit);

  if (error) throw error;

  res.json({
    success: true,
    articles
  });
}));

// Get articles by tag
router.get('/tag/:tagName', cacheMiddleware(CacheKeys.ARTICLE + 'tag:', 300), asyncHandler(async (req, res) => {
  const { tagName } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  const { data: articles, count, error } = await supabase
    .from('articles')
    .select(`
      id, title, slug, summary, tags, category,
      view_count, created_at, published_at,
      profiles!articles_author_id_fkey(username, display_name, is_verified)
    `, { count: 'exact' })
    .eq('status', 'published')
    .contains('tags', [tagName])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

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

module.exports = router;