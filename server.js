require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const morgan        = require('morgan');
const path          = require('path');
const fs            = require('fs').promises;
const mongoSanitize = require('express-mongo-sanitize');
const xss           = require('xss-clean');
const dbConnection  = require('./api/utils/database');
const { createMongoRateLimitStore, initializeMongoRateLimitStores } = require('./api/utils/mongoRateLimitStore');
const {
  assertMongoTlsEnabled,
  getAdminLoginUrl,
  isPrivateAdminHost
} = require('./api/utils/securityConfig');
const {
  isAdminOnlyRequest,
  isPublicPageRequest,
  selectListenerRateLimiter
} = require('./api/utils/listenerAccess');
const { isSafeFilename } = require('./api/utils/validation');
const { adminOnly } = require('./api/middleware/auth');

// ── Crash handlers ────────────────────────────────────────────
process.on('uncaughtException',  (err) => console.error('❌ Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason?.message || reason));

const {
  MONGODB_URI,
  PORT = 4000,
  ADMIN_PORT = 4001,
  ADMIN_HOST = '127.0.0.1',
  ADMIN_URL = `http://localhost:${ADMIN_PORT}`,
  BASE_URL = `http://localhost:${PORT}`,
  ORIGIN,
  NODE_ENV
} = process.env;
const isProd = NODE_ENV === 'production';
const trustProxy = process.env.TRUST_PROXY === 'true';
const publicPort = Number(PORT);
const adminPort = Number(ADMIN_PORT);
const adminHost = ADMIN_HOST.trim();
let adminLoginUrl;

const app = express();
if (trustProxy) app.set('trust proxy', 1);

function validateSecurityConfiguration() {
  if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(adminPort) || adminPort < 1 || adminPort > 65535) {
    throw new Error('ADMIN_PORT must be an integer between 1 and 65535');
  }
  if (publicPort === adminPort) {
    throw new Error('ADMIN_PORT must differ from PORT');
  }
  if (!adminHost) {
    throw new Error('ADMIN_HOST must be a non-empty private interface address');
  }
  adminLoginUrl = getAdminLoginUrl(ADMIN_URL, isProd);
  const minSecretLength = 64;
  if (!MONGODB_URI) throw new Error('MONGODB_URI must be configured');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < minSecretLength) {
    throw new Error(`JWT_SECRET must be at least ${minSecretLength} characters`);
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < minSecretLength) {
    throw new Error(`JWT_REFRESH_SECRET must be at least ${minSecretLength} characters`);
  }
  if (isProd) {
    if (!isPrivateAdminHost(adminHost)) {
      throw new Error('Production ADMIN_HOST must be a loopback or private-network address');
    }
    if (!BASE_URL.startsWith('https://')) {
      throw new Error('Production BASE_URL must be the public website HTTPS URL');
    }
    if (!ORIGIN || ORIGIN.split(',').some(origin => !origin.trim().startsWith('https://'))) {
      throw new Error('Production ORIGIN must contain only HTTPS origins');
    }
    if (!trustProxy) {
      throw new Error('Set TRUST_PROXY=true when production TLS terminates at a trusted reverse proxy');
    }
    assertMongoTlsEnabled(MONGODB_URI);
  }
}

// ── Upload dirs ───────────────────────────────────────────────
async function createUploadsDir() {
  const dirs = ['uploads','uploads/projects','uploads/equipment','uploads/services','uploads/general','uploads/images','uploads/delivery-documents'];
  for (const d of dirs) await fs.mkdir(path.join(__dirname, d), { recursive: true });
  console.log('✅ Uploads directory exists');
}
createUploadsDir();

// ── HTTPS redirect (production only) ─────────────────────────
app.use((req, res, next) => {
  const isHttps = req.secure || (trustProxy && req.get('x-forwarded-proto') === 'https');
  if (isProd && !isHttps)
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  next();
});

app.use((req, res, next) => {
  const adminListener = req.socket.localPort === adminPort;
  req.isAdminListener = adminListener;
  if (!adminListener && isAdminOnlyRequest(req.method, req.path)) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  if (adminListener && isPublicPageRequest(req.method, req.path)) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  next();
});

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = (ORIGIN || 'http://localhost:4000')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
}));

// ── Helmet (security headers) ────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      // The hashes permit the fixed inline admin bootstrap scripts
      // without allowing attacker-controlled inline JavaScript.
      scriptSrc:     ["'self'", "https://cdnjs.cloudflare.com", "https://accounts.google.com", "'sha256-fPhMVu3K2TcrjoiR6seN9dNoH01ylN5JiAgvRaq6gJk='", "'sha256-Mhk9O1ym+e30i0Tu9FdJ4WGEK6eC3n68fc+XDA5CkT8='", "'sha256-ZV6X1b4fntwH8HH4urD4qTASc1BvEwgYzXRraRfgrWw='"],
      scriptSrcAttr: ["'none'"],
      fontSrc:       ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "https:", "http:"],
      mediaSrc:      ["'self'", "data:"],
      connectSrc:    ["'self'", "https://accounts.google.com"],
      frameSrc:      ["'self'", "https://accounts.google.com"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── Body parser — FIX: 100mb → 10mb ─────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Sanitization ─────────────────────────────────────────────
app.use(mongoSanitize());
app.use(xss());

// ── Logger ────────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev'));

// ── Static files ─────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.isAdminListener) {
    return res.redirect(302, `${BASE_URL.replace(/\/+$/, '')}/`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin-access', (req, res) => {
  if (req.isAdminListener) return res.redirect(302, '/admin/login');
  res.redirect(302, adminLoginUrl);
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
// NOTE: /uploads is NOT served statically — use /api/files/:category/:filename

// ── Rate limiters ────────────────────────────────────────────
const mkLimiter = (name, max, windowMs = 15*60*1000, msg = 'Too many requests') => {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
    store: createMongoRateLimitStore(name),
    message: { success: false, message: msg },
  });
};

