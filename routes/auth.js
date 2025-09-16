// Authentication Routes
// Handle user registration, login, and session management

const express = require('express');
const bcrypt = require('bcryptjs');
const { getSupabase } = require('../config/supabase');
const { generateTokens, refreshAuth, logout, authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, AuthenticationError } = require('../middleware/errorHandler');
const { activityLogger } = require('../middleware/logger');
const { cache, CacheKeys } = require('../config/cache');

const router = express.Router();

// Register new user
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, username, displayName, bio, isAnonymous } = req.body;

  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const supabase = getSupabase();

  // Create user with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName
      }
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      throw new ValidationError('Email already registered');
    }
    throw new AuthenticationError(authError.message);
  }

  // Create user profile
  const profileData = {
    id: authData.user.id,
    username: username || email.split('@')[0],
    display_name: displayName || username || 'Anonymous Journalist',
    bio: bio || '',
    is_anonymous: isAnonymous || false,
    theme_preference: 'system',
    language: 'en',
    notification_settings: {
      email: true,
      push: false,
      storyboard_updates: true,
      article_reviews: true
    },
    security_settings: {
      two_factor: false,
      panic_delete: true,
      encryption: false
    }
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .insert(profileData);

  if (profileError) {
    console.error('Profile creation error:', profileError);
    // Try to delete auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error('Failed to create user profile');
  }

  // Generate tokens
  const tokens = generateTokens(authData.user.id, email);

  // Log activity
  activityLogger.logAuth(authData.user.id, 'register', true);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    user: {
      id: authData.user.id,
      email,
      username: profileData.username,
      displayName: profileData.display_name
    },
    ...tokens
  });
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body;

  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const supabase = getSupabase();

  // Sign in with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    activityLogger.logAuth(null, 'login', false);
    throw new AuthenticationError('Invalid credentials');
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthenticationError('User profile not found');
  }

  // Update last active
  await supabase
    .from('profiles')
    .update({ last_active: new Date().toISOString() })
    .eq('id', authData.user.id);

  // Generate tokens with extended expiry if remember me
  const tokens = rememberMe
    ? generateTokens(authData.user.id, email)
    : generateTokens(authData.user.id, email);

  // Cache user session
  cache.set(`${CacheKeys.SESSION}${authData.user.id}`, profile, 300);

  // Log activity
  activityLogger.logAuth(authData.user.id, 'login', true);

  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: profile.id,
      email: authData.user.email,
      username: profile.username,
      displayName: profile.display_name,
      isAnonymous: profile.is_anonymous,
      isVerified: profile.is_verified,
      preferences: {
        theme: profile.theme_preference,
        language: profile.language
      }
    },
    ...tokens
  });
}));

// Refresh token
router.post('/refresh', refreshAuth);

// Logout
router.post('/logout', authenticate, logout);

// Get current user
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  // Get fresh user data
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error || !profile) {
    throw new AuthenticationError('User not found');
  }

  res.json({
    success: true,
    user: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      isAnonymous: profile.is_anonymous,
      isVerified: profile.is_verified,
      preferences: {
        theme: profile.theme_preference,
        language: profile.language,
        notifications: profile.notification_settings
      },
      security: {
        twoFactor: profile.security_settings?.two_factor,
        panicDelete: profile.security_settings?.panic_delete,
        encryption: profile.security_settings?.encryption
      },
      createdAt: profile.created_at,
      lastActive: profile.last_active
    }
  });
}));

// Update password
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current and new passwords are required');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  const supabase = getSupabase();

  // Verify current password by attempting to sign in
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: req.user.email,
    password: currentPassword
  });

  if (authError) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Update password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (updateError) {
    throw new Error('Failed to update password');
  }

  // Log activity
  activityLogger.logAuth(req.user.id, 'password-change', true);

  res.json({
    success: true,
    message: 'Password updated successfully'
  });
}));

// Request password reset
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  const supabase = getSupabase();

  // Send reset email (Supabase handles this)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`
  });

  if (error) {
    // Don't reveal if email exists or not
    console.error('Password reset error:', error);
  }

  // Always return success to prevent email enumeration
  res.json({
    success: true,
    message: 'If the email exists, a reset link has been sent'
  });
}));

// Verify email
router.get('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    throw new ValidationError('Verification token required');
  }

  const supabase = getSupabase();

  // Verify the token with Supabase
  const { error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: 'email'
  });

  if (error) {
    throw new AuthenticationError('Invalid or expired verification token');
  }

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

module.exports = router;