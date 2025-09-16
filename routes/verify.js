// Verification Routes
// NewsAPI integration for fact-checking and source verification

const express = require('express');
const axios = require('axios');
const { getSupabase } = require('../config/supabase');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { cache, CacheKeys } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

const router = express.Router();

// NewsAPI configuration
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = process.env.NEWS_API_URL || 'https://newsapi.org/v2';

// Helper function to call NewsAPI
const callNewsAPI = async (endpoint, params) => {
  if (!NEWS_API_KEY) {
    throw new Error('NewsAPI key not configured');
  }

  try {
    const response = await axios.get(`${NEWS_API_URL}${endpoint}`, {
      params: {
        ...params,
        apiKey: NEWS_API_KEY
      },
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    console.error('NewsAPI error:', error.response?.data || error.message);

    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded for NewsAPI');
    }

    throw new Error('Failed to fetch verification data');
  }
};

// Helper function to extract keywords from article
const extractKeywords = (title, content) => {
  const text = `${title} ${content}`.toLowerCase();
  const words = text.match(/\b\w{4,}\b/g) || [];

  // Remove common words
  const stopWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were'];

  const filtered = words.filter(word => !stopWords.includes(word) && word.length > 4);

  // Get top 5 most frequent keywords
  const frequency = {};
  filtered.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
};

// Helper function to calculate credibility score
const calculateCredibilityScore = (newsApiData, articleData) => {
  let score = 0.5; // Base score

  if (!newsApiData.articles || newsApiData.articles.length === 0) {
    return 0.2; // Low score if no related articles found
  }

  const relatedArticles = newsApiData.articles;

  // Check source reliability
  const reliableSources = ['reuters', 'ap-news', 'bbc-news', 'associated-press'];
  const hasReliableSources = relatedArticles.some(article =>
    reliableSources.some(source => article.source.id === source)
  );

  if (hasReliableSources) score += 0.2;

  // Check recency of related articles
  const recentArticles = relatedArticles.filter(article => {
    const articleDate = new Date(article.publishedAt);
    const daysDiff = (Date.now() - articleDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7; // Within 7 days
  });

  if (recentArticles.length > 0) score += 0.1;

  // Check number of corroborating sources
  if (relatedArticles.length >= 3) score += 0.1;
  if (relatedArticles.length >= 5) score += 0.1;

  return Math.min(score, 1.0);
};

// Verify article with NewsAPI
router.post('/article/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { verificationType = 'fact-check' } = req.body;

  const supabase = getSupabase();

  // Get article
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (articleError || !article) {
    throw new NotFoundError('Article');
  }

  // Check if verification already exists recently
  const cacheKey = `${CacheKeys.VERIFICATION}${id}:${verificationType}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({
      success: true,
      verification: cached,
      cached: true
    });
  }

  // Extract keywords for search
  const keywords = extractKeywords(article.title, article.content);
  const searchQuery = keywords.join(' OR ');

  try {
    let newsApiData = {};
    let verificationResults = {};

    switch (verificationType) {
      case 'fact-check':
        // Search for related articles
        newsApiData = await callNewsAPI('/everything', {
          q: searchQuery,
          sortBy: 'relevancy',
          pageSize: 10,
          language: 'en'
        });

        verificationResults = {
          type: 'fact-check',
          query: searchQuery,
          relatedArticles: newsApiData.articles?.slice(0, 5) || [],
          credibilityScore: calculateCredibilityScore(newsApiData, article),
          totalResults: newsApiData.totalResults || 0
        };
        break;

      case 'source-verify': {
        // Search for articles from the same sources mentioned
        const sources = article.content.match(/https?:\/\/(www\.)?([^/\s]+)/g) || [];
        const domains = sources.map(url => new URL(url).hostname).slice(0, 3);

        if (domains.length > 0) {
          const domainQuery = domains.join(' OR ');
          newsApiData = await callNewsAPI('/everything', {
            q: domainQuery,
            sortBy: 'publishedAt',
            pageSize: 10
          });
        }

        verificationResults = {
          type: 'source-verify',
          sourceDomains: domains,
          relatedFromSources: newsApiData.articles || [],
          sourceReliability: domains.length > 0 ? 'partial' : 'none'
        };
        break;
      }

      case 'bias-check': {
        // Search across different news sources to check for bias
        const leftSources = 'cnn,the-guardian,huffington-post';
        const centerSources = 'reuters,associated-press,bbc-news';
        const rightSources = 'fox-news,wall-street-journal';

        const [leftData, centerData, rightData] = await Promise.all([
          callNewsAPI('/everything', {
            q: searchQuery,
            sources: leftSources,
            pageSize: 3
          }).catch(() => ({ articles: [] })),
          callNewsAPI('/everything', {
            q: searchQuery,
            sources: centerSources,
            pageSize: 3
          }).catch(() => ({ articles: [] })),
          callNewsAPI('/everything', {
            q: searchQuery,
            sources: rightSources,
            pageSize: 3
          }).catch(() => ({ articles: [] }))
        ]);

        verificationResults = {
          type: 'bias-check',
          leftPerspective: leftData.articles || [],
          centerPerspective: centerData.articles || [],
          rightPerspective: rightData.articles || [],
          biasScore: Math.abs((leftData.articles?.length || 0) - (rightData.articles?.length || 0)) / 10
        };
        break;
      }

      default:
        throw new ValidationError('Invalid verification type');
    }

    // Store verification request
    const { data: verificationRecord, error: verifyError } = await supabase
      .from('verification_requests')
      .insert({
        article_id: id,
        requested_by: req.user.id,
        verification_type: verificationType,
        status: 'completed',
        results: verificationResults,
        newsapi_data: newsApiData,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (verifyError) {
      console.error('Verification storage error:', verifyError);
    }

    // Cache results for 1 hour
    cache.set(cacheKey, verificationResults, 3600);

    // Log activity
    activityLogger.log(req.user.id, 'verify:request', {
      articleId: id,
      type: verificationType,
      resultsCount: verificationResults.relatedArticles?.length || 0
    });

    res.json({
      success: true,
      verification: verificationResults,
      requestId: verificationRecord?.id
    });

  } catch (error) {
    // Store failed verification
    await supabase
      .from('verification_requests')
      .insert({
        article_id: id,
        requested_by: req.user.id,
        verification_type: verificationType,
        status: 'failed',
        results: { error: error.message }
      });

    throw error;
  }
}));

// Get verification history for article
router.get('/article/:id/history', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  const { data: verifications, error } = await supabase
    .from('verification_requests')
    .select(`
      id, verification_type, status, results, created_at, completed_at,
      profiles!verification_requests_requested_by_fkey(username, display_name)
    `)
    .eq('article_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;

  res.json({
    success: true,
    verifications: verifications || []
  });
}));

// Search news by topic
router.get('/news/search', asyncHandler(async (req, res) => {
  const {
    q: query,
    sources,
    from,
    to,
    sortBy = 'publishedAt',
    pageSize = 10,
    page = 1
  } = req.query;

  if (!query) {
    throw new ValidationError('Search query is required');
  }

  // Check cache
  const cacheKey = `news:search:${query}:${sources}:${sortBy}:${page}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({
      success: true,
      ...cached,
      cached: true
    });
  }

  const newsData = await callNewsAPI('/everything', {
    q: query,
    sources,
    from,
    to,
    sortBy,
    pageSize,
    page
  });

  const result = {
    articles: newsData.articles || [],
    totalResults: newsData.totalResults || 0,
    status: newsData.status
  };

  // Cache for 10 minutes
  cache.set(cacheKey, result, 600);

  res.json({
    success: true,
    ...result
  });
}));

