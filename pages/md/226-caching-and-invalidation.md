Caching is the most effective single lever for reducing database load. A well-placed cache turns a 10 ms database query into a sub-millisecond memory read, and it absorbs traffic spikes that would otherwise overwhelm the database. But caching introduces a second copy of data — and **cache invalidation**, keeping that copy accurate, is where most caching bugs live.

## The Cache Hierarchy

Modern applications layer multiple caches between the user and the database. Each layer adds speed and adds a staleness risk:

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cache hierarchy from browser to database: browser cache, CDN, application cache, database buffer pool">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Browser -->
  <rect x="20" y="100" width="110" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="75" y="124" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Browser</text>
  <text x="75" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">HTTP cache</text>

  <line x1="130" y1="130" x2="160" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- CDN -->
  <rect x="160" y="100" width="110" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="215" y="124" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">CDN</text>
  <text x="215" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">edge cache</text>

  <line x1="270" y1="130" x2="300" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- App cache -->
  <rect x="300" y="80" width="110" height="100" rx="8" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="2"/>
  <text x="355" y="120" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">App Cache</text>
  <text x="355" y="138" text-anchor="middle" font-size="10" fill="var(--text)">Redis / Memcached</text>
  <text x="355" y="156" text-anchor="middle" font-size="10" fill="var(--muted)">~0.1–1 ms</text>

  <line x1="410" y1="130" x2="440" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- DB buffer pool -->
  <rect x="440" y="90" width="110" height="80" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="495" y="120" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">DB Buffer</text>
  <text x="495" y="138" text-anchor="middle" font-size="12" fill="var(--text)">Pool</text>
  <text x="495" y="156" text-anchor="middle" font-size="10" fill="var(--muted)">~1–10 ms</text>

  <line x1="550" y1="130" x2="580" y2="130" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arr)"/>

  <!-- Disk -->
  <rect x="580" y="105" width="50" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="605" y="128" text-anchor="middle" font-size="10" fill="var(--text)">Disk</text>
  <text x="605" y="144" text-anchor="middle" font-size="9" fill="var(--muted)">~5–100ms</text>

  <!-- Latency labels -->
  <text x="320" y="220" text-anchor="middle" font-size="11" fill="var(--muted)">← faster, more stale                    slower, fresher →</text>
</svg>
<figcaption>Every hop from browser to disk adds latency. Application-level caches (Redis) are the most common tuning point for database load.</figcaption>
</figure>

## Cache Patterns

### Cache-Aside (Lazy Loading)

The most common pattern. The application checks the cache first; on a miss, it reads from the database and populates the cache.

```python
def get_user(user_id):
    cached = redis.get(f"user:{user_id}")
    if cached:
        return deserialize(cached)        # cache hit — no DB touch

    user = db.query("SELECT * FROM users WHERE id = ?", user_id)
    redis.setex(f"user:{user_id}", 300, serialize(user))  # TTL = 5 min
    return user
```

**Pros:** Only caches what's actually requested. DB is the source of truth.  
**Cons:** Cold start is slow. First request after expiry (or after a deploy) always misses.

### Write-Through

The application writes to the cache and the database at the same time. Cache is never stale — but writes are slower.

```python
def update_user(user_id, data):
    db.execute("UPDATE users SET name = ? WHERE id = ?", data['name'], user_id)
    redis.setex(f"user:{user_id}", 300, serialize(data))  # write cache too
```

### Write-Behind (Write-Back)

The application writes to the cache first; an async job flushes to the database later. Very fast writes, but risks data loss on crash.

## The Hard Part: Invalidation

Phil Karlton's famous observation: "There are only two hard things in computer science: cache invalidation and naming things."

Cache invalidation fails in three ways:

| Failure mode | Description | Mitigation |
|---|---|---|
| **Stale reads** | Cache returns an old value after a write | Short TTLs; event-driven invalidation |
| **Cache stampede** | TTL expires; many requests hit the DB simultaneously | Probabilistic early expiry; locks; background refresh |
| **Phantom invalidation** | Invalidating a key that doesn't correspond to what changed | Granular keys; structured key naming |

### Event-Driven Invalidation

Instead of relying on TTLs alone, publish an event when data changes and have consumers delete or update the relevant cache keys:

```
[Write to orders table]
    → publish OrderUpdated event
        → consumer deletes "order:1234" from Redis
        → consumer deletes "customer:101:recent_orders" from Redis
```

This keeps cache fresh without waiting for TTL expiry, but requires disciplined event publishing on every write path.

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Cache TTL Simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE cache_entries (key TEXT PRIMARY KEY, value TEXT NOT NULL, cached_at INTEGER NOT NULL, ttl_seconds INTEGER NOT NULL); INSERT INTO cache_entries VALUES ('user:101','Alice,alice@ex.com',1700000000,300),('user:102','Bob,bob@ex.com',1700000050,300),('user:103','Carol,carol@ex.com',1700000100,60),('product:55','Widget Pro',1700000000,3600); -- Simulate current unix time as 1700000200">-- See which cache entries are still valid vs expired
-- (simulated: current time = 1700000200)
SELECT
  key,
  value,
  (1700000200 - cached_at)              AS age_seconds,
  ttl_seconds,
  CASE
    WHEN (1700000200 - cached_at) &lt; ttl_seconds THEN 'HIT'
    ELSE 'EXPIRED'
  END                                   AS cache_status
FROM cache_entries
ORDER BY cache_status, age_seconds;</textarea>
  </div>
</div>

## What Not to Cache

| Type of data | Why caching is risky |
|---|---|
| Financial balances | Stale balance can lead to double-spend |
| Security tokens / permissions | Stale permission = authorization bypass |
| Counters with strict correctness | Race conditions in cache increment ≠ DB increment |
| Very small / fast queries | Cache overhead exceeds query cost |

## Cache Hit Rate

Track your **cache hit rate** = hits / (hits + misses). A well-tuned cache should hit 90–99 % for stable data. If hit rate is below 70 %, the TTL is too short, keys are too granular, or the workload is too random for caching to help.

> **Key takeaways:** Cache-aside is the safest starting pattern. Use short TTLs as a safety net; use event-driven invalidation for correctness. Track hit rate — it tells you if the cache is actually working. Never cache financial or security-critical data that must be authoritative.
