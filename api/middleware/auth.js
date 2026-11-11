const User = require('../models/User');
const jwtUtils = require('../utils/jwt');
const { isAdminSelfServiceRequest } = require('../utils/listenerAccess');

// Helper function to get allowed admin emails
const getAllowedAdminEmails = () => {
  const envEmails = process.env.ALLOWED_ADMIN_EMAILS || '';
  return envEmails.split(',').map(email => email.trim().toLowerCase()).filter(email => email);
};

/**
 * Authentication middleware with role-based access control
 */
const auth = (requiredRoles = []) => {
  return async (req, res, next) => {
    try {
      // Extract token from header
      const authHeader = req.headers.authorization;
      const token = jwtUtils.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access token required'
        });
      }

      // Verify token
      let decoded;
      try {
        decoded = jwtUtils.verifyAccessToken(token);
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Find user and check if still active
      const user = await User.findById(decoded.id).select('+twoFactorSecret');
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      if (decoded.purpose === 'mfa-enrollment') {
        return res.status(403).json({
          success: false,
          message: 'MFA enrollment tokens cannot access protected resources'
        });
      }

      const adminSelfServiceAllowed = process.env.ADMIN_PATH_MODE === 'true' &&
        isAdminSelfServiceRequest(req.method, req.originalUrl || req.path);
      if (['admin', 'editor'].includes(user.role) &&
          !req.isAdminListener && !adminSelfServiceAllowed) {
        return res.status(404).json({
          success: false,
          message: 'Not found'
        });
      }

      if (['admin', 'editor'].includes(user.role) &&
          (!user.twoFactorEnabled || !user.twoFactorSecret)) {
        return res.status(403).json({
          success: false,
          code: 'MFA_SETUP_REQUIRED',
          message: 'Multi-factor authentication must be enabled for this account'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked due to failed login attempts'
        });
      }

      // Check role permissions
      if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      // Add user to request object
      req.user = {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      };

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  };
};

/**
 * Admin only middleware
 */
const adminOnly = () => auth(['admin']);

/**
 * Admin or Editor middleware
 */
const adminOrEditor = () => auth(['admin', 'editor']);

/**
 * Customer only middleware
 */
const customerOnly = () => auth(['customer']);

/**
 * Any authenticated user middleware
 */
const authenticated = () => auth();

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtUtils.extractTokenFromHeader(authHeader);

    if (token) {
      try {
        const decoded = jwtUtils.verifyAccessToken(token);
        const user = await User.findById(decoded.id);
        
        if (user && user.isActive && !user.isLocked &&
            (!['admin', 'editor'].includes(user.role) || req.isAdminListener)) {
          req.user = {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.avatar
          };
        }
      } catch (error) {
        // Ignore token errors for optional auth
      }
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Rate limiting middleware for sensitive operations
 */
const sensitiveOperation = (req, res, next) => {
  // Add additional security checks for sensitive operations
  const userAgent = req.headers['user-agent'];
  const fingerprint = jwtUtils.generateFingerprint(req);
  
  // Store fingerprint for session validation
  req.fingerprint = fingerprint;
  
  next();
};

module.exports = {
  auth,
  adminOnly,
  adminOrEditor,
  customerOnly,
  authenticated,
  optionalAuth,
  sensitiveOperation
};
