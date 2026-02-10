let redis = null;

if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });
  redis.on('error', (err) => console.error('Cache Redis error:', err));
  redis.on('connect', () => console.log('Cache connected to Redis'));
}

// In-memory fallback with TTL
const memCache = new Map();
const memTimers = new Map();

function memSet(key, value, ttlSeconds) {
  memCache.set(key, value);
  if (memTimers.has(key)) clearTimeout(memTimers.get(key));
  if (ttlSeconds > 0) {
    memTimers.set(key, setTimeout(() => {
      memCache.delete(key);
      memTimers.delete(key);
    }, ttlSeconds * 1000));
  }
}

const cache = {
  async get(key) {
    if (redis) {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    }
    return memCache.get(key) || null;
  },

  async set(key, value, ttlSeconds = 300) {
    const serialized = JSON.stringify(value);
    if (redis) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      memSet(key, JSON.parse(serialized), ttlSeconds);
    }
  },

  async del(key) {
    if (redis) {
      await redis.del(key);
    } else {
      memCache.delete(key);
      if (memTimers.has(key)) {
        clearTimeout(memTimers.get(key));
        memTimers.delete(key);
      }
    }
  },

  async delPattern(pattern) {
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } else {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      for (const key of memCache.keys()) {
        if (regex.test(key)) {
          memCache.delete(key);
          if (memTimers.has(key)) {
            clearTimeout(memTimers.get(key));
            memTimers.delete(key);
          }
        }
      }
    }
  },

  // Cache-through helper: get from cache or compute and cache
  async wrap(key, ttlSeconds, fn) {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const value = await fn();
    if (value !== undefined && value !== null) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  },
};

module.exports = cache;
