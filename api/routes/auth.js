const express = require('express');
const rateLimit = require('express-rate-limit');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const jwtUtils = require('../utils/jwt');
const { createMongoRateLimitStore } = require('../utils/mongoRateLimitStore');
const { authenticated, adminOnly, adminOrEditor, sensitiveOperation } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const {
  isValidObjectId,
  isValidEmail,
  isValidStringLength,
  isValidInteger,
  isValidRole,
  isSafeFilename,
  trimString,
  sanitizePlainText,
  isAllowedImageBuffer,
  STRING_LIMITS,
  VALID_AUDIT_RESOURCES,
  VALID_AUDIT_ACTIONS
} = require('../utils/validation');

const REFRESH_COOKIE = 'akime_refresh';
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: jwtUtils.getExpiryTime(process.env.JWT_REFRESH_EXPIRES_IN || '7d')
});

function readCookie(req, name) {
  const encoded = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${name}=`));
  return encoded ? decodeURIComponent(encoded.slice(name.length + 1)) : null;
}

function storeRefreshToken(user, refreshToken, req) {
  user.refreshTokens.push({
    tokenHash: jwtUtils.hashToken(refreshToken),
    expiresAt: new Date(Date.now() + jwtUtils.getExpiryTime(process.env.JWT_REFRESH_EXPIRES_IN || '7d')),
    userAgent: req.headers['user-agent'] || 'Unknown',
    ipAddress: req.ip || req.connection.remoteAddress
  });
  // Bound session records to avoid unbounded growth.
  user.refreshTokens = user.refreshTokens.slice(-10);
}

// Multer storage for avatars
const avatarStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/avatars');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const safeExt = /^\.[a-zA-Z0-9]{2,5}$/.test(ext) ? ext : '.bin';
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + safeExt);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

function verifyAvatarUpload(req, res, next) {
  if (!req.file) return next();
  try {
    if (isAllowedImageBuffer(require('fs').readFileSync(req.file.path))) return next();
  } catch {}
  require('fs').unlink(req.file.path, () => {});
  return res.status(400).json({ success: false, message: 'Invalid image content' });
}

// Initialize Google OAuth2 Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createMongoRateLimitStore('auth-login')
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many two-factor attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createMongoRateLimitStore('auth-two-factor')
});

const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createMongoRateLimitStore('auth-general'),
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * @route   POST /api/auth/register
 * @desc    Register a new customer
 * @access  Public
 */
router.post('/register', generalAuthLimiter, async (req, res) => {
  try {
    let { name, email, password } = req.body;

    name = sanitizePlainText(trimString(name));
    email = trimString(email);

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Adresse email invalide'
      });
    }

    if (typeof password !== 'string' || !isValidStringLength(password, STRING_LIMITS.PASSWORD_MIN, STRING_LIMITS.PASSWORD_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Mot de passe invalide (${STRING_LIMITS.PASSWORD_MIN}-${STRING_LIMITS.PASSWORD_MAX} caractères)`
      });
    }

    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule, un chiffre et un caractère spécial'
      });
    }

    email = email.toLowerCase();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'customer'
    });

    const { accessToken, refreshToken, expiresIn } = jwtUtils.generateTokenPair(user);

    storeRefreshToken(user, refreshToken, req);
    user.lastLogin = new Date();
    await user.save();

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar
        },
        accessToken,
        expiresIn
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return tokens, optionally with 2FA
 * @access  Public
 */
