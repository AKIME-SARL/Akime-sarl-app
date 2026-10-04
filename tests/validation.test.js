const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidObjectId,
  isValidStringLength,
  sanitizePlainText
} = require('../api/utils/validation');

test('validates MongoDB object IDs', () => {
  assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
  assert.equal(isValidObjectId('not-an-object-id'), false);
  assert.equal(isValidObjectId(null), false);
});

test('validates trimmed string lengths and sanitizes plain text', () => {
  assert.equal(isValidStringLength('  site  ', 4, 4), true);
  assert.equal(isValidStringLength('  ', 1, 20), false);
  assert.equal(sanitizePlainText('<script>alert(1)</script>'), '‹script›alert(1)‹/script›');
});
