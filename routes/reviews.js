// Reviews Routes
// Peer review and voting system for articles

const express = require('express');
const { getSupabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const { cache, CacheKeys } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

const router = express.Router();

// Helper function to calculate overall article rating
const calculateOverallRating = async (articleId) => {
  const supabase = getSupabase();

  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating, credibility_score, bias_score, is_expert_review')
    .eq('article_id', articleId);

  if (!reviews || reviews.length === 0) {
    return {
      averageRating: 0,
      averageCredibility: 0,
      averageBias: 0,
      totalReviews: 0,
      expertReviews: 0
    };
  }

  const expertReviews = reviews.filter(r => r.is_expert_review);
  const regularReviews = reviews.filter(r => !r.is_expert_review);

  // Weight expert reviews more heavily
  const expertWeight = 2;
  const regularWeight = 1;

  let totalRating = 0;
  let totalCredibility = 0;
  let totalBias = 0;
  let totalWeight = 0;

  reviews.forEach(review => {
    const weight = review.is_expert_review ? expertWeight : regularWeight;
    totalRating += review.rating * weight;
    totalCredibility += (review.credibility_score || 0) * weight;
    totalBias += (review.bias_score || 0) * weight;
    totalWeight += weight;
  });

  return {
    averageRating: totalWeight > 0 ? (totalRating / totalWeight).toFixed(2) : 0,
    averageCredibility: totalWeight > 0 ? (totalCredibility / totalWeight).toFixed(2) : 0,
    averageBias: totalWeight > 0 ? (totalBias / totalWeight).toFixed(2) : 0,
    totalReviews: reviews.length,
    expertReviews: expertReviews.length
  };
};

// Get reviews for an article
router.get('/article/:articleId', asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const { page = 1, limit = 10, sortBy = 'created_at' } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  // Check if article exists
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .select('id, title')
    .eq('id', articleId)
    .single();

  if (articleError || !article) {
    throw new NotFoundError('Article');
  }

  // Get reviews with pagination
  const validSortFields = ['created_at', 'rating', 'helpful_count'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';

  const { data: reviews, count, error } = await supabase
    .from('reviews')
    .select(`
      id, rating, credibility_score, bias_score, review_text,
      evidence_links, is_expert_review, helpful_count, created_at,
      profiles!reviews_reviewer_id_fkey(
        username, display_name, is_verified, avatar_url
      )
    `, { count: 'exact' })
    .eq('article_id', articleId)
    .order(sortField, { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Calculate overall ratings
  const overallRating = await calculateOverallRating(articleId);

  res.json({
    success: true,
    reviews: reviews || [],
    overallRating,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  });
}));

// Create a review
router.post('/article/:articleId', authenticate, asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const {
    rating,
    credibilityScore,
    biasScore,
    reviewText,
    evidenceLinks = [],
    isExpertReview = false
  } = req.body;

  // Validate input
  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  if (credibilityScore !== undefined && (credibilityScore < 0 || credibilityScore > 1)) {
    throw new ValidationError('Credibility score must be between 0 and 1');
  }

  if (biasScore !== undefined && (biasScore < 0 || biasScore > 1)) {
    throw new ValidationError('Bias score must be between 0 and 1');
  }

  const supabase = getSupabase();

  // Check if article exists
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .select('id, author_id')
    .eq('id', articleId)
    .single();

  if (articleError || !article) {
    throw new NotFoundError('Article');
  }

  // Check if user is trying to review their own article
  if (article.author_id === req.user.id) {
    throw new ValidationError('You cannot review your own article');
  }

  // Check if user has already reviewed this article
  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('article_id', articleId)
    .eq('reviewer_id', req.user.id)
    .single();

  if (existingReview) {
    throw new ConflictError('You have already reviewed this article');
  }

  // Create review
  const reviewData = {
    article_id: articleId,
    reviewer_id: req.user.id,
    rating: parseInt(rating),
    credibility_score: credibilityScore || null,
    bias_score: biasScore || null,
    review_text: reviewText || null,
    evidence_links: Array.isArray(evidenceLinks) ? evidenceLinks : [],
    is_expert_review: isExpertReview && req.user.is_verified // Only verified users can submit expert reviews
  };

  const { data: review, error } = await supabase
    .from('reviews')
    .insert(reviewData)
    .select(`
      id, rating, credibility_score, bias_score, created_at,
      profiles!reviews_reviewer_id_fkey(username, display_name)
    `)
    .single();

  if (error) throw error;

  // Update article verification status based on reviews
  const overallRating = await calculateOverallRating(articleId);

  let verificationStatus = 'pending';
  if (overallRating.totalReviews >= 3) {
    if (overallRating.averageRating >= 4 && overallRating.averageCredibility >= 0.7) {
      verificationStatus = 'verified';
    } else if (overallRating.averageRating <= 2 || overallRating.averageCredibility <= 0.3) {
      verificationStatus = 'disputed';
    }
  }

  await supabase
    .from('articles')
    .update({
      verification_status: verificationStatus,
      verification_data: overallRating
    })
    .eq('id', articleId);

  // Clear cache
  cache.del(`${CacheKeys.ARTICLE}${articleId}`);

  // Log activity
  activityLogger.log(req.user.id, 'review:create', {
    articleId,
    rating,
    isExpert: reviewData.is_expert_review
  });

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully',
    review: {
      id: review.id,
      rating: review.rating,
      credibilityScore: review.credibility_score,
      biasScore: review.bias_score,
      createdAt: review.created_at
    },
    overallRating
  });
}));

