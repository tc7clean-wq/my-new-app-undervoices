# Underground Voices - Deployment Guide

This project consists of a React frontend and a Node.js backend, both designed to be deployed on Vercel's free tier.

## Architecture Overview

- **Frontend**: React 18 + Vite (hosted on Vercel)
- **Backend**: Node.js + Express (hosted on Vercel)
- **Database**: Supabase PostgreSQL (free tier)
- **File Storage**: Supabase Storage (free tier)
- **Real-time**: Supabase Real-time subscriptions

## Prerequisites

1. GitHub account
2. Vercel account (connected to GitHub)
3. Supabase account
4. NewsAPI account (free tier)

## Step 1: Database Setup (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be ready
3. Go to **SQL Editor** and run the schema from `config/supabase.js`
4. Go to **Settings > API** and copy:
   - Project URL
   - Anon key
   - Service key

## Step 2: External Services

### NewsAPI Setup
1. Go to [newsapi.org](https://newsapi.org) and sign up for free
2. Get your API key from the dashboard

## Step 3: Backend Deployment

1. **Fork/Clone this repository** to your GitHub account

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Configure the backend:
     - Framework Preset: **Other**
     - Root Directory: `.` (root)
     - Build Command: `npm install`
     - Output Directory: `.` (keep empty)
     - Install Command: `npm install`

3. **Environment Variables** (in Vercel dashboard):
   ```env
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://your-frontend-url.vercel.app

   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key

   # JWT
   JWT_SECRET=your-super-secret-32-character-minimum-key
   JWT_EXPIRE=7d
   JWT_REFRESH_EXPIRE=30d

   # NewsAPI
   NEWS_API_KEY=your-newsapi-key
   NEWS_API_URL=https://newsapi.org/v2

   # Security
   ENCRYPTION_KEY=your-256-bit-encryption-key
   PANIC_DELETE_CODE=your-emergency-code
   PANIC_DELETE_ENABLED=true

   # Performance
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   CACHE_TTL=3600
   ```

4. **Deploy**: Click "Deploy" and wait for completion

## Step 4: Frontend Deployment

1. **Create a new Vercel project** for the frontend:
   - Import the same GitHub repository
   - Configure the frontend:
     - Framework Preset: **Vite**
     - Root Directory: `.` (root)
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Install Command: `npm install`

2. **Environment Variables** (in Vercel dashboard):
   ```env
   VITE_API_URL=https://your-backend-url.vercel.app/api
   VITE_ENABLE_OFFLINE_MODE=true
   VITE_ENABLE_VOICE_HINTS=true
   VITE_ENABLE_GESTURE_CONTROLS=true
   ```

3. **Deploy**: Click "Deploy"

## Step 5: Domain Configuration

1. **Backend Domain**: Copy the Vercel URL (e.g., `your-backend.vercel.app`)
2. **Frontend Domain**: Copy the Vercel URL (e.g., `your-frontend.vercel.app`)
3. **Update Environment Variables**:
   - Update `FRONTEND_URL` in backend environment variables
   - Update `VITE_API_URL` in frontend environment variables

## Step 6: Supabase Configuration

1. Go to **Authentication > Settings**
2. Add your frontend domain to **Site URL**
3. Add your frontend domain to **Redirect URLs**
4. Go to **Settings > API** and configure:
   - Enable RLS (Row Level Security)
   - Set up authentication policies

## Step 7: Testing

1. Visit your frontend URL
2. Try creating an account
3. Test article creation
4. Test storyboard functionality
5. Verify real-time collaboration works

## Troubleshooting

### Common Issues

1. **CORS Errors**:
   - Ensure `FRONTEND_URL` is correctly set in backend
   - Check Supabase CORS settings

2. **Authentication Failures**:
   - Verify JWT secrets are identical
   - Check Supabase configuration

3. **Database Connection Issues**:
   - Verify Supabase credentials
   - Check if database schema is properly created

4. **API Rate Limits**:
   - NewsAPI free tier has 1000 requests/day
   - Supabase free tier has limits on database operations

### Performance Optimization

1. **Caching**: The app uses in-memory caching to reduce API calls
2. **Compression**: Vercel automatically compresses responses
3. **CDN**: Static assets are served via Vercel's CDN
4. **Code Splitting**: React components are lazy-loaded

### Monitoring

1. **Vercel Analytics**: Enable in Vercel dashboard
2. **Supabase Dashboard**: Monitor database performance
3. **Error Tracking**: Check Vercel function logs

## Security Considerations

1. **Environment Variables**: Never commit secrets to Git
2. **API Keys**: Rotate keys regularly
3. **Database**: Enable RLS on all tables
4. **Authentication**: JWT tokens expire after 7 days
5. **Panic Delete**: Emergency data deletion is available

## Free Tier Limitations

### Vercel
- 100GB bandwidth/month
- 1000 deployments/month
- 100GB-hrs compute time/month

### Supabase
- 2 projects
- 500MB database storage
- 1GB file storage
- 50,000 monthly active users

### NewsAPI
- 1000 requests/day
- Developer tier only

## Scaling Up

When you outgrow free tiers:

1. **Vercel Pro**: $20/month for more resources
2. **Supabase Pro**: $25/month for production features
3. **NewsAPI Business**: $449/month for commercial use
4. **Consider**: Redis for caching, CDN for media files

## Support

- Check Vercel documentation for deployment issues
- Check Supabase documentation for database issues
- Create GitHub issues for application bugs