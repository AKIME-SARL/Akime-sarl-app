require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ── Models ────────────────────────────────────────────────────────────────────
const User        = require('../api/models/User');
const Project     = require('../api/models/Project');
const Service     = require('../api/models/Service');
const Equipment   = require('../api/models/Equipment');
const Company     = require('../api/models/Company');
const Message     = require('../api/models/Message');
const Testimonial = require('../api/models/Testimonial');

const COLLECTIONS = { User, Project, Service, Equipment, Company, Message, Testimonial };

function backupSafeDocument(name, doc) {
  if (name !== 'User') return doc;
  const { refreshTokens, passwordResetToken, passwordResetExpires, twoFactorSecret, ...safe } = doc;
  return safe;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function pruneOldBackups(backupsRoot, retainDays = 30) {
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(backupsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(backupsRoot, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`🗑  Pruned old backup: ${entry.name}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const MONGODB_URI  = process.env.MONGODB_URI;
  const RETAIN_DAYS  = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
  const backupsRoot  = path.join(__dirname, '..', 'backups');
  const backupDir    = path.join(backupsRoot, `backup-${timestamp()}`);

  if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  console.log('📡  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log('✅  Connected');

  ensureDir(backupDir);

  const manifest = { createdAt: new Date().toISOString(), collections: {} };

  // ── Dump each collection ────────────────────────────────────────────────────
  for (const [name, Model] of Object.entries(COLLECTIONS)) {
    try {
      const docs  = (await Model.find({}).lean()).map(doc => backupSafeDocument(name, doc));
      const file  = path.join(backupDir, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8');
      manifest.collections[name] = { count: docs.length, file: `${name}.json` };
      console.log(`  ✔  ${name}: ${docs.length} document(s)`);
    } catch (err) {
      console.error(`  ✖  ${name}: ${err.message}`);
      manifest.collections[name] = { error: err.message };
    }
  }

  // ── Write manifest ──────────────────────────────────────────────────────────
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`\n📦  Backup saved to: ${backupDir}`);

  // ── Prune old backups ───────────────────────────────────────────────────────
  pruneOldBackups(backupsRoot, RETAIN_DAYS);

  await mongoose.disconnect();
  console.log('👋  Done');
}

run().catch(err => {
  console.error('❌  Backup failed:', err.message);
  process.exit(1);
});
