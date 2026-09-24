#!/usr/bin/env node

// Rotates the signing keys in .env without ever writing their values to the
// terminal. Existing access tokens become invalid immediately; run the data
// remediation script first to revoke persisted refresh sessions as well.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) throw new Error('.env does not exist');

let content = fs.readFileSync(envPath, 'utf8');
function setSecret(key) {
  const value = crypto.randomBytes(64).toString('hex');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

setSecret('JWT_SECRET');
setSecret('JWT_REFRESH_SECRET');
fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
console.log('JWT secrets rotated successfully. Values were not displayed. Restart the application.');
