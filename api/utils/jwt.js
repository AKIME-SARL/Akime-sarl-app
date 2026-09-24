const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class JWTUtils {
  constructor() {
    this.accessTokenSecret = process.env.JWT_SECRET;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
    this.accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'akime-admin',
      audience: 'akime-users'
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'akime-admin',
      audience: 'akime-users'
    });
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(user, additionalPayload = {}) {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      ...additionalPayload
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken({ id: user._id });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getExpiryTime(this.accessTokenExpiry)
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessTokenSecret, {
        issuer: 'akime-admin',
        audience: 'akime-users'
      });
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'akime-admin',
        audience: 'akime-users'
      });
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Generate secure random token for password reset
   */
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Convert expiry string to milliseconds
   */
  getExpiryTime(expiryString) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = expiryString.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return true;
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token payload without verification (for debugging)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate fingerprint for additional security
   */
  generateFingerprint(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    const fingerprint = crypto
      .createHash('sha256')
      .update(userAgent + acceptLanguage + acceptEncoding)
      .digest('hex');
    
    return fingerprint.substring(0, 16);
  }
}

module.exports = new JWTUtils();