const loginHandler = async (req, res) => {
  try {
    let { email, password, twoFactorCode } = req.body;

    email = trimString(email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Adresse email invalide'
      });
    }

    if (typeof password !== 'string' || password.length < 1 || password.length > STRING_LIMITS.PASSWORD_MAX) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe invalide'
      });
    }

    email = email.toLowerCase();

    if (twoFactorCode !== undefined && twoFactorCode !== null && twoFactorCode !== '') {
      if (!/^\d{6,8}$/.test(String(twoFactorCode).trim())) {
        return res.status(400).json({
          success: false,
          message: 'Code 2FA invalide (6-8 chiffres attendus)'
        });
      }
    }

    const user = await User.findOne({ email, isActive: true }).select('+password +twoFactorSecret');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPrivilegedUser = ['admin', 'editor'].includes(user.role);
    if (isPrivilegedUser && req.path !== '/admin/login') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    if (!isPrivilegedUser && req.path === '/admin/login') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to failed login attempts'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (user.twoFactorEnabled && !user.twoFactorSecret) {
      return res.status(403).json({
        success: false,
        message: 'Two-factor authentication is unavailable for this account'
      });
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(400).json({
          success: false,
          message: 'Two-factor authentication code is required',
          requireTwoFactor: true
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: String(twoFactorCode).trim()
      });

      if (!verified) {
        return res.status(401).json({
          success: false,
          message: 'Invalid two-factor authentication code'
        });
      }
    }

    await user.resetLoginAttempts();

    if (['admin', 'editor'].includes(user.role) && !user.twoFactorEnabled) {
      return res.json({
        success: true,
        mfaEnrollmentRequired: true,
        enrollmentToken: jwtUtils.generateMfaEnrollmentToken(user)
      });
    }

    const { accessToken, refreshToken, expiresIn } = jwtUtils.generateTokenPair(user);

    storeRefreshToken(user, refreshToken, req);
    user.lastLogin = new Date();
    await user.save();

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          twoFactorEnabled: user.twoFactorEnabled
        },
        accessToken,
        expiresIn
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

router.post('/login', authLimiter, loginHandler);
router.post('/admin/login', authLimiter, loginHandler);

/**
 * @route   POST /api/auth/google
 * @desc    Authenticate or register user via Google OAuth
 * @access  Public
 */