// Get top headlines
router.get('/news/headlines', asyncHandler(async (req, res) => {
  const {
    category,
    sources,
    country = 'us',
    pageSize = 10
  } = req.query;

  const cacheKey = `news:headlines:${category}:${country}:${sources}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({
      success: true,
      ...cached,
      cached: true
    });
  }

  const newsData = await callNewsAPI('/top-headlines', {
    category,
    sources,
    country,
    pageSize
  });

  const result = {
    articles: newsData.articles || [],
    totalResults: newsData.totalResults || 0,
    status: newsData.status
  };

  // Cache for 15 minutes
  cache.set(cacheKey, result, 900);

  res.json({
    success: true,
    ...result
  });
}));

// Get available news sources
router.get('/news/sources', asyncHandler(async (req, res) => {
  const { category, language = 'en', country } = req.query;

  const cacheKey = `news:sources:${category}:${language}:${country}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({
      success: true,
      ...cached,
      cached: true
    });
  }

  const sourcesData = await callNewsAPI('/sources', {
    category,
    language,
    country
  });

  const result = {
    sources: sourcesData.sources || [],
    status: sourcesData.status
  };

  // Cache for 1 hour (sources don't change frequently)
  cache.set(cacheKey, result, 3600);

  res.json({
    success: true,
    ...result
  });
}));

// Get verification statistics
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  // Check cache
  const cacheKey = `${CacheKeys.VERIFICATION}stats`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, stats: cached });
  }

  // Get verification stats
  const { data: verificationStats, error } = await supabase
    .from('verification_requests')
    .select('verification_type, status')
    .eq('status', 'completed');

  if (error) throw error;

  // Calculate statistics
  const stats = {
    total: verificationStats.length,
    byType: {},
    completionRate: 0
  };

  verificationStats.forEach(v => {
    stats.byType[v.verification_type] = (stats.byType[v.verification_type] || 0) + 1;
  });

  // Get total requests for completion rate
  const { count: totalRequests } = await supabase
    .from('verification_requests')
    .select('*', { count: 'exact', head: true });

  if (totalRequests > 0) {
    stats.completionRate = ((stats.total / totalRequests) * 100).toFixed(2);
  }

  // Cache for 30 minutes
  cache.set(cacheKey, stats, 1800);

  res.json({
    success: true,
    stats
  });
}));

module.exports = router;