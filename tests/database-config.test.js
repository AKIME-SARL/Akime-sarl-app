const test = require('node:test');
const assert = require('node:assert/strict');
const dbConnection = require('../api/utils/database');

test('database connection fails immediately when MONGODB_URI is missing', async () => {
  const originalUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;

  try {
    await assert.rejects(
      dbConnection.connect(),
      /MONGODB_URI is not configured/
    );
    assert.equal(dbConnection.connectionAttempts, 0);
  } finally {
    if (originalUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalUri;
    }
  }
});