router.post('/google', generalAuthLimiter, async (req, res) => {
  try {
    let { credential, twoFactorCode } = req.body;

    if (credential !== undefined && credential !== null) {
      credential = trimString(String(credential));
    }
    if (twoFactorCode !== undefined && twoFactorCode !== null) {
      twoFactorCode = trimString(String(twoFactorCode));
    }

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    if (credential.length < 20 || credential.length > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Google credential invalide'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload.email || payload.email_verified !== true) {
      return res.status(401).json({ success: false, message: 'A verified Google email is required' });
    }
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'] || payload['given_name'] + ' ' + payload['family_name'];
    const picture = payload['picture'] || null;

    let user = await User.findOne({ googleId }).select('+twoFactorSecret');

    if (!user) {
      user = await User.findOne({ email }).select('+twoFactorSecret');

      if (user) {
        // Do not silently attach a new identity provider to a password account.
        // Linking must be an explicit, recently authenticated account action.
        return res.status(409).json({ success: false, message: 'This email already has an account. Sign in with its existing method first.' });
      } else {
        const sanitizedName = sanitizePlainText(trimString(name));
        const cleanName = isValidStringLength(sanitizedName, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)
          ? sanitizedName
          : 'Google User';
        const cleanEmail = email && isValidEmail(email) ? email.toLowerCase() : googleId + '@invalid.google';

        user = await User.create({
          name: cleanName,
          email: cleanEmail,
          googleId,
          googleProfile: payload,
          avatar: picture,
          role: 'customer'
        });
      }
    } else {
      if (picture && !user.avatar) user.avatar = picture;
      user.googleProfile = payload;
    }

    if (!user.isActive || user.isLocked) {
      return res.status(401).json({ success: false, message: 'Account is unavailable' });
    }
    if (['admin', 'editor'].includes(user.role) && !req.isAdminListener) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (user.twoFactorEnabled && !user.twoFactorSecret) {
      return res.status(403).json({
        success: false,
        message: 'Two-factor authentication is unavailable for this account'
      });
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(400).json({
          success: false,
          message: 'Two-factor authentication code is required',
          requireTwoFactor: true
        });
      }
      if (!/^\d{6,8}$/.test(twoFactorCode)) {
        return res.status(400).json({
          success: false,
          message: 'Code 2FA invalide (6-8 chiffres attendus)'
        });
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode
      });
      if (!verified) {
        return res.status(401).json({
          success: false,
          message: 'Invalid two-factor authentication code'
        });
      }
    }

    if (['admin', 'editor'].includes(user.role) && !user.twoFactorEnabled) {
      return res.json({
        success: true,
        mfaEnrollmentRequired: true,
        enrollmentToken: jwtUtils.generateMfaEnrollmentToken(user)
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const { accessToken, refreshToken, expiresIn } = jwtUtils.generateTokenPair(user);

    storeRefreshToken(user, refreshToken, req);
    await user.save();

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          twoFactorEnabled: user.twoFactorEnabled
        },
        accessToken,
        expiresIn
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', generalAuthLimiter, async (req, res) => {
  try {
    let refreshToken = readCookie(req, REFRESH_COOKIE);

    if (refreshToken !== undefined && refreshToken !== null) {
      refreshToken = trimString(String(refreshToken));
    }

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    if (refreshToken.length < 20 || refreshToken.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token invalide'
      });
    }

    let decoded;
    try {
      decoded = jwtUtils.verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Find user and validate refresh token
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    if (['admin', 'editor'].includes(user.role) && !req.isAdminListener) {
      return res.status(404).json({
        success: false,
        message: 'Not found'
      });
    }

    // Check if refresh token exists and is valid
    const refreshTokenHash = jwtUtils.hashToken(refreshToken);
    const tokenIndex = user.refreshTokens.findIndex(rt =>
      rt.tokenHash === refreshTokenHash && rt.expiresAt > new Date()
    );

    if (tokenIndex === -1) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Rotate the refresh token. A stolen token becomes useless after the next
    // legitimate refresh instead of remaining valid for its entire lifetime.
    user.refreshTokens.splice(tokenIndex, 1);
    const { accessToken, refreshToken: nextRefreshToken, expiresIn } = jwtUtils.generateTokenPair(user);
    storeRefreshToken(user, nextRefreshToken, req);
    await user.save();
    res.cookie(REFRESH_COOKIE, nextRefreshToken, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        expiresIn
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate refresh token
 * @access  Private
 */
router.post('/logout', authenticated(), async (req, res) => {
  try {
    let refreshToken = readCookie(req, REFRESH_COOKIE);
    const userId = req.user.id;

    if (refreshToken !== undefined && refreshToken !== null) {
      refreshToken = trimString(String(refreshToken));
      if (refreshToken.length > 2000) {
        refreshToken = null;
      }
    }

    const user = await User.findById(userId);
    if (user && refreshToken) {
      const refreshTokenHash = jwtUtils.hashToken(refreshToken);
      user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== refreshTokenHash);
      await user.save();
    }
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ...
/**
 * @route   GET /api/auth/verify
 * @desc    Verify if the token is valid
 * @access  Private
 */
router.get('/verify', authenticated(), async (req, res) => { // Change router.post to router.get
  try {
    res.json({
      success: true,
      message: 'Token is valid'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
// ...

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authenticated(), sensitiveOperation, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (user) {
      user.refreshTokens = [];
      await user.save();
    }
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());

    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticated(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/me/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/me/avatar', authenticated(), avatarUpload.single('avatar'), verifyAvatarUpload, auditLog('UPDATE', 'USER'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old avatar if it exists
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const oldAvatarPath = path.join(__dirname, '../../', user.avatar);
      try {
        await fs.unlink(oldAvatarPath);
      } catch (err) {
        // Ignore if file doesn't exist
      }
    }

    // Update user with new avatar
    user.avatar = `/uploads/avatars/${req.file.filename}`;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   DELETE /api/auth/me/avatar
 * @desc    Delete user avatar
 * @access  Private
 */
router.delete('/me/avatar', authenticated(), auditLog('UPDATE', 'USER'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old avatar if it exists
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const oldAvatarPath = path.join(__dirname, '../../', user.avatar);
      try {
        await fs.unlink(oldAvatarPath);
      } catch (err) {
        // Ignore if file doesn't exist
      }
    }

    // Update user to remove avatar
    user.avatar = null;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar deleted successfully'
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   PUT /api/auth/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticated(), auditLog('UPDATE', 'USER'), async (req, res) => {
  try {
    const userId = req.user.id;
    let { name, email, avatar, currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const update = {};

    if (name !== undefined) {
      name = sanitizePlainText(trimString(name));
      if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
        });
      }
      update.name = name;
    }

    if (email !== undefined) {
      email = trimString(email);
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Adresse email invalide'
        });
      }
      email = email.toLowerCase();
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      update.email = email;
    }

    if (avatar !== undefined) {
      if (avatar === null || avatar === '') {
        update.avatar = null;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Use the avatar upload endpoint to change your avatar'
        });
      }
    }

    if ((currentPassword !== undefined && currentPassword !== null && currentPassword !== '') ||
        (newPassword !== undefined && newPassword !== null && newPassword !== '')) {
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Les mots de passe actuel et nouveau sont requis pour modifier le mot de passe'
        });
      }
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Mots de passe invalides'
        });
      }
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      if (!isValidStringLength(newPassword, STRING_LIMITS.PASSWORD_MIN, STRING_LIMITS.PASSWORD_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Nouveau mot de passe invalide (${STRING_LIMITS.PASSWORD_MIN}-${STRING_LIMITS.PASSWORD_MAX} caractères)`
        });
      }
      if (!strongPasswordRegex.test(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Le nouveau mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule, un chiffre et un caractère spécial'
        });
      }
      update.password = newPassword;
    }

    Object.assign(user, update);
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin)
 */
router.get('/users', adminOnly(), async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshTokens');
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/users
 * @desc    Create a new user (admin only)
 * @access  Private (Admin)
 */
router.post('/users', adminOnly(), auditLog('CREATE', 'USER'), async (req, res) => {
  try {
    let { name, email, password, role = 'editor' } = req.body;

    name = sanitizePlainText(trimString(name));
    email = trimString(email);

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Adresse email invalide'
      });
    }

    email = email.toLowerCase();

    if (typeof password !== 'string' || !isValidStringLength(password, STRING_LIMITS.PASSWORD_MIN, STRING_LIMITS.PASSWORD_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Mot de passe invalide (${STRING_LIMITS.PASSWORD_MIN}-${STRING_LIMITS.PASSWORD_MAX} caractères)`
      });
    }

    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule, un chiffre et un caractère spécial'
      });
    }

    if (!isValidRole(role)) {
      return res.status(400).json({
        success: false,
        message: `Rôle invalide. Valeurs autorisées: ${VALID_AUDIT_RESOURCES ? '' : ''}admin, editor, viewer, customer`
      });
    }

    if (role === 'admin') {
      const allowedAdminEmails = (process.env.ALLOWED_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e);
      
      if (!allowedAdminEmails.includes(email.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'This email is not authorized to be an admin'
        });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.put('/users/:id', adminOnly(), auditLog('UPDATE', 'USER'), async (req, res) => {
  try {
    const userId = req.params.id;
    let { name, email, role, isActive, password } = req.body;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant utilisateur invalide'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot update your own account using this endpoint. Use /api/auth/me instead.'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const update = {};

    if (name !== undefined) {
      name = sanitizePlainText(trimString(name));
      if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
        });
      }
      update.name = name;
    }

    if (email !== undefined) {
      email = trimString(email);
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Adresse email invalide'
        });
      }
      email = email.toLowerCase();
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      update.email = email;
    }

    const targetRole = role !== undefined ? role : user.role;
    const targetEmail = update.email ? update.email.toLowerCase() : user.email.toLowerCase();
    if (targetRole === 'admin') {
      const allowedAdminEmails = (process.env.ALLOWED_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e);
      
      if (!allowedAdminEmails.includes(targetEmail)) {
        return res.status(400).json({
          success: false,
          message: 'This email is not authorized to be an admin'
        });
      }
    }

    if (role !== undefined) {
      if (!isValidRole(role)) {
        return res.status(400).json({
          success: false,
          message: 'Rôle invalide'
        });
      }
      update.role = role;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Valeur isActive invalide (booléen attendu)'
        });
      }
      update.isActive = isActive;
    }

    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || !isValidStringLength(password, STRING_LIMITS.PASSWORD_MIN, STRING_LIMITS.PASSWORD_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Mot de passe invalide (${STRING_LIMITS.PASSWORD_MIN}-${STRING_LIMITS.PASSWORD_MAX} caractères)`
        });
      }
      if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Le mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule, un chiffre et un caractère spécial'
        });
      }
      update.password = password;
    }

    Object.assign(user, update);
    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.delete('/users/:id', adminOnly(), auditLog('DELETE', 'USER'), async (req, res) => {
  try {
    const userId = req.params.id;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant utilisateur invalide'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/audit-logs', adminOnly(), async (req, res) => {
  try {
    let { limit = 50, page = 1, resource, action } = req.query;

    if (!isValidInteger(limit, 1, 500)) limit = 50;
    else limit = parseInt(limit);

    if (!isValidInteger(page, 1, 1000000)) page = 1;
    else page = parseInt(page);

    const skip = (page - 1) * limit;

    const query = {};
    if (resource) {
      const r = String(resource).toUpperCase();
      if (VALID_AUDIT_RESOURCES.includes(r)) {
        query.resource = r;
      } else {
        return res.status(400).json({
          success: false,
          message: `Ressource invalide. Valeurs autorisées: ${VALID_AUDIT_RESOURCES.join(', ')}`
        });
      }
    }
    if (action) {
      const a = String(action).toUpperCase();
      if (VALID_AUDIT_ACTIONS.includes(a)) {
        query.action = a;
      } else {
        return res.status(400).json({
          success: false,
          message: `Action invalide. Valeurs autorisées: ${VALID_AUDIT_ACTIONS.join(', ')}`
        });
      }
    }

    const logs = await AuditLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ==============================================
// TWO-FACTOR AUTHENTICATION ROUTES
// ==============================================

function mfaSetupAuth(req, res, next) {
  const token = jwtUtils.extractTokenFromHeader(req.headers.authorization);
  if (!token) return authenticated()(req, res, next);

  let decoded;
  try {
    decoded = jwtUtils.verifyAccessToken(token);
  } catch (error) {
    return authenticated()(req, res, next);
  }

  if (decoded.purpose !== 'mfa-enrollment') {
    return authenticated()(req, res, next);
  }

  return User.findById(decoded.id).then(user => {
    if (!user || !user.isActive || user.isLocked) {
      return res.status(401).json({
        success: false,
        message: 'Enrollment session is invalid or expired'
      });
    }
    if (!['admin', 'editor'].includes(user.role) || user.twoFactorEnabled) {
      return res.status(403).json({
        success: false,
        message: 'MFA enrollment is not available for this account'
      });
    }

    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar
    };
    next();
  }).catch(error => {
    console.error('MFA enrollment authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  });
}

/**
 * @route   POST /api/auth/2fa/setup
 * @desc    Setup 2FA for a user
 * @access  Private
 */
router.post('/2fa/setup', mfaSetupAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactorSecret');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({
      name: `A-KIME (${user.email})`
    });

    // Save temporary secret
    user.twoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code
    const qrCode = await qrcode.toDataURL(secret.otpauth_url);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode
      }
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/2fa/verify
 * @desc    Verify 2FA setup and enable it
 * @access  Private
 */
router.post('/2fa/verify', mfaSetupAuth, twoFactorLimiter, async (req, res) => {
  try {
    let { token } = req.body;
    const user = await User.findById(req.user.id).select('+twoFactorSecret');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: '2FA not set up'
      });
    }

    if (token !== undefined && token !== null) {
      token = String(token).trim();
    }

    if (!token || !/^\d{6,8}$/.test(token)) {
      return res.status(400).json({
        success: false,
        message: 'Code de vérification invalide (6-8 chiffres attendus)'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.json({
      success: true,
      message: '2FA enabled successfully'
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.post('/2fa/disable', authenticated(), sensitiveOperation, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe requis'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ==============================================
// GDPR COMPLIANCE ROUTES
// ==============================================

/**
 * @route   GET /api/auth/gdpr/export
 * @desc    Request data export for GDPR compliance
 * @access  Private
 */
router.get('/gdpr/export', authenticated(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update export request timestamp
    user.dataExportRequestedAt = new Date();
    await user.save();

    // Compile user data
    const userData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        dataConsent: user.dataConsent
      },
      requestDate: new Date()
    };

    // In a real app, you'd generate a file and send it via email
    // For this example, we'll return the data directly
    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('GDPR export error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/auth/gdpr/delete
 * @desc    Request account deletion for GDPR compliance
 * @access  Private
 */
router.post('/gdpr/delete', authenticated(), sensitiveOperation, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe requis pour confirmer la suppression'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    user.dataDeletionRequestedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Account deletion request received. Your account will be deleted within 30 days.'
    });
  } catch (error) {
    console.error('GDPR delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
