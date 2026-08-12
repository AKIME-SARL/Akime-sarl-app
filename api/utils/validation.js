const { Types } = require('mongoose');

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const SAFE_FILENAME_REGEX = /^[A-Za-z0-9_\-\.]+$/;
const SAFE_DIRNAME_REGEX = /^[A-Za-z0-9_\-]+$/;

const STRING_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 100,
  EMAIL_MAX: 254,
  PHONE_MAX: 30,
  SUBJECT_MAX: 200,
  SHORT_TEXT_MAX: 255,
  MEDIUM_TEXT_MAX: 1000,
  LONG_TEXT_MAX: 10000,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128
};

const VALID_ROLES = ['admin', 'editor', 'viewer', 'customer'];
const VALID_EQUIPMENT_CATEGORIES = ['excavation', 'levage', 'transport', 'compactage', 'outillage', 'divers'];
const VALID_UPLOAD_DIRECTORIES = ['projects', 'equipment', 'services', 'general'];
const VALID_AUDIT_RESOURCES = ['USER', 'SERVICE', 'PROJECT', 'EQUIPMENT', 'TESTIMONIAL', 'MESSAGE', 'COMPANY', 'BACKUP', 'FILE'];
const VALID_AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'UPLOAD', 'DOWNLOAD'];

function isValidObjectId(id) {
  if (!id) return false;
  if (typeof id !== 'string') return false;
  if (!OBJECT_ID_REGEX.test(id)) return false;
  return Types.ObjectId.isValid(id);
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > STRING_LIMITS.EMAIL_MAX) return false;
  return EMAIL_REGEX.test(email.trim());
}

function isValidStringLength(str, min = 0, max = Infinity) {
  if (typeof str !== 'string') return false;
  const len = str.trim().length;
  return len >= min && len <= max;
}

function isValidInteger(value, min = undefined, max = undefined) {
  const n = Number(value);
  if (!Number.isInteger(n)) return false;
  if (typeof min === 'number' && n < min) return false;
  if (typeof max === 'number' && n > max) return false;
  return true;
}

function isValidBoolean(value) {
  return typeof value === 'boolean' || value === 'true' || value === 'false' || value === 0 || value === 1;
}

function isValidRating(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 5;
}

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function isValidEquipmentCategory(cat) {
  return VALID_EQUIPMENT_CATEGORIES.includes(cat);
}

function isValidUploadDirectory(dir) {
  return VALID_UPLOAD_DIRECTORIES.includes(dir);
}

function isSafeFilename(name) {
  if (!name || typeof name !== 'string') return false;
  if (!SAFE_FILENAME_REGEX.test(name)) return false;
  if (name.includes('..')) return false;
  if (name.startsWith('.') && name !== '.gitkeep') return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  if (name.includes('\0')) return false;
  return true;
}

function isSafeBackupName(name) {
  if (!name || typeof name !== 'string') return false;
  if (!name.startsWith('backup-')) return false;
  return isSafeFilename(name);
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function sanitizePlainText(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\u0000/g, '')
    .trim();
}

function validateRequired(fields, data, res) {
  for (const field of fields) {
    const value = data[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: `Le champ "${field}" est obligatoire`
      });
    }
  }
  return null;
}

function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: `Paramètre "${paramName}" invalide (identifiant MongoDB attendu)`
      });
    }
    next();
  };
}

module.exports = {
  STRING_LIMITS,
  VALID_ROLES,
  VALID_EQUIPMENT_CATEGORIES,
  VALID_UPLOAD_DIRECTORIES,
  VALID_AUDIT_RESOURCES,
  VALID_AUDIT_ACTIONS,
  isValidObjectId,
  isValidEmail,
  isValidStringLength,
  isValidInteger,
  isValidBoolean,
  isValidRating,
  isValidRole,
  isValidEquipmentCategory,
  isValidUploadDirectory,
  isSafeFilename,
  isSafeBackupName,
  trimString,
  sanitizePlainText,
  validateRequired,
  validateObjectIdParam
};
