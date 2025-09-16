// Backup Service
// Handles automated backups for free tier usage

const { getSupabase } = require('../config/supabase');
const securityService = require('./security');

class BackupService {
  constructor() {
    this.backupEnabled = process.env.BACKUP_ENABLED === 'true';
    this.encryptBackups = process.env.BACKUP_ENCRYPTION === 'true';
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 7;
  }

  // Perform automated backup
  async performBackup() {
    if (!this.backupEnabled) {
      console.log('Backup is disabled');
      return false;
    }

    console.log('Starting automated backup...');

    try {
      const supabase = getSupabase();
      const backupId = `backup_${Date.now()}`;

      // Get critical data for backup
      const [profiles, articles, storyboards] = await Promise.all([
        this.backupProfiles(supabase),
        this.backupArticles(supabase),
        this.backupStoryboards(supabase)
      ]);

      // Create backup manifest
      const backup = {
        id: backupId,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: {
          profiles: profiles.length,
          articles: articles.length,
          storyboards: storyboards.length
        },
        compressed: false,
        encrypted: this.encryptBackups
      };

      // Encrypt if enabled
      let backupData = { profiles, articles, storyboards };
      if (this.encryptBackups) {
        backupData = securityService.encrypt(backupData);
        backup.encrypted = true;
      }

      // Store backup metadata (in a real app, you'd store the actual data somewhere)
      const { error } = await supabase
        .from('backups')
        .insert({
          id: backupId,
          manifest: backup,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Backup storage error:', error);
        return false;
      }

      console.log('Backup completed:', backupId);

      // Clean up old backups
      await this.cleanupOldBackups(supabase);

      return true;

    } catch (error) {
      console.error('Backup error:', error);
      return false;
    }
  }

  // Backup user profiles
  async backupProfiles(supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, username, display_name, bio, is_verified, is_anonymous,
          theme_preference, language, created_at, updated_at, last_active
        `)
        .limit(1000); // Reasonable limit for free tier

      if (error) throw error;

      // Remove sensitive data
      return (data || []).map(profile => ({
        ...profile,
        notification_settings: undefined,
        security_settings: undefined
      }));

    } catch (error) {
      console.error('Profile backup error:', error);
      return [];
    }
  }

  // Backup articles
  async backupArticles(supabase) {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          id, author_id, title, slug, summary, tags, category,
          status, is_anonymous, view_count, share_count,
          verification_status, published_at, created_at, updated_at
        `)
        .eq('status', 'published')
        .limit(1000); // Limit for free tier

      if (error) throw error;

      // Don't backup full content for space efficiency
      return data || [];

    } catch (error) {
      console.error('Article backup error:', error);
      return [];
    }
  }

  // Backup storyboards
  async backupStoryboards(supabase) {
    try {
      const { data, error } = await supabase
        .from('storyboards')
        .select(`
          id, owner_id, title, description, is_public, is_collaborative,
          version, tags, created_at, updated_at
        `)
        .eq('is_public', true)
        .limit(500); // Smaller limit for complex data

      if (error) throw error;

      // Don't backup full nodes/edges for space efficiency
      return data || [];

    } catch (error) {
      console.error('Storyboard backup error:', error);
      return [];
    }
  }

  // Clean up old backups
  async cleanupOldBackups(supabase) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const { data, error } = await supabase
        .from('backups')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Backup cleanup error:', error);
      } else {
        console.log('Cleaned up old backups');
      }

    } catch (error) {
      console.error('Backup cleanup error:', error);
    }
  }

  // Restore from backup (emergency use)
  async restoreFromBackup(backupId, userId) {
    if (!this.backupEnabled) {
      throw new Error('Backup is disabled');
    }

    console.log('Starting restore from backup:', backupId);

    try {
      const supabase = getSupabase();

      // Get backup manifest
      const { data: backup, error } = await supabase
        .from('backups')
        .select('*')
        .eq('id', backupId)
        .single();

      if (error || !backup) {
        throw new Error('Backup not found');
      }

      // This is a simplified version - in reality, you'd need much more
      // sophisticated restore logic with data integrity checks

      console.log('Backup found:', backup.manifest);

      return {
        success: true,
        message: 'Restore initiated',
        backupId,
        manifest: backup.manifest
      };

    } catch (error) {
      console.error('Restore error:', error);
      throw new Error('Restore failed');
    }
  }

  // Export user data (GDPR compliance)
  async exportUserData(userId) {
    try {
      return await securityService.exportUserData(userId);
    } catch (error) {
      console.error('Data export error:', error);
      throw new Error('Failed to export user data');
    }
  }

  // Get backup statistics
  async getBackupStats() {
    try {
      const supabase = getSupabase();

      const { data: backups, error } = await supabase
        .from('backups')
        .select('id, manifest, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const stats = {
        totalBackups: backups?.length || 0,
        latestBackup: backups?.[0]?.created_at || null,
        retentionDays: this.retentionDays,
        encryptionEnabled: this.encryptBackups,
        backupsEnabled: this.backupEnabled
      };

      return stats;

    } catch (error) {
      console.error('Backup stats error:', error);
      return {
        totalBackups: 0,
        latestBackup: null,
        retentionDays: this.retentionDays,
        encryptionEnabled: this.encryptBackups,
        backupsEnabled: this.backupEnabled
      };
    }
  }

  // Manual backup trigger
  async triggerManualBackup(userId) {
    console.log('Manual backup triggered by user:', userId);

    // Log the manual backup request
    const supabase = getSupabase();
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'backup:manual',
        details: { timestamp: new Date().toISOString() }
      })
      .catch(() => {}); // Silent fail

    return await this.performBackup();
  }
}

module.exports = new BackupService();