// Update a review
router.put('/:reviewId', authenticate, asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const {
    rating,
    credibilityScore,
    biasScore,
    reviewText,
    evidenceLinks
  } = req.body;

  const supabase = getSupabase();

  // Check if review exists and user owns it
  const { data: existingReview, error: fetchError } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single();

  if (fetchError || !existingReview) {
    throw new NotFoundError('Review');
  }

  if (existingReview.reviewer_id !== req.user.id) {
    throw new ValidationError('You can only edit your own reviews');
  }

  // Build update object
  const updateData = { updated_at: new Date().toISOString() };

  if (rating !== undefined) {
    if (rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }
    updateData.rating = rating;
  }

  if (credibilityScore !== undefined) {
    if (credibilityScore < 0 || credibilityScore > 1) {
      throw new ValidationError('Credibility score must be between 0 and 1');
    }
    updateData.credibility_score = credibilityScore;
  }

  if (biasScore !== undefined) {
    if (biasScore < 0 || biasScore > 1) {
      throw new ValidationError('Bias score must be between 0 and 1');
    }
    updateData.bias_score = biasScore;
  }

  if (reviewText !== undefined) updateData.review_text = reviewText;
  if (evidenceLinks !== undefined) updateData.evidence_links = evidenceLinks;

  // Update review
  const { data: review, error } = await supabase
    .from('reviews')
    .update(updateData)
    .eq('id', reviewId)
    .select()
    .single();

  if (error) throw error;

  // Recalculate overall rating for the article
  const overallRating = await calculateOverallRating(existingReview.article_id);

  // Update article verification status
  let verificationStatus = 'pending';
  if (overallRating.totalReviews >= 3) {
    if (overallRating.averageRating >= 4 && overallRating.averageCredibility >= 0.7) {
      verificationStatus = 'verified';
    } else if (overallRating.averageRating <= 2 || overallRating.averageCredibility <= 0.3) {
      verificationStatus = 'disputed';
    }
  }

  await supabase
    .from('articles')
    .update({
      verification_status: verificationStatus,
      verification_data: overallRating
    })
    .eq('id', existingReview.article_id);

  // Clear cache
  cache.del(`${CacheKeys.ARTICLE}${existingReview.article_id}`);

  // Log activity
  activityLogger.log(req.user.id, 'review:update', { reviewId, articleId: existingReview.article_id });

  res.json({
    success: true,
    message: 'Review updated successfully',
    review: {
      id: review.id,
      rating: review.rating,
      credibilityScore: review.credibility_score,
      biasScore: review.bias_score,
      updatedAt: review.updated_at
    },
    overallRating
  });
}));

