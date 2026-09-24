const AuditLog = require('../models/AuditLog');

// Audit events must never become a second password/token database.  Keep a
// useful record of which fields changed, but never persist their values.
const SENSITIVE_KEYS = new Set([
  'password', 'currentpassword', 'newpassword', 'refreshtoken', 'accesstoken',
  'token', 'twofactorcode', 'twofactorsecret', 'authorization', 'cookie',
  'emailpass', 'passwordresettoken'
]);

function redact(value, key = '') {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  return value;
}

const auditLog = (action, resource) => {
  return async (req, res, next) => {
    // Store the original send function
    const originalSend = res.send;
    let responseSent = false;

    // Override res.send to capture the response
    res.send = function (data) {
      if (!responseSent) {
        responseSent = true;
        // Only log if request was successful
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Parse response data if it's JSON
          let parsedData;
          try {
            parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          } catch (e) {
            parsedData = data;
          }

          // Create audit log entry
          const logEntry = new AuditLog({
            user: req.user?.id,
            action,
            resource,
            resourceId: req.params?.id || parsedData?.data?._id || null,
            details: {
              requestBody: redact(req.body),
              responseStatus: res.statusCode
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          });

          // Save log asynchronously without blocking response
          logEntry.save().catch(err => console.error('Audit log save error:', err));
        }
        originalSend.call(this, data);
      }
    };

    next();
  };
};

module.exports = auditLog;
