#!/usr/bin/env node

// One-time remediation for data created before the security hardening.  It is
// intentionally dry-run by default; pass --apply (via npm run
// security-remediate) only after a fresh encrypted backup has been made.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../api/models/User');
const AuditLog = require('../api/models/AuditLog');
const Service = require('../api/models/Service');
const Project = require('../api/models/Project');
const Equipment = require('../api/models/Equipment');
const Testimonial = require('../api/models/Testimonial');
const Company = require('../api/models/Company');
const { sanitizePlainText } = require('../api/utils/validation');

const apply = process.argv.includes('--apply');
const SENSITIVE = /password|token|secret|authorization|cookie|twofactor|emailpass/i;

function redact(value, key = '') {
  if (SENSITIVE.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  return value;
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanObject(v)]));
  }
  return typeof value === 'string' ? sanitizePlainText(value) : value;
}

function safeGeneralImage(value) {
  return typeof value === 'string' && /^\/uploads\/general\/[A-Za-z0-9_.-]+$/.test(value) && !value.includes('..');
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.countDocuments({ 'refreshTokens.0': { $exists: true } });
  const logs = await AuditLog.find({ 'details.requestBody': { $exists: true } }).lean();
  console.log(`Would revoke sessions for ${users} user(s) and redact ${logs.length} audit record(s).`);
  if (!apply) {
    console.log('Dry run only. Run "npm run security-remediate" after taking a protected backup.');
    return;
  }

  await User.updateMany({}, { $set: { refreshTokens: [] } });
  for (const log of logs) {
    await AuditLog.updateOne({ _id: log._id }, { $set: { 'details.requestBody': redact(log.details.requestBody) } });
  }

  // Legacy imports may predate server-side text hardening. Clean public text
  // and discard media URLs that the hardened upload flow would reject.
  for (const Model of [Service, Project, Equipment, Testimonial, Company]) {
    const docs = await Model.find().lean();
    for (const doc of docs) {
      const { _id, __v, createdAt, updatedAt, imageUrl, gallery, ...text } = doc;
      const update = cleanObject(text);
      if (Object.prototype.hasOwnProperty.call(doc, 'imageUrl')) {
        update.imageUrl = safeGeneralImage(imageUrl) ? imageUrl : '';
      }
      if (Array.isArray(gallery)) update.gallery = gallery.filter(safeGeneralImage).slice(0, 50);
      await Model.updateOne({ _id }, { $set: update });
    }
  }
  console.log('Remediation complete: sessions revoked, audit data redacted, legacy text cleaned.');
}

run().catch(err => { console.error('Security remediation failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
