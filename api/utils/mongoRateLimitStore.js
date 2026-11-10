const mongoose = require('mongoose');
const stores = new Set();

class MongoRateLimitStore {
  constructor(namespace) {
    this.namespace = namespace;
    this.windowMs = 0;
    this.collection = null;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async initialize() {
    if (!mongoose.connection.db) {
      throw new Error('MongoDB must be connected before initializing rate limits');
    }

    this.collection = mongoose.connection.db.collection('rate_limits');
    await this.collection.createIndex(
      { resetTime: 1 },
      { expireAfterSeconds: 0, name: 'expire_rate_limits' }
    );
  }

  async increment(key) {
    if (!this.collection || !this.windowMs) {
      throw new Error('MongoDB rate-limit store has not been initialized');
    }

    const now = new Date();
    const nextResetTime = new Date(now.getTime() + this.windowMs);
    const activeWindow = { $gt: ['$resetTime', now] };
    const filter = { _id: `${this.namespace}:${key}` };
    const update = [{
      $set: {
        totalHits: {
          $cond: [
            activeWindow,
            { $add: [{ $ifNull: ['$totalHits', 0] }, 1] },
            1
          ]
        },
        resetTime: {
          $cond: [activeWindow, '$resetTime', nextResetTime]
        }
      }
    }];
    let document;
    try {
      document = await this.collection.findOneAndUpdate(
        filter,
        update,
        { upsert: true, returnDocument: 'after' }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      document = await this.collection.findOneAndUpdate(
        filter,
        update,
        { returnDocument: 'after' }
      );
    }

    if (!document) {
      throw new Error('MongoDB did not return the updated rate-limit record');
    }

    return {
      totalHits: document.totalHits,
      resetTime: document.resetTime
    };
  }

  async decrement(key) {
    if (!this.collection) {
      throw new Error('MongoDB rate-limit store has not been initialized');
    }

    await this.collection.updateOne(
      {
        _id: `${this.namespace}:${key}`,
        resetTime: { $gt: new Date() },
        totalHits: { $gt: 0 }
      },
      { $inc: { totalHits: -1 } }
    );
  }

  async resetKey(key) {
    if (!this.collection) {
      throw new Error('MongoDB rate-limit store has not been initialized');
    }

    await this.collection.deleteOne({ _id: `${this.namespace}:${key}` });
  }
}

function createMongoRateLimitStore(namespace) {
  const store = new MongoRateLimitStore(namespace);
  stores.add(store);
  return store;
}

async function initializeMongoRateLimitStores() {
  await Promise.all(Array.from(stores, store => store.initialize()));
}

module.exports = {
  createMongoRateLimitStore,
  initializeMongoRateLimitStores
};
