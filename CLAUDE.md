# Underground Voices Backend

## Project Overview
Zero-budget platform for underground non-biased journalists with real-time collaborative "Connect the Dots" feature. Built for mobile-first experience with performance optimizations.

## Tech Stack
- **Runtime**: Node.js 18.x
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL + Real-time + Auth)
- **Hosting**: Vercel (Free Tier)
- **Cache**: In-memory (node-cache)
- **Security**: JWT + CryptoJS encryption
- **External APIs**: NewsAPI (Free Tier)

## Key Features
- ✅ JWT Authentication with Supabase
- ✅ User profiles with preferences (theme, language, anonymity)
- ✅ Articles CRUD with tags and encryption
- ✅ Real-time collaborative storyboards (Cytoscape.js format)
- ✅ NewsAPI integration for fact-checking
- ✅ Peer review and voting system
- ✅ Security features (panic delete, encryption)
- ✅ Mobile-first optimizations (<2s response time)
- ✅ Performance monitoring and caching

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /refresh` - Refresh JWT token
- `POST /logout` - Logout user
- `GET /me` - Get current user
- `POST /change-password` - Change password
- `POST /forgot-password` - Request password reset

### Profiles (`/api/profiles`)
- `GET /:identifier` - Get profile by ID or username
- `PUT /:id` - Update profile
- `POST /:id/toggle-anonymous` - Toggle anonymous mode
- `GET /:id/articles` - Get user's articles
- `GET /:id/storyboards` - Get user's storyboards
- `GET /:id/stats` - Get user statistics
- `DELETE /:id` - Delete profile

### Articles (`/api/articles`)
- `GET /` - Get published articles (with filters)
- `GET /:identifier` - Get article by ID or slug
- `POST /` - Create article
- `PUT /:id` - Update article
- `DELETE /:id` - Delete article
- `POST /:id/share` - Increment share count
- `GET /trending/now` - Get trending articles
- `GET /tag/:tagName` - Get articles by tag

### Storyboards (`/api/storyboards`)
- `GET /` - Get user's storyboards
- `GET /public` - Get public storyboards
- `GET /:id` - Get specific storyboard
- `POST /` - Create storyboard
- `PUT /:id` - Update storyboard
- `POST /:id/lock` - Lock for editing
- `POST /:id/unlock` - Unlock storyboard
- `POST /:id/collaborators` - Add collaborator
- `DELETE /:id/collaborators/:userId` - Remove collaborator
- `GET /:id/versions` - Get storyboard versions
- `DELETE /:id` - Delete storyboard

### Verification (`/api/verify`)
- `POST /article/:id` - Verify article with NewsAPI
- `GET /article/:id/history` - Get verification history
- `GET /news/search` - Search news articles
- `GET /news/headlines` - Get top headlines
- `GET /news/sources` - Get news sources
- `GET /stats` - Get verification statistics

### Reviews (`/api/reviews`)
- `GET /article/:articleId` - Get article reviews
- `POST /article/:articleId` - Create review
- `PUT /:reviewId` - Update review
- `DELETE /:reviewId` - Delete review
- `POST /:reviewId/helpful` - Mark review as helpful
- `GET /user/:userId` - Get user's reviews
- `GET /stats` - Get review statistics

## Environment Variables
```bash
# Server Configuration
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend-url.vercel.app

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# NewsAPI Configuration
NEWS_API_KEY=your-newsapi-key-here
NEWS_API_URL=https://newsapi.org/v2

# Encryption Keys
ENCRYPTION_KEY=your-256-bit-encryption-key-here
ENCRYPTION_IV=your-initialization-vector-here

# Panic Delete Configuration
PANIC_DELETE_CODE=your-emergency-delete-code
PANIC_DELETE_ENABLED=true

# Performance & Cache
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL=3600
CACHE_CHECK_PERIOD=600
CACHE_MAX_KEYS=1000

# Mobile Optimization
MOBILE_RESPONSE_TIMEOUT=2000
MOBILE_COMPRESSION_LEVEL=6
```

## Database Setup (Supabase)

### Required Tables
Execute these SQL commands in your Supabase SQL editor:

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  theme_preference TEXT DEFAULT 'system',
  language TEXT DEFAULT 'en',
  notification_settings JSONB,
  security_settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Articles table
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  encrypted_content TEXT,
  summary TEXT,
  tags TEXT[],
  category TEXT,
  status TEXT DEFAULT 'draft',
  is_anonymous BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  verification_status TEXT DEFAULT 'pending',
  verification_data JSONB,
  metadata JSONB,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Storyboards table
CREATE TABLE storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  is_collaborative BOOLEAN DEFAULT true,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  layout JSONB,
  style JSONB,
  collaborators UUID[],
  version INTEGER DEFAULT 1,
  locked_by UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  credibility_score DECIMAL(3,2),
  bias_score DECIMAL(3,2),
  review_text TEXT,
  evidence_links TEXT[],
  is_expert_review BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Additional tables (verification_requests, activity_logs, etc.)
-- See config/supabase.js for complete schema
```

## Deployment Instructions

### 1. Supabase Setup
1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → API to get your keys
4. Execute SQL schema from above
5. Enable Row Level Security (RLS) policies

### 2. NewsAPI Setup
1. Register at [newsapi.org](https://newsapi.org)
2. Get your free API key
3. Add to environment variables

### 3. Vercel Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Add environment variables via Vercel dashboard or CLI
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
# ... add all other environment variables
```

### 4. GitHub Integration
```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit"

# Add GitHub remote
git remote add origin https://github.com/yourusername/underground-voices-backend.git
git push -u origin main

# Link with Vercel for auto-deployment
```

## Mobile-First Optimizations
- Response time target: <2 seconds
- Compression enabled (level 6)
- Efficient caching strategy
- Rate limiting to protect free tier
- Optimized database queries with pagination
- Mobile-friendly error responses

## Security Features
- JWT authentication with refresh tokens
- CryptoJS encryption for sensitive content
- Panic delete functionality
- Rate limiting
- Input validation and sanitization
- CORS and security headers
- Activity logging and audit trail

## Performance Monitoring
- Real-time performance metrics
- Cache hit/miss tracking
- Slow request detection (>2s)
- Memory usage monitoring
- Error rate tracking

## Real-time Features
- Collaborative storyboard editing
- Real-time conflict resolution
- Live article updates
- Review notifications
- Version control for storyboards

## Testing
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/articles
```

## Support
For issues and questions, refer to the project documentation or create an issue in the GitHub repository.