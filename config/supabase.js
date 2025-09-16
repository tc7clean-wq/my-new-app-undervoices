// Supabase Configuration and Database Models
// Handles all database connections and real-time subscriptions

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

// Initialize Supabase client
const initializeSupabase = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Supabase credentials not found in environment variables');
    return null;
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10 // Rate limit for real-time events
        }
      },
      global: {
        headers: {
          'X-Client-Info': 'underground-voices/1.0.0'
        }
      }
    }
  );

  console.log('Supabase client initialized successfully');
  return supabase;
};

// Get Supabase client instance
const getSupabase = () => {
  if (!supabase) {
    return initializeSupabase();
  }
  return supabase;
};

// Database Schema Definitions (for reference)
const databaseSchema = {
  // Users table (managed by Supabase Auth)
  users: {
    id: 'uuid PRIMARY KEY',
    email: 'text UNIQUE',
    created_at: 'timestamp with time zone DEFAULT now()',
    updated_at: 'timestamp with time zone DEFAULT now()'
  },

  // User profiles table
  profiles: {
    id: 'uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE',
    username: 'text UNIQUE',
    display_name: 'text',
    bio: 'text',
    avatar_url: 'text',
    is_anonymous: 'boolean DEFAULT false',
    is_verified: 'boolean DEFAULT false',
    theme_preference: 'text DEFAULT "system"', // light, dark, system
    language: 'text DEFAULT "en"',
    notification_settings: 'jsonb',
    security_settings: 'jsonb',
    created_at: 'timestamp with time zone DEFAULT now()',
    updated_at: 'timestamp with time zone DEFAULT now()',
    last_active: 'timestamp with time zone DEFAULT now()'
  },

  // Articles table
  articles: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    author_id: 'uuid REFERENCES profiles(id) ON DELETE SET NULL',
    title: 'text NOT NULL',
    slug: 'text UNIQUE NOT NULL',
    content: 'text NOT NULL',
    encrypted_content: 'text', // For sensitive articles
    summary: 'text',
    tags: 'text[]',
    category: 'text',
    status: 'text DEFAULT "draft"', // draft, published, archived, deleted
    is_anonymous: 'boolean DEFAULT false',
    view_count: 'integer DEFAULT 0',
    share_count: 'integer DEFAULT 0',
    verification_status: 'text DEFAULT "pending"', // pending, verified, disputed
    verification_data: 'jsonb',
    metadata: 'jsonb',
    published_at: 'timestamp with time zone',
    created_at: 'timestamp with time zone DEFAULT now()',
    updated_at: 'timestamp with time zone DEFAULT now()'
  },

  // Storyboards (Connect the Dots feature)
  storyboards: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    owner_id: 'uuid REFERENCES profiles(id) ON DELETE CASCADE',
    title: 'text NOT NULL',
    description: 'text',
    is_public: 'boolean DEFAULT false',
    is_collaborative: 'boolean DEFAULT true',
    nodes: 'jsonb NOT NULL', // Cytoscape.js format
    edges: 'jsonb NOT NULL', // Cytoscape.js format
    layout: 'jsonb',
    style: 'jsonb',
    collaborators: 'uuid[]',
    version: 'integer DEFAULT 1',
    locked_by: 'uuid',
    locked_at: 'timestamp with time zone',
    tags: 'text[]',
    created_at: 'timestamp with time zone DEFAULT now()',
    updated_at: 'timestamp with time zone DEFAULT now()'
  },

  // Storyboard versions for conflict resolution
  storyboard_versions: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    storyboard_id: 'uuid REFERENCES storyboards(id) ON DELETE CASCADE',
    version_number: 'integer NOT NULL',
    nodes: 'jsonb NOT NULL',
    edges: 'jsonb NOT NULL',
    changed_by: 'uuid REFERENCES profiles(id)',
    change_description: 'text',
    created_at: 'timestamp with time zone DEFAULT now()'
  },

  // Reviews and ratings
  reviews: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    article_id: 'uuid REFERENCES articles(id) ON DELETE CASCADE',
    reviewer_id: 'uuid REFERENCES profiles(id) ON DELETE CASCADE',
    rating: 'integer CHECK (rating >= 1 AND rating <= 5)',
    credibility_score: 'decimal(3,2)', // 0.00 to 1.00
    bias_score: 'decimal(3,2)', // 0.00 to 1.00
    review_text: 'text',
    evidence_links: 'text[]',
    is_expert_review: 'boolean DEFAULT false',
    helpful_count: 'integer DEFAULT 0',
    created_at: 'timestamp with time zone DEFAULT now()',
    updated_at: 'timestamp with time zone DEFAULT now()'
  },

  // Verification requests
  verification_requests: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    article_id: 'uuid REFERENCES articles(id) ON DELETE CASCADE',
    requested_by: 'uuid REFERENCES profiles(id)',
    verification_type: 'text', // fact-check, source-verify, bias-check
    status: 'text DEFAULT "pending"', // pending, in-progress, completed
    results: 'jsonb',
    newsapi_data: 'jsonb',
    created_at: 'timestamp with time zone DEFAULT now()',
    completed_at: 'timestamp with time zone'
  },

  // Panic delete logs (for security)
  panic_delete_logs: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    user_id: 'uuid REFERENCES profiles(id) ON DELETE CASCADE',
    deleted_items: 'jsonb',
    deletion_type: 'text', // full, selective
    ip_address: 'inet',
    user_agent: 'text',
    created_at: 'timestamp with time zone DEFAULT now()'
  },

  // Activity logs for audit trail
  activity_logs: {
    id: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    user_id: 'uuid REFERENCES profiles(id) ON DELETE SET NULL',
    action: 'text NOT NULL',
    resource_type: 'text',
    resource_id: 'uuid',
    details: 'jsonb',
    ip_address: 'inet',
    user_agent: 'text',
    created_at: 'timestamp with time zone DEFAULT now()'
  }
};

// Create tables if they don't exist (run once during setup)
const createTables = async () => {
  const client = getSupabase();
  if (!client) return false;

  try {
    // Note: In production, these tables should be created via Supabase Dashboard
    // or migration files. This is for reference only.
    console.log('Database schema ready. Tables should be created via Supabase Dashboard.');
    return true;
  } catch (error) {
    console.error('Error setting up database:', error);
    return false;
  }
};

// Helper functions for common queries
const dbHelpers = {
  // Check if a user exists
  userExists: async (userId) => {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    return !error && data;
  },

  // Get user profile with preferences
  getUserProfile: async (userId) => {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // Update last active timestamp
  updateLastActive: async (userId) => {
    const { error } = await getSupabase()
      .from('profiles')
      .update({ last_active: new Date().toISOString() })
      .eq('id', userId);

    return !error;
  },

  // Log activity
  logActivity: async (userId, action, resourceType, resourceId, details) => {
    const { error } = await getSupabase()
      .from('activity_logs')
      .insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details
      });

    return !error;
  }
};

module.exports = {
  initializeSupabase,
  getSupabase,
  databaseSchema,
  createTables,
  dbHelpers
};