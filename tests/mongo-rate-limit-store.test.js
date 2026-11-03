const test = require('node:test');
const assert = require('node:assert/strict');
const { createMongoRateLimitStore } = require('../api/utils/mongoRateLimitStore');

test('MongoDB rate-limit store returns the atomic counter and reset time', async () => {
  const store = createMongoRateLimitStore(`test-${Date.now()}`);
  const resetTime = new Date(Date.now() + 60_000);
  let update;

  store.init({ windowMs: 60_000 });
  store.collection = {
    findOneAndUpdate: async (...args) => {
      update = args;
      return { totalHits: 3, resetTime };
    }
  };

  const result = await store.increment('client-key');

  assert.deepEqual(result, { totalHits: 3, resetTime });
  assert.equal(update[0]._id, `${store.namespace}:client-key`);
  assert.equal(update[2].upsert, true);
  assert.equal(update[2].returnDocument, 'after');
  assert.equal(Array.isArray(update[1]), true);
});

test('MongoDB rate-limit store reports missing initialization', async () => {
  const store = createMongoRateLimitStore(`test-uninitialized-${Date.now()}`);
  await assert.rejects(store.increment('client-key'), /not been initialized/);
});

test('MongoDB rate-limit store retries an initial concurrent insert conflict', async () => {
  const store = createMongoRateLimitStore(`test-race-${Date.now()}`);
  let calls = 0;
  const resetTime = new Date(Date.now() + 60_000);

  store.init({ windowMs: 60_000 });
  store.collection = {
    findOneAndUpdate: async (filter, update, options) => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('Duplicate key');
        error.code = 11000;
        throw error;
      }
      assert.equal(options.upsert, undefined);
      return { totalHits: 2, resetTime };
    }
  };

  const result = await store.increment('client-key');

  assert.equal(calls, 2);
  assert.equal(result.totalHits, 2);
});