const generalLimiter = mkLimiter('general', 100);
const strictLimiter  = mkLimiter('strict', 50);
const adminLimiter   = mkLimiter('admin', 200);

// ── Secure file serving (/api/files/:category/:filename) ─────
const UPLOAD_CATEGORIES = ['projects','equipment','services','general','images','avatars'];
const PRIVATE_UPLOAD_CATEGORIES = ['delivery-documents'];
app.get('/api/files/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const isPrivateCategory = PRIVATE_UPLOAD_CATEGORIES.includes(category);
  if (!isPrivateCategory && !UPLOAD_CATEGORIES.includes(category))
    return res.status(400).json({ success: false, message: 'Invalid category' });
  if (!isSafeFilename(filename))
    return res.status(400).json({ success: false, message: 'Invalid filename' });
  const sendFile = () => {
    const filePath = path.join(__dirname, 'uploads', category, filename);
    res.sendFile(filePath, {
      headers: isPrivateCategory ? { 'Cache-Control': 'private, no-store' } : {}
    }, err => {
      if (err) res.status(404).json({ success: false, message: 'File not found' });
    });
  };
  if (isPrivateCategory) return adminOnly()(req, res, sendFile);
  sendFile();
});

// ── Legacy /uploads static serving (backward compat) ─────────
// Images stored in DB as /uploads/general/xxx.jpg still work
app.get('/uploads/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  if (!UPLOAD_CATEGORIES.includes(category) || !isSafeFilename(filename)) {
    return res.status(400).json({ success: false, message: 'Invalid file path' });
  }
  res.sendFile(path.join(__dirname, 'uploads', category, filename), err => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'File not found' });
  });
});

// ── API routes ───────────────────────────────────────────────
const authRoutes         = require('./api/routes/auth');
const contentRoutes      = require('./api/routes/content');
const contactRoutes      = require('./api/routes/contact');
const testimonialsRoutes = require('./api/routes/testimonials');
const adminRoutes        = require('./api/routes/admin');
const deliveryProjectsRoutes = require('./api/routes/deliveryProjects');

app.use('/api/auth',         authRoutes);
app.use('/api/content',      generalLimiter, contentRoutes);
app.use('/api/contact', (req, res, next) => {
  selectListenerRateLimiter(req.isAdminListener, strictLimiter, adminLimiter)(req, res, next);
}, contactRoutes);
app.use('/api/testimonials', (req, res, next) => {
  selectListenerRateLimiter(req.isAdminListener, strictLimiter, adminLimiter)(req, res, next);
}, testimonialsRoutes);
app.use('/api/admin',        adminLimiter,   adminRoutes);
app.use('/api/delivery-projects', adminLimiter, deliveryProjectsRoutes);

// ── Admin pages ──────────────────────────────────────────────
app.get('/admin',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/login',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// ── Public pages ─────────────────────────────────────────────
// Redirect removed pages
['login','signup','welcome'].forEach(p => {
  app.get(`/${p}`,      (req, res) => res.redirect(301, '/'));
  app.get(`/${p}.html`, (req, res) => res.redirect(301, '/'));
});

// Dynamic HTML pages
app.get('/:page.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);
  res.sendFile(filePath, err => {
    if (err) res.status(404).json({ message: 'Page not found' });
  });
});

// FIX: Debug route — REMOVED from production entirely
if (!isProd) {
  app.get('/test-services', async (req, res) => {
    const Service = require('./api/models/Service');
    const services = await Service.find();
    res.json({ success: true, count: services.length, data: services });
  });
}

// ── Global error handler — FIX: no leak in production ────────
app.use((err, req, res, next) => {
  // Log full error server-side always
  console.error('❌ Server Error:', err.message);
  if (!isProd) console.error(err.stack);

  // CORS errors
  if (err.message && err.message.startsWith('CORS:'))
    return res.status(403).json({ success: false, message: 'CORS policy violation' });

  // Never expose internal error details to client in production
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'An error occurred. Please try again.' : err.message,
  });
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Start server ──────────────────────────────────────────────
async function startServer() {
  try {
    validateSecurityConfiguration();
    await dbConnection.connect(MONGODB_URI);
    await initializeMongoRateLimitStores();
  } catch (err) {
    console.error('❌ Application security initialization failed:', err.message);
    process.exit(1);
  }

  let publicServer;
  try {
    publicServer = await listen(publicPort, '0.0.0.0');
    await listen(adminPort, adminHost);
    console.log(`🚀 Public website listening on port ${publicPort} [${NODE_ENV}]`);
    console.log(`🔒 Admin listener bound to ${adminHost}:${adminPort} [${NODE_ENV}]`);
  } catch (error) {
    if (publicServer) {
      await new Promise(resolve => publicServer.close(resolve));
    }
    console.error('❌ Failed to bind application listeners:', error.message);
    process.exit(1);
  }
}

function listen(port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

startServer();
