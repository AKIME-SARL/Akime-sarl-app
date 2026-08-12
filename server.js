require('dotenv').config();
// Clean restart
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan   = require('morgan');
const path     = require('path');
const fs       = require('fs').promises;
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const dbConnection = require('./api/utils/database');

// ── Uncaught exception and unhandled rejection handlers ───────────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error(err.stack);
  // Don't exit immediately, keep server running if possible
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error(reason.stack);
});

const { MONGODB_URI, PORT = 4001, ORIGIN, NODE_ENV } = process.env;

const app = express();

// ── Upload dirs ───────────────────────────────────────────────────────────────
async function createUploadsDir() {
  const dirs = ['uploads', 'uploads/projects', 'uploads/equipment', 'uploads/services', 'uploads/general'];
  for (const d of dirs) {
    await fs.mkdir(path.join(__dirname, d), { recursive: true });
  }
  console.log('✅ Uploads directory exists');
}
createUploadsDir();

// ── HTTPS Enforcement ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.get('host')}${req.url}`);
  }
  next();
});

// ── Security & middleware ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://accounts.google.com"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://accounts.google.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      fontSrc:    ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https:", "http:", "https://*.googleusercontent.com"],
      mediaSrc:   ["'self'", "data:"],
      connectSrc: ["'self'", "https://accounts.google.com"],
      frameSrc:   ["'self'", "https://accounts.google.com"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  }
}));

// Data sanitization against NoSQL injection
app.use(mongoSanitize());
// Data sanitization against XSS
app.use(xss());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// ── Granular Rate Limiting ────────────────────────────────────────────────────
const generalLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

// ── API routes (mounted BEFORE page routes and 404 handler) ──────────────────
const authRoutes         = require('./api/routes/auth');
const contentRoutes      = require('./api/routes/content');
const contactRoutes      = require('./api/routes/contact');
const testimonialsRoutes = require('./api/routes/testimonials');
const adminRoutes        = require('./api/routes/admin');

app.use('/api/auth',         authRoutes);
app.use('/api/content',      generalLimiter, contentRoutes);
app.use('/api/contact',      strictLimiter, contactRoutes);
app.use('/api/testimonials', strictLimiter, testimonialsRoutes);
app.use('/api/admin',        adminLimiter, adminRoutes);

// ── Admin pages ───────────────────────────────────────────────────────────────
app.get('/admin',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/login',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// ── Public pages ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Redirect removed public pages (login / signup / welcome) → index
app.get('/login',   (req, res) => res.redirect(301, '/'));
app.get('/signup',  (req, res) => res.redirect(301, '/'));
app.get('/welcome', (req, res) => res.redirect(301, '/'));
app.get('/login.html',   (req, res) => res.redirect(301, '/'));
app.get('/signup.html',  (req, res) => res.redirect(301, '/'));
app.get('/welcome.html', (req, res) => res.redirect(301, '/'));

// Any other .html page that doesn't exist → 404 JSON (not index redirect)
app.get('/:page.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);
  res.sendFile(filePath, err => {
    if (err) res.status(404).json({ message: 'Page not found' });
  });
});

// Debug / test routes
app.get('/test-services', async (req, res) => {
  const Service = require('./api/models/Service');
  const services = await Service.find();
  console.log('Services from DB:', JSON.stringify(services, null, 2));
  res.json({ success: true, data: services });
});

// ── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// ── 404 catch-all (must be LAST) ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// ── Start server ──────────────────────────────────────────────────────────────
const APP_PORT      = Number(PORT);
const portsToTry = [4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010];
let portIndex = 0;

async function startServer() {
  try {
    await dbConnection.connect(MONGODB_URI);
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB. Server will not start.');
    process.exit(1);
  }

  tryNextPort();
}

function tryNextPort() {
  if (portIndex >= portsToTry.length) {
    console.error('❌ All ports are in use. Please free a port and try again.');
    process.exit(1);
    return;
  }

  const port = portsToTry[portIndex];
  
  const server = app.listen(port, () => {
    console.log(`🚀 A-KIME website running on http://localhost:${port}`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${port} in use — trying next port…`);
      portIndex++;
      tryNextPort();
    } else {
      throw err;
    }
  });
}

startServer();
