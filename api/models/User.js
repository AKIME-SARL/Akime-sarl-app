const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Helper function to get allowed admin emails
const getAllowedAdminEmails = () => {
  const envEmails = process.env.ALLOWED_ADMIN_EMAILS || '';
  return envEmails.split(',').map(email => email.trim().toLowerCase()).filter(email => email);
};

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      // Password is required only if not using Google OAuth
      return !this.googleId;
    },
    select: false // Don't include password in queries by default
  },
  googleId: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  googleProfile: {
    type: Object,
    default: null
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'viewer', 'customer'],
    default: 'customer',
    required: true
  },
  avatar: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  refreshTokens: [{
    // Store a one-way digest, never a bearer token that can be replayed from a
    // database dump or backup.
    tokenHash: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    userAgent: String,
    ipAddress: String
  }],
  // Two-Factor Authentication Fields
  twoFactorSecret: {
    type: String,
    default: null,
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  // GDPR Data
  dataConsent: {
    type: Boolean,
    default: true
  },
  dataExportRequestedAt: Date,
  dataDeletionRequestedAt: Date
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.twoFactorSecret;
      return ret;
    }
  }
});

// Indexes for performance
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

// Virtual for account lock status
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to validate admin email restrictions
UserSchema.pre('save', async function(next) {
  const allowedAdminEmails = getAllowedAdminEmails();
  const emailLower = this.email.toLowerCase();
  
  // Check if we're trying to set/keep admin role
  if (this.role === 'admin' || (this.isModified('role') && this.role === 'admin')) {
    if (!allowedAdminEmails.includes(emailLower)) {
      // Reset to customer if not allowed
      this.role = 'customer';
    }
  }
  
  // Check if email is being removed from allowed list
  if (this.isModified('email') && !allowedAdminEmails.includes(emailLower) && this.role === 'admin') {
    this.role = 'customer';
  }
  
  next();
});

// Pre-save middleware to validate and hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    // Validate password before hashing
    if (this.password.length < 8) {
      const error = new Error('Password must be at least 8 characters');
      error.name = 'ValidationError';
      return next(error);
    }
    
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPasswordRegex.test(this.password)) {
      const error = new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      error.name = 'ValidationError';
      return next(error);
    }
    
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
UserSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
UserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Static method to find user for authentication
UserSchema.statics.findForAuth = function(email) {
  return this.findOne({ email, isActive: true }).select('+password');
};

// Static method to create admin user
UserSchema.statics.createAdmin = async function(userData) {
  // Check allowed admin emails
  const allowedAdminEmails = getAllowedAdminEmails();
  const emailLower = userData.email.toLowerCase();
  
  if (!allowedAdminEmails.includes(emailLower)) {
    throw new Error('This email is not authorized to be an admin');
  }
  
  const adminData = {
    ...userData,
    role: 'admin',
    isActive: true
  };
  
  return await this.create(adminData);
};

module.exports = mongoose.model('User', UserSchema);
