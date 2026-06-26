The previous pages showed how key-value stores trade query richness for raw speed. But speed means different things depending on what you are protecting against. A cache optimizes for **fast reads** — losing data on a crash is acceptable because the data can be recomputed. A persistent store optimizes for **durability** — data must survive crashes, restarts, and power cuts. The same key-value engine can serve both roles, but the configuration choices are very different.

## Two Different Contracts

The core distinction is not about which software you run — it is about **what you promise about the data**.

| Property | Cache mode | Persistent store mode |
|---|---|---|
| Data lives in | RAM only | RAM + durable storage |
| Survives a crash? | No (acceptable) | Yes (required) |
| Source of truth? | No — origin DB holds real data | Yes — this IS the real data |
| Typical latency | < 1 ms | 1–5 ms (with fsync) |
| Eviction policy | Yes — LRU, LFU, etc. | No (or capacity-based only) |
| Examples | Redis (cache-only config), Memcached | Redis (AOF + RDB), RocksDB, etcd |

> **Note:** Memcached is cache-only by design — it has no persistence mechanism at all. Redis was originally cache-first but added persistence options over time; today it is commonly used in both modes.

### The Cache Contract

When you use a key-value store as a cache, the golden rule is: **the cache is a copy, not the original**. Your application writes the canonical data to a relational or document database, then populates the cache as a fast-path shortcut:

```
1. Request arrives: GET cache:product:9182
2. Cache hit  → return cached value immediately
3. Cache miss → query origin DB, write result to cache, return value
```

Because the data is always reconstructible from the origin, you can afford:
- **No persistence** — if the server reboots, you lose cached entries. Traffic hits the origin DB until the cache warms back up, then life continues normally.
- **Eviction** — when memory is full, the store discards least-recently-used (or least-frequently-used) keys automatically. You configure `maxmemory` and `maxmemory-policy` in Redis.

### The Persistence Contract

When the key-value store is the **system of record** — think distributed configuration, session tokens that cannot be silently lost, or a job queue — you need durability guarantees comparable to a relational database.

Redis offers two persistence mechanisms that can be combined:

- **RDB (Redis Database) snapshots** — Redis forks itself and writes a point-in-time binary snapshot to disk at configured intervals (e.g., every 60 s if 1000 keys changed). Fast to load on restart; you can lose up to one snapshot interval of writes.
- **AOF (Append-Only File)** — every write command is appended to a log file. On restart Redis replays the log. With `appendfsync always`, you get at most one command lost; with `appendfsync everysec` (the common default) you lose at most one second of writes.

<figure class="diagram">
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline comparing cache mode vs persistent mode: cache loses data on crash, persistent mode replays AOF log and recovers">
  <defs>
    <marker id="p-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- ── CACHE MODE row ── -->
  <text x="16" y="48" font-size="13" font-weight="600" fill="var(--text)">Cache mode</text>
  <line x1="16" y1="75" x2="620" y2="75" stroke="var(--border)" stroke-width="2"/>

  <rect x="40" y="58" width="52" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="66" y="71" text-anchor="middle" font-size="11" fill="var(--surface-2)">writes</text>

  <rect x="110" y="58" width="52" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="136" y="71" text-anchor="middle" font-size="11" fill="var(--surface-2)">writes</text>

  <line x1="220" y1="55" x2="220" y2="100" stroke="#e05252" stroke-width="2.5" stroke-dasharray="4,3"/>
  <text x="220" y="112" text-anchor="middle" font-size="12" fill="#e05252">crash</text>

  <rect x="236" y="58" width="90" height="18" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="281" y="71" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.5">data lost</text>

  <rect x="340" y="58" width="80" height="18" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="380" y="71" text-anchor="middle" font-size="11" fill="var(--text)">cold restart</text>
  <rect x="434" y="58" width="80" height="18" rx="3" fill="var(--accent)" opacity="0.35"/>
  <text x="474" y="71" text-anchor="middle" font-size="11" fill="var(--text)">cache warms</text>
  <rect x="528" y="58" width="72" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="564" y="71" text-anchor="middle" font-size="11" fill="var(--surface-2)">normal</text>

  <text x="281" y="98" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.6">origin DB fills the gap</text>

  <!-- ── PERSISTENT MODE row ── -->
  <text x="16" y="168" font-size="13" font-weight="600" fill="var(--text)">Persistent mode (AOF)</text>
  <line x1="16" y1="195" x2="620" y2="195" stroke="var(--border)" stroke-width="2"/>

  <rect x="40" y="178" width="52" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="66" y="191" text-anchor="middle" font-size="11" fill="var(--surface-2)">writes</text>
  <rect x="40" y="200" width="52" height="14" rx="2" fill="var(--accent)" opacity="0.25"/>
  <text x="66" y="211" text-anchor="middle" font-size="10" fill="var(--text)">→ AOF</text>

  <rect x="110" y="178" width="52" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="136" y="191" text-anchor="middle" font-size="11" fill="var(--surface-2)">writes</text>
  <rect x="110" y="200" width="52" height="14" rx="2" fill="var(--accent)" opacity="0.25"/>
  <text x="136" y="211" text-anchor="middle" font-size="10" fill="var(--text)">→ AOF</text>

  <rect x="174" y="178" width="36" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="192" y="191" text-anchor="middle" font-size="11" fill="var(--surface-2)">wri…</text>
  <rect x="174" y="200" width="36" height="14" rx="2" fill="var(--accent)" opacity="0.25"/>
  <text x="192" y="211" text-anchor="middle" font-size="10" fill="var(--text)">→ AOF</text>

  <line x1="220" y1="175" x2="220" y2="220" stroke="#e05252" stroke-width="2.5" stroke-dasharray="4,3"/>
  <text x="220" y="232" text-anchor="middle" font-size="12" fill="#e05252">crash</text>

  <rect x="236" y="178" width="100" height="18" rx="3" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="286" y="191" text-anchor="middle" font-size="11" fill="var(--accent)">replay AOF log</text>

  <rect x="350" y="178" width="90" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="395" y="191" text-anchor="middle" font-size="11" fill="var(--surface-2)">recovered</text>
  <rect x="454" y="178" width="72" height="18" rx="3" fill="var(--accent)" opacity="0.7"/>
  <text x="490" y="191" text-anchor="middle" font-size="11" fill="var(--surface-2)">normal</text>

  <text x="286" y="218" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.6">data intact — at most 1 s lost</text>
