// Storyboards Routes
// Connect the Dots feature - Real-time collaborative storyboard system

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSupabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError, AuthorizationError, ConflictError } = require('../middleware/errorHandler');
const { cache, CacheKeys } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

const router = express.Router();

// Helper function to check if user can access storyboard
const checkStoryboardAccess = (storyboard, userId, requireWrite = false) => {
  const isOwner = storyboard.owner_id === userId;
  const isCollaborator = storyboard.collaborators?.includes(userId);
  const hasReadAccess = isOwner || isCollaborator || storyboard.is_public;
  const hasWriteAccess = isOwner || (isCollaborator && storyboard.is_collaborative);

  if (requireWrite && !hasWriteAccess) {
    throw new AuthorizationError('You do not have write access to this storyboard');
  }

  if (!hasReadAccess) {
    throw new AuthorizationError('You do not have access to this storyboard');
  }

  return { isOwner, isCollaborator, hasWriteAccess };
};

// Helper function to validate Cytoscape.js data structure
const validateCytoscapeData = (nodes, edges) => {
  // Validate nodes
  if (!Array.isArray(nodes)) {
    throw new ValidationError('Nodes must be an array');
  }

  for (const node of nodes) {
    if (!node.data?.id) {
      throw new ValidationError('Each node must have data.id');
    }
  }

  // Validate edges
  if (!Array.isArray(edges)) {
    throw new ValidationError('Edges must be an array');
  }

  for (const edge of edges) {
    if (!edge.data?.id || !edge.data?.source || !edge.data?.target) {
      throw new ValidationError('Each edge must have data.id, data.source, and data.target');
    }
  }

  return true;
};

// Get user's storyboards
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, isPublic, isCollaborative } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  // Build query - get storyboards where user is owner or collaborator
  let query = supabase
    .from('storyboards')
    .select(`
      id, title, description, is_public, is_collaborative,
      created_at, updated_at, version, tags,
      profiles!storyboards_owner_id_fkey(username, display_name)
    `, { count: 'exact' })
    .or(`owner_id.eq.${req.user.id},collaborators.cs.{${req.user.id}}`);

  // Apply filters
  if (isPublic !== undefined) {
    query = query.eq('is_public', isPublic === 'true');
  }

  if (isCollaborative !== undefined) {
    query = query.eq('is_collaborative', isCollaborative === 'true');
  }

  query = query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: storyboards, count, error } = await query;

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

// Get public storyboards
router.get('/public', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, tags, search } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  let query = supabase
    .from('storyboards')
    .select(`
      id, title, description, created_at, updated_at,
      tags, profiles!storyboards_owner_id_fkey(username, display_name, is_verified)
    `, { count: 'exact' })
    .eq('is_public', true);

  // Apply filters
  if (tags) {
    const tagArray = tags.split(',').map(tag => tag.trim());
    query = query.overlaps('tags', tagArray);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  query = query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: storyboards, count, error } = await query;

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