// Delete a review
router.delete('/:reviewId', authenticate, asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const supabase = getSupabase();

  // Check if review exists and user owns it
  const { data: review, error: fetchError } = await supabase
    .from('reviews')
    .select('reviewer_id, article_id')
    .eq('id', reviewId)
    .single();

  if (fetchError || !review) {
    throw new NotFoundError('Review');
  }

  if (review.reviewer_id !== req.user.id) {
    throw new ValidationError('You can only delete your own reviews');
  }

  // Delete review
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId);

  if (error) throw error;

  // Recalculate overall rating
  const overallRating = await calculateOverallRating(review.article_id);

  // Update article verification status
  let verificationStatus = 'pending';
  if (overallRating.totalReviews >= 3) {
    if (overallRating.averageRating >= 4 && overallRating.averageCredibility >= 0.7) {
      verificationStatus = 'verified';
    } else if (overallRating.averageRating <= 2 || overallRating.averageCredibility <= 0.3) {
      verificationStatus = 'disputed';
    }
  }

  await supabase
    .from('articles')
    .update({
      verification_status: verificationStatus,
      verification_data: overallRating
    })
    .eq('id', review.article_id);

  // Clear cache
  cache.del(`${CacheKeys.ARTICLE}${review.article_id}`);

  // Log activity
  activityLogger.log(req.user.id, 'review:delete', { reviewId, articleId: review.article_id });

  res.json({
    success: true,
    message: 'Review deleted successfully',
    overallRating
  });
}));

// Mark review as helpful
router.post('/:reviewId/helpful', authenticate, asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const supabase = getSupabase();

  // Check if review exists
  const { data: review, error: fetchError } = await supabase
    .from('reviews')
    .select('id, helpful_count, reviewer_id')
    .eq('id', reviewId)
    .single();

  if (fetchError || !review) {
    throw new NotFoundError('Review');
  }

  // Don't allow voting on own review
  if (review.reviewer_id === req.user.id) {
    throw new ValidationError('You cannot vote on your own review');
  }

  // Check if user has already voted
  const voteKey = `vote:${reviewId}:${req.user.id}`;
  const hasVoted = cache.get(voteKey);

  if (hasVoted) {
    throw new ConflictError('You have already voted on this review');
  }

  // Increment helpful count
  const { error } = await supabase
    .rpc('increment_helpful_count', { review_id: reviewId });

  if (error) {
    // Fallback update if function doesn't exist
    await supabase
      .from('reviews')
      .update({ helpful_count: review.helpful_count + 1 })
      .eq('id', reviewId);
  }

  // Cache the vote (24 hours)
  cache.set(voteKey, true, 86400);

  // Log activity
  activityLogger.log(req.user.id, 'review:helpful', { reviewId });

  res.json({
    success: true,
    message: 'Review marked as helpful',
    newHelpfulCount: review.helpful_count + 1
  });
}));

// Get user's reviews
router.get('/user/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  const { data: reviews, count, error } = await supabase
    .from('reviews')
    .select(`
      id, rating, credibility_score, bias_score, review_text,
      is_expert_review, helpful_count, created_at,
      articles!reviews_article_id_fkey(id, title, slug)
    `, { count: 'exact' })
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  res.json({
    success: true,
    reviews: reviews || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  });
}));

// Get review statistics
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  // Check cache
  const cacheKey = `${CacheKeys.STATS}reviews`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, stats: cached });
  }

  // Get review statistics
  const { data: reviewStats } = await supabase
    .from('reviews')
    .select('rating, is_expert_review, created_at');

  const stats = {
    totalReviews: reviewStats?.length || 0,
    expertReviews: reviewStats?.filter(r => r.is_expert_review).length || 0,
    averageRating: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    reviewsThisMonth: 0
  };

  if (reviewStats && reviewStats.length > 0) {
    const totalRating = reviewStats.reduce((sum, r) => sum + r.rating, 0);
    stats.averageRating = (totalRating / reviewStats.length).toFixed(2);

    // Rating distribution
    reviewStats.forEach(r => {
      stats.ratingDistribution[r.rating]++;
    });

    // Reviews this month
    const thisMonth = new Date();
    thisMonth.setMonth(thisMonth.getMonth());
    thisMonth.setDate(1);

    stats.reviewsThisMonth = reviewStats.filter(r =>
      new Date(r.created_at) >= thisMonth
    ).length;
  }

  // Cache for 30 minutes
  cache.set(cacheKey, stats, 1800);

  res.json({
    success: true,
    stats
  });
}));

module.exports = router;