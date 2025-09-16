// Underground Voices Backend - Main Server Entry Point
// Mobile-first, real-time collaboration platform for underground journalists
// Built for zero-budget deployment on Vercel with Supabase

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { performanceMonitor } = require('./middleware/performance');

// Import routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profiles');
const articleRoutes = require('./routes/articles');
const storyboardRoutes = require('./routes/storyboards');
const verifyRoutes = require('./routes/verify');
const reviewRoutes = require('./routes/reviews');

// Import services
const { initializeSupabase } = require('./config/supabase');
const { setupRealtimeHandlers } = require('./services/realtime');
const { backupService } = require('./services/backup');
const cache = require('./config/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase connection
initializeSupabase();

// Security middleware - Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration for cross-origin requests
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Type', 'X-Client-Version'],
}));

// Compression for response optimization (mobile-first)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level for performance
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // Support for larger payloads (articles, images)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Performance monitoring for mobile optimization
app.use(performanceMonitor);

// Rate limiting configuration (free tier protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    cache.set(`rate-limit-${req.ip}`, true, 900); // Cache for 15 mins
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 900,
      mobile: true // Mobile-friendly error response
    });
  }
});

// API rate limiter for specific endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for API endpoints
  skipSuccessfulRequests: false,
});

// Health check endpoint (for Vercel)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: cache.getStats(),
    uptime: process.uptime()
  });
});

// Apply rate limiting to all routes
app.use('/api/', limiter);

// API Routes with rate limiting
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/profiles', apiLimiter, profileRoutes);
app.use('/api/articles', apiLimiter, articleRoutes);
app.use('/api/storyboards', apiLimiter, storyboardRoutes);
app.use('/api/verify', apiLimiter, verifyRoutes);
app.use('/api/reviews', apiLimiter, reviewRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Underground Voices API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      auth: '/api/auth',
      profiles: '/api/profiles',
      articles: '/api/articles',
      storyboards: '/api/storyboards',
      verify: '/api/verify',
      reviews: '/api/reviews',
      health: '/health'
    },
    mobile_optimized: true,
    real_time_enabled: true
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Setup real-time handlers for Supabase subscriptions
setupRealtimeHandlers();

// Scheduled tasks using node-cron
// Daily backup at 2 AM (free tier friendly)
cron.schedule('0 2 * * *', async () => {
  console.log('Running daily backup...');
  await backupService.performBackup();
});

// Cache cleanup every hour
cron.schedule('0 * * * *', () => {
  console.log('Cleaning cache...');
  cache.flushExpired();
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Underground Voices Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Mobile-first optimization: ENABLED');
  console.log('Real-time collaboration: READY');
  console.log('Free tier optimizations: ACTIVE');
});

module.exports = app;