// Get specific storyboard
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  // Check cache first
  const cacheKey = `${CacheKeys.STORYBOARD}${id}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    // Still need to verify access
    checkStoryboardAccess(cached, req.user.id);
    return res.json({ success: true, storyboard: cached });
  }

  const { data: storyboard, error } = await supabase
    .from('storyboards')
    .select(`
      *, profiles!storyboards_owner_id_fkey(
        id, username, display_name, avatar_url, is_verified
      )
    `)
    .eq('id', id)
    .single();

  if (error || !storyboard) {
    throw new NotFoundError('Storyboard');
  }

  // Check access permissions
  const { hasWriteAccess } = checkStoryboardAccess(storyboard, req.user.id);

  // Add user permissions to response
  storyboard.permissions = {
    canEdit: hasWriteAccess,
    canShare: hasWriteAccess,
    canDelete: storyboard.owner_id === req.user.id
  };

  // Cache for 5 minutes
  cache.set(cacheKey, storyboard, 300);

  res.json({
    success: true,
    storyboard
  });
}));

// Create new storyboard
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const {
    title,
    description,
    isPublic = false,
    isCollaborative = true,
    nodes = [],
    edges = [],
    layout = {},
    style = {},
    tags = []
  } = req.body;

  // Validate required fields
  if (!title) {
    throw new ValidationError('Title is required');
  }

  // Validate Cytoscape.js data
  validateCytoscapeData(nodes, edges);

  const supabase = getSupabase();
  const storyboardId = uuidv4();

  const storyboardData = {
    id: storyboardId,
    owner_id: req.user.id,
    title: title.trim(),
    description: description || '',
    is_public: isPublic,
    is_collaborative: isCollaborative,
    nodes,
    edges,
    layout: layout || { name: 'cose' },
    style: style || [],
    collaborators: [],
    version: 1,
    tags: Array.isArray(tags) ? tags : []
  };

  const { data: storyboard, error } = await supabase
    .from('storyboards')
    .insert(storyboardData)
    .select()
    .single();

  if (error) throw error;

  // Create initial version record
  await supabase
    .from('storyboard_versions')
    .insert({
      storyboard_id: storyboardId,
      version_number: 1,
      nodes,
      edges,
      changed_by: req.user.id,
      change_description: 'Initial version'
    });

  // Log activity
  activityLogger.logStoryboard(req.user.id, storyboardId, 'create');

  res.status(201).json({
    success: true,
    message: 'Storyboard created successfully',
    storyboard: {
      id: storyboard.id,
      title: storyboard.title,
      isPublic: storyboard.is_public,
      isCollaborative: storyboard.is_collaborative,
      createdAt: storyboard.created_at
    }
  });
}));

// Update storyboard
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    isPublic,
    isCollaborative,
    nodes,
    edges,
    layout,
    style,
    tags,
    changeDescription
  } = req.body;

  const supabase = getSupabase();

  // Get current storyboard
  const { data: currentStoryboard, error: fetchError } = await supabase
    .from('storyboards')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !currentStoryboard) {
    throw new NotFoundError('Storyboard');
  }

  // Check if storyboard is locked by another user
  if (currentStoryboard.locked_by &&
      currentStoryboard.locked_by !== req.user.id &&
      currentStoryboard.locked_at &&
      new Date() - new Date(currentStoryboard.locked_at) < 5 * 60 * 1000) { // 5 minutes
    throw new ConflictError('Storyboard is currently being edited by another user');
  }

  // Check permissions
  checkStoryboardAccess(currentStoryboard, req.user.id, true);

  // Build update object
  const updateData = {
    updated_at: new Date().toISOString(),
    locked_by: null,
    locked_at: null
  };

  let shouldCreateVersion = false;

  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined) updateData.description = description;
  if (isPublic !== undefined) updateData.is_public = isPublic;
  if (isCollaborative !== undefined) updateData.is_collaborative = isCollaborative;
  if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
  if (layout !== undefined) updateData.layout = layout;
  if (style !== undefined) updateData.style = style;

  // Handle nodes and edges updates (create new version)
  if (nodes !== undefined || edges !== undefined) {
    const newNodes = nodes || currentStoryboard.nodes;
    const newEdges = edges || currentStoryboard.edges;

    // Validate Cytoscape.js data
    validateCytoscapeData(newNodes, newEdges);

    updateData.nodes = newNodes;
    updateData.edges = newEdges;
    updateData.version = currentStoryboard.version + 1;
    shouldCreateVersion = true;
  }

  // Update storyboard
  const { data: storyboard, error } = await supabase
    .from('storyboards')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Create version record if nodes/edges changed
  if (shouldCreateVersion) {
    await supabase
      .from('storyboard_versions')
      .insert({
        storyboard_id: id,
        version_number: updateData.version,
        nodes: updateData.nodes,
        edges: updateData.edges,
        changed_by: req.user.id,
        change_description: changeDescription || `Version ${updateData.version}`
      });
  }

  // Clear cache
  cache.del(`${CacheKeys.STORYBOARD}${id}`);

  // Log activity
  activityLogger.logStoryboard(req.user.id, id, 'update');

  res.json({
    success: true,
    message: 'Storyboard updated successfully',
    storyboard: {
      id: storyboard.id,
      version: storyboard.version,
      updatedAt: storyboard.updated_at
    }
  });
}));

// Lock storyboard for editing
router.post('/:id/lock', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  // Check current lock status
  const { data: storyboard, error: fetchError } = await supabase
    .from('storyboards')
    .select('locked_by, locked_at, owner_id, collaborators, is_collaborative')
    .eq('id', id)
    .single();

  if (fetchError || !storyboard) {
    throw new NotFoundError('Storyboard');
  }

  // Check permissions
  checkStoryboardAccess(storyboard, req.user.id, true);

  // Check if already locked by another user
  if (storyboard.locked_by &&
      storyboard.locked_by !== req.user.id &&
      storyboard.locked_at &&
      new Date() - new Date(storyboard.locked_at) < 5 * 60 * 1000) { // 5 minutes
    throw new ConflictError('Storyboard is currently locked by another user');
  }

  // Lock the storyboard
  const { error } = await supabase
    .from('storyboards')
    .update({
      locked_by: req.user.id,
      locked_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;

  res.json({
    success: true,
    message: 'Storyboard locked for editing',
    lockedUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
  });
}));

// Unlock storyboard
router.post('/:id/unlock', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  const { error } = await supabase
    .from('storyboards')
    .update({
      locked_by: null,
      locked_at: null
    })
    .eq('id', id)
    .eq('locked_by', req.user.id);

  if (error) throw error;

  res.json({
    success: true,
    message: 'Storyboard unlocked'
  });
}));

// Add collaborator
router.post('/:id/collaborators', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, username } = req.body;

  if (!userId && !username) {
    throw new ValidationError('User ID or username is required');
  }

  const supabase = getSupabase();

  // Get storyboard
  const { data: storyboard, error: fetchError } = await supabase
    .from('storyboards')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !storyboard) {
    throw new NotFoundError('Storyboard');
  }

  // Check if user is owner
  if (storyboard.owner_id !== req.user.id) {
    throw new AuthorizationError('Only the owner can add collaborators');
  }

  // Get user to add
  let targetUserId = userId;
  if (!targetUserId && username) {
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (!user) {
      throw new NotFoundError('User');
    }
    targetUserId = user.id;
  }

  // Check if already collaborator
  if (storyboard.collaborators?.includes(targetUserId)) {
    throw new ValidationError('User is already a collaborator');
  }

  // Add collaborator
  const newCollaborators = [...(storyboard.collaborators || []), targetUserId];

  const { error } = await supabase
    .from('storyboards')
    .update({ collaborators: newCollaborators })
    .eq('id', id);

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.STORYBOARD}${id}`);

  res.json({
    success: true,
    message: 'Collaborator added successfully'
  });
}));

// Remove collaborator
router.delete('/:id/collaborators/:userId', authenticate, asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  const supabase = getSupabase();

  // Get storyboard
  const { data: storyboard, error: fetchError } = await supabase
    .from('storyboards')
    .select('owner_id, collaborators')
    .eq('id', id)
    .single();

  if (fetchError || !storyboard) {
    throw new NotFoundError('Storyboard');
  }

  // Check if user is owner
  if (storyboard.owner_id !== req.user.id) {
    throw new AuthorizationError('Only the owner can remove collaborators');
  }

  // Remove collaborator
  const newCollaborators = (storyboard.collaborators || []).filter(id => id !== userId);

  const { error } = await supabase
    .from('storyboards')
    .update({ collaborators: newCollaborators })
    .eq('id', id);

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.STORYBOARD}${id}`);

  res.json({
    success: true,
    message: 'Collaborator removed successfully'
  });
}));

// Get storyboard versions
router.get('/:id/versions', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const supabase = getSupabase();

  // Check storyboard access
  const { data: storyboard } = await supabase
    .from('storyboards')
    .select('owner_id, collaborators, is_public')
    .eq('id', id)
    .single();

  if (!storyboard) {
    throw new NotFoundError('Storyboard');
  }

  checkStoryboardAccess(storyboard, req.user.id);

  // Get versions
  const { data: versions, count, error } = await supabase
    .from('storyboard_versions')
    .select(`
      id, version_number, change_description, created_at,
      profiles!storyboard_versions_changed_by_fkey(username, display_name)
    `, { count: 'exact' })
    .eq('storyboard_id', id)
    .order('version_number', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  res.json({
    success: true,
    versions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  });
}));

// Delete storyboard
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  // Check if storyboard exists and user is owner
  const { data: storyboard, error: fetchError } = await supabase
    .from('storyboards')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (fetchError || !storyboard) {
    throw new NotFoundError('Storyboard');
  }

  if (storyboard.owner_id !== req.user.id) {
    throw new AuthorizationError('Only the owner can delete the storyboard');
  }

  // Delete storyboard (cascade will handle versions)
  const { error } = await supabase
    .from('storyboards')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Clear cache
  cache.del(`${CacheKeys.STORYBOARD}${id}`);

  // Log activity
  activityLogger.logStoryboard(req.user.id, id, 'delete');

  res.json({
    success: true,
    message: 'Storyboard deleted successfully'
  });
}));

module.exports = router;