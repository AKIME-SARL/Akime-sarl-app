#!/usr/bin/env node

// Removes authentication material from historical local JSON backups without
// deleting the business data required for recovery.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'backups');
let filesUpdated = 0;

function sanitizeUser(user) {
  const { refreshTokens, password, passwordResetToken, passwordResetExpires, twoFactorSecret, ...safe } = user;
  return safe;
}

if (!fs.existsSync(root)) {
  console.log('No local backups found.');
  process.exit(0);
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(root, entry.name, 'User.json');
  if (!fs.existsSync(file)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data)) throw new Error('expected an array');
    fs.writeFileSync(file, `${JSON.stringify(data.map(sanitizeUser), null, 2)}\n`, 'utf8');
    filesUpdated++;
  } catch (error) {
    console.error(`Skipped ${file}: ${error.message}`);
  }
}

console.log(`Sanitized ${filesUpdated} local backup file(s).`);