</svg>
<figcaption>Cache mode accepts data loss on crash and relies on the origin DB to refill. Persistent mode replays the append-only log and recovers within seconds.</figcaption>
</figure>

## Eviction: The Cache-Only Feature

One concept that only makes sense in cache mode is **eviction** — the store automatically deletes old entries when it is under memory pressure. No relational database does this; in a source-of-truth store it would be catastrophic. In a cache it is entirely expected.

Redis ships with several eviction policies:

| Policy | What gets evicted |
|---|---|
| `allkeys-lru` | The least-recently-used key across all keys |
| `allkeys-lfu` | The least-frequently-used key across all keys |
| `volatile-lru` | LRU, but only among keys that have a TTL set |
| `volatile-ttl` | The key whose TTL will expire soonest |
| `noeviction` | Reject writes when full (good for persistent use) |

A persistent key-value store should use `noeviction` (or set a very large `maxmemory` and alert on it). Silently deleting data from a system of record is a bug, not a feature.

## Choosing Your Mode — and Mixing Both

In practice, many production systems run **two separate Redis instances**: one configured for caching (fast, eviction enabled, no AOF) and one for persistence (AOF enabled, `noeviction`, replicated). This avoids the accidental footgun of cache eviction wiping out durable data.

The decision tree is simple:

- **Can you reconstruct the data if it disappears?** → Cache mode is fine.
- **Would losing this data cause incorrect behavior or lost work?** → Enable persistence (AOF + RDB), set `noeviction`, and treat it as a database.

Try the widget below. It models a cache table with TTL-style expiry and a persistent store without expiry. Notice how you can simulate a cache miss by querying for a key with an expired entry, versus a persistent store where no expiry field exists.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Cache vs Persistent Store</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE cache_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_epoch INTEGER NOT NULL); CREATE TABLE persistent_store (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO cache_store VALUES ('page:home:en', 'cached HTML...', 9999999999); INSERT INTO cache_store VALUES ('page:about:en', 'cached HTML...', 1000000000); INSERT INTO persistent_store VALUES ('config:feature_flags', '{&quot;dark_mode&quot;:true}'); INSERT INTO persistent_store VALUES ('session:user:4291', '{&quot;role&quot;:&quot;admin&quot;}');">-- Cache lookup: only return the entry if it hasn't expired.
-- 'page:home:en' is fresh; 'page:about:en' has expired (epoch in the past).
SELECT key, value,
       CASE WHEN expires_epoch > 1700000000 THEN 'HIT' ELSE 'MISS (expired)' END AS cache_result
FROM cache_store;

-- Persistent store: no TTL, data is always there:
-- SELECT key, value FROM persistent_store;</textarea>
  </div>
</div>

> **Note:** Real Redis TTL eviction is handled inside the engine — you never write the `WHERE expires_epoch > now()` check yourself. The SQL widget above makes the mechanism visible by modeling it explicitly. The key insight is the same: cache entries are transient, persistent entries are not.

## Key Takeaways

- A cache is a **copy** of data that lives elsewhere — data loss on crash is acceptable and expected.
- A persistent key-value store is the **source of truth** — durability guarantees (AOF, RDB) are required.
- Eviction (automatically deleting keys under memory pressure) is a cache feature; it is dangerous in a persistence context.
- Redis supports both modes through configuration; Memcached is cache-only by design.
- Many production systems run separate instances for caching and persistence to prevent accidental data loss from eviction.
