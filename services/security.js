// Security Service
// Handles encryption, panic delete, and security-related operations

const CryptoJS = require('crypto-js');
const { getSupabase } = require('../config/supabase');
const { cache } = require('../config/cache');
const { activityLogger } = require('../middleware/logger');

class SecurityService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.panicDeleteCode = process.env.PANIC_DELETE_CODE;
    this.panicDeleteEnabled = process.env.PANIC_DELETE_ENABLED === 'true';
  }

  // Encrypt sensitive data using AES
  encrypt(data) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    try {
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    if (!this.encryptionKey || !encryptedData) {
      return null;
    }

    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  // Hash sensitive data (one-way)
  hash(data) {
    return CryptoJS.SHA256(data).toString();
  }

  // Generate secure random string
  generateSecureToken(length = 32) {
    return CryptoJS.lib.WordArray.random(length / 2).toString();
  }

  // Panic delete - completely remove user data
  async panicDelete(userId, panicCode, ipAddress, userAgent) {
    if (!this.panicDeleteEnabled) {
      throw new Error('Panic delete is disabled');
    }

    if (!panicCode || panicCode !== this.panicDeleteCode) {
      throw new Error('Invalid panic delete code');
    }

    const supabase = getSupabase();
    const deletedItems = [];

    try {
      // Start transaction-like operations
      console.log(`Starting panic delete for user ${userId}`);

      // 1. Get all user data before deletion
      const [articles, storyboards, reviews, profile] = await Promise.all([
        supabase.from('articles').select('id, title').eq('author_id', userId),
        supabase.from('storyboards').select('id, title').eq('owner_id', userId),
        supabase.from('reviews').select('id, article_id').eq('reviewer_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).single()
      ]);

      // 2. Delete articles (this will cascade to reviews on these articles)
      if (articles.data && articles.data.length > 0) {
        const { error: articlesError } = await supabase
          .from('articles')
          .delete()
          .eq('author_id', userId);

        if (!articlesError) {
          deletedItems.push({
            type: 'articles',
            count: articles.data.length,
            items: articles.data.map(a => ({ id: a.id, title: a.title }))
          });
        }
      }

      // 3. Delete storyboards
      if (storyboards.data && storyboards.data.length > 0) {
        const { error: storyboardsError } = await supabase
          .from('storyboards')
          .delete()
          .eq('owner_id', userId);

        if (!storyboardsError) {
          deletedItems.push({
            type: 'storyboards',
            count: storyboards.data.length,
            items: storyboards.data.map(s => ({ id: s.id, title: s.title }))
          });
        }
      }

      // 4. Delete reviews by this user
      if (reviews.data && reviews.data.length > 0) {
        const { error: reviewsError } = await supabase
          .from('reviews')
          .delete()
          .eq('reviewer_id', userId);

        if (!reviewsError) {
          deletedItems.push({
            type: 'reviews',
            count: reviews.data.length,
            items: reviews.data.map(r => ({ id: r.id, articleId: r.article_id }))
          });
        }
      }

      // 5. Delete verification requests
      await supabase
        .from('verification_requests')
        .delete()
        .eq('requested_by', userId);

      // 6. Delete activity logs
      await supabase
        .from('activity_logs')
        .delete()
        .eq('user_id', userId);

      // 7. Finally, delete the profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (!profileError && profile.data) {
        deletedItems.push({
          type: 'profile',
          count: 1,
          items: [{ username: profile.data.username, email: profile.data.email }]
        });
      }

      // 8. Delete from Supabase Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        console.error('Error deleting auth user:', authError);
      }

      // 9. Clear all caches related to this user
      this.clearUserCaches(userId);

      // 10. Log the panic delete
      const deleteLog = {
        user_id: userId,
        deleted_items: deletedItems,
        deletion_type: 'full',
        ip_address: ipAddress,
        user_agent: userAgent
      };

      await supabase
        .from('panic_delete_logs')
        .insert(deleteLog);

      console.log(`Panic delete completed for user ${userId}. Deleted:`, deletedItems);

      return {
        success: true,
        message: 'All user data has been permanently deleted',
        deletedItems,
        deletedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Panic delete error:', error);

      // Log the failed attempt
      await supabase
        .from('panic_delete_logs')
        .insert({
          user_id: userId,
          deleted_items: { error: error.message },
          deletion_type: 'failed',
          ip_address: ipAddress,
          user_agent: userAgent
        }).catch(() => {}); // Silent fail for log

      throw new Error('Panic delete failed. Some data may remain.');
    }
  }

  // Selective delete - remove specific types of data
  async selectiveDelete(userId, dataTypes = [], panicCode, ipAddress, userAgent) {
    if (!this.panicDeleteEnabled) {
      throw new Error('Panic delete is disabled');
    }

    if (!panicCode || panicCode !== this.panicDeleteCode) {
      throw new Error('Invalid panic delete code');
    }

    const supabase = getSupabase();
    const deletedItems = [];

    try {
      for (const dataType of dataTypes) {
        switch (dataType) {
          case 'articles': {
            const { data: articles } = await supabase
              .from('articles')
              .select('id, title')
              .eq('author_id', userId);

            if (articles && articles.length > 0) {
              await supabase.from('articles').delete().eq('author_id', userId);
              deletedItems.push({ type: 'articles', count: articles.length });
            }
            break;
          }

          case 'storyboards': {
            const { data: storyboards } = await supabase
              .from('storyboards')
              .select('id, title')
              .eq('owner_id', userId);

            if (storyboards && storyboards.length > 0) {
              await supabase.from('storyboards').delete().eq('owner_id', userId);
              deletedItems.push({ type: 'storyboards', count: storyboards.length });
            }
            break;
          }

          case 'reviews': {
            const { data: reviews } = await supabase
              .from('reviews')
              .select('id')
              .eq('reviewer_id', userId);

            if (reviews && reviews.length > 0) {
              await supabase.from('reviews').delete().eq('reviewer_id', userId);
              deletedItems.push({ type: 'reviews', count: reviews.length });
            }
            break;
          }

          case 'activity_logs':
            await supabase.from('activity_logs').delete().eq('user_id', userId);
            deletedItems.push({ type: 'activity_logs', count: 'all' });
            break;
        }
      }

      // Clear relevant caches
      this.clearUserCaches(userId);

      // Log selective delete
      await supabase
        .from('panic_delete_logs')
        .insert({
          user_id: userId,
          deleted_items: deletedItems,
          deletion_type: 'selective',
          ip_address: ipAddress,
          user_agent: userAgent
        });

      return {
        success: true,
        message: 'Selected data has been deleted',
        deletedItems,
        deletedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Selective delete error:', error);
      throw new Error('Selective delete failed');
    }
  }

  // Clear all caches related to a user
  clearUserCaches(userId) {
    try {
      // Clear session cache
      cache.del(`session:${userId}`);

      // Clear profile cache
      cache.del(`profile:${userId}`);

      // Clear user stats
      cache.del(`stats:${userId}`);

      // Clear any article caches (we'd need article IDs for specific clearing)
      // For now, just note that article caches may need manual clearing

      console.log(`Cleared caches for user ${userId}`);
    } catch (error) {
      console.error('Cache clearing error:', error);
    }
  }

  // Secure file deletion (for uploaded files)
  async secureFileDelete(filePath) {
    // In a real implementation, this would:
    // 1. Overwrite the file with random data multiple times
    // 2. Delete the file
    // 3. Verify deletion
    // For Supabase Storage, we use their delete API
    const supabase = getSupabase();

    try {
      const { error } = await supabase.storage
        .from('uploads')
        .remove([filePath]);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Secure file delete error:', error);
      return false;
    }
  }

  // Two-factor authentication setup
  async setupTwoFactor(userId) {
    const secret = this.generateSecureToken(32);
    const backupCodes = Array.from({ length: 10 }, () => this.generateSecureToken(8));

    const supabase = getSupabase();

    // Store encrypted 2FA settings
    const encryptedSecret = this.encrypt(secret);
    const encryptedBackupCodes = this.encrypt(backupCodes);

    const { error } = await supabase
      .from('profiles')
      .update({
        security_settings: {
          two_factor: true,
          two_factor_secret: encryptedSecret,
          backup_codes: encryptedBackupCodes
        }
      })
      .eq('id', userId);

    if (error) {
      throw new Error('Failed to setup two-factor authentication');
    }

    // Clear user cache
    cache.del(`session:${userId}`);
    cache.del(`profile:${userId}`);

    return {
      secret,
      backupCodes,
      qrCode: `otpauth://totp/UndergroundVoices:user?secret=${secret}&issuer=UndergroundVoices`
    };
  }

  // Verify two-factor authentication
  async verifyTwoFactor(userId, token) {
    // This would integrate with an OTP library like speakeasy
    // For now, returning a placeholder
    return true; // In real implementation, verify the TOTP token
  }

  // Generate anonymization data
  anonymizeUser(userData) {
    const anonymized = {
      ...userData,
      username: `anon_${this.hash(userData.id).substring(0, 8)}`,
      display_name: 'Anonymous User',
      bio: '',
      email: `${this.hash(userData.email).substring(0, 16)}@anonymous.local`,
      avatar_url: null,
      is_anonymous: true
    };

    return anonymized;
  }

  // Data export for GDPR compliance
  async exportUserData(userId) {
    const supabase = getSupabase();

    try {
      const [profile, articles, storyboards, reviews, logs] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('articles').select('*').eq('author_id', userId),
        supabase.from('storyboards').select('*').eq('owner_id', userId),
        supabase.from('reviews').select('*').eq('reviewer_id', userId),
        supabase.from('activity_logs').select('*').eq('user_id', userId).limit(1000)
      ]);

      const exportData = {
        profile: profile.data,
        articles: articles.data || [],
        storyboards: storyboards.data || [],
        reviews: reviews.data || [],
        activityLogs: logs.data || [],
        exportedAt: new Date().toISOString(),
        format: 'JSON'
      };

      return exportData;
    } catch (error) {
      console.error('Data export error:', error);
      throw new Error('Failed to export user data');
    }
  }
}

module.exports = new SecurityService();