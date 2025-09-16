# Underground Voices Backend 🎯

**Zero-budget platform for underground non-biased journalists with real-time collaborative "Connect the Dots" feature.**

![Node.js](https://img.shields.io/badge/node.js-18.x-green)
![Express](https://img.shields.io/badge/express-4.18.2-blue)
![Supabase](https://img.shields.io/badge/supabase-2.39.3-green)
![Vercel](https://img.shields.io/badge/vercel-ready-black)
![Mobile First](https://img.shields.io/badge/mobile-first-orange)

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x
- Supabase account (free tier)
- NewsAPI key (free tier)
- Vercel account (free tier)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd underground-voices-backend

# Copy the correct package.json
cp backend-package.json package.json

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your actual values

# Run deployment check
node scripts/deploy.js

# Start development server
npm run dev
```

## 📁 Project Structure
```
underground-voices-backend/
├── config/           # Database and cache configuration
├── middleware/       # Authentication, logging, error handling
├── routes/          # API endpoints
├── services/        # Business logic (security, realtime, backup)
├── scripts/         # Deployment and utility scripts
├── index.js         # Main server file
├── vercel.json      # Vercel deployment config
└── CLAUDE.md        # Detailed technical documentation
```

## ⚡ Core Features

### 🔐 Authentication & Security
- JWT-based authentication with Supabase
- Panic delete functionality for emergency data removal
- CryptoJS encryption for sensitive content
- Rate limiting and security headers
- Two-factor authentication support

### 📝 Content Management
- **Articles**: Full CRUD with tags, categories, encryption
- **Storyboards**: Real-time collaborative mind mapping
- **Reviews**: Peer review system with credibility scoring
- **Verification**: NewsAPI integration for fact-checking

### 🌐 Real-time Features
- Collaborative storyboard editing
- Live conflict resolution
- Real-time notifications
- Version control for storyboards

### 📱 Mobile-First Design
- <2 second response time target
- Compression and caching
- Mobile-optimized error handling
- Progressive data loading

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Articles
- `GET /api/articles` - List articles with filters
- `POST /api/articles` - Create article
- `GET /api/articles/:id` - Get specific article
- `PUT /api/articles/:id` - Update article

### Storyboards (Connect the Dots)
- `GET /api/storyboards` - Get user's storyboards
- `POST /api/storyboards` - Create storyboard
- `PUT /api/storyboards/:id` - Update with conflict resolution
- `POST /api/storyboards/:id/lock` - Lock for editing

### Verification
- `POST /api/verify/article/:id` - Verify article with NewsAPI
- `GET /api/verify/news/search` - Search news articles
- `GET /api/verify/news/headlines` - Get trending headlines

*See [CLAUDE.md](./CLAUDE.md) for complete API documentation*

## 🔑 Environment Setup

### 1. Supabase Configuration
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### 2. JWT Configuration
```bash
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRE=7d
```

### 3. NewsAPI Configuration
```bash
NEWS_API_KEY=your-newsapi-key
```

### 4. Security Configuration
```bash
ENCRYPTION_KEY=your-256-bit-encryption-key
PANIC_DELETE_CODE=your-emergency-delete-code
PANIC_DELETE_ENABLED=true
```

## 🗄️ Database Setup

Execute this SQL in your Supabase SQL editor:

```sql
-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create profiles table
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

-- See CLAUDE.md for complete schema
```

## 🚀 Deployment

### Vercel Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Login and deploy
vercel login
vercel --prod

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
# ... add all required environment variables
```

### GitHub Integration
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/underground-voices-backend.git
git push -u origin main
```

## 🎯 2025 UX Best Practices

### Mobile-First Optimization
- **Performance**: Sub-2 second response times
- **Compression**: Gzip compression for all responses
- **Caching**: Intelligent caching strategy
- **Pagination**: Efficient data loading

### Real-time Collaboration
- **Supabase Subscriptions**: Live data updates
- **Conflict Resolution**: Automated merge handling
- **Version Control**: Change tracking for storyboards
- **Lock Management**: Prevent editing conflicts

### Security-First
- **Encryption**: Client-side and server-side encryption
- **Anonymity**: Anonymous posting capabilities
- **Panic Delete**: Emergency data removal
- **Audit Trails**: Complete activity logging

## 📊 Monitoring & Performance

### Built-in Monitoring
- Response time tracking
- Cache hit/miss rates
- Error rate monitoring
- Memory usage tracking
- Mobile vs desktop usage

### Health Check
```bash
curl https://your-deployment.vercel.app/health
```

## 🔒 Security Features

### Data Protection
- AES encryption for sensitive content
- Secure token generation
- Password hashing with bcrypt
- CORS and security headers

### Privacy Features
- Anonymous posting mode
- Data export (GDPR compliance)
- Selective data deletion
- Activity anonymization

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues
1. **CORS Errors**: Check `FRONTEND_URL` environment variable
2. **Database Connection**: Verify Supabase credentials
3. **NewsAPI Limits**: Monitor free tier quota
4. **Vercel Timeouts**: Check function duration limits

### Support
- Check [CLAUDE.md](./CLAUDE.md) for detailed documentation
- Review deployment logs in Vercel dashboard
- Monitor Supabase dashboard for database issues

## 🌟 Features in Development
- WebSocket real-time connections
- Advanced analytics dashboard
- Multi-language support
- Advanced encryption options
- Mobile app companion

---

**Built for underground journalists who value truth, privacy, and collaboration.** 🗞️✊

*Optimized for 2025 UX standards with mobile-first design and real-time collaboration.*