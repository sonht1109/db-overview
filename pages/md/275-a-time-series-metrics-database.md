Time-series data — CPU usage sampled every second, temperature readings every minute, stock ticks every millisecond — has properties that break conventional relational assumptions. Rows are almost never updated after insertion. Queries always filter by a time range. Old data must be purged automatically. This case study shows how to design a relational schema that handles time-series efficiently, and where purpose-built stores take over.

## What Makes Time-Series Different

| Property | Transactional DB | Time-Series |
|---|---|---|
| Write pattern | Random inserts/updates | Sequential append only |
| Read pattern | Point lookups, joins | Time-range scans, aggregations |
| Cardinality | Bounded | Unbounded — grows forever |
| Update frequency | High | Writes arrive fast; rows never change |
| Retention | Keep forever | Purge after N days |

These differences mean that **time-ordering of data on disk** is critical. In a B-tree, appending timestamps in order places new rows on the last page — which is cache-hot. Reading a time range is a short sequential scan. This is the opposite of a random-access OLTP workload.

## Core Schema: Metrics Store

```sql
CREATE TABLE metric_sources (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,    -- 'web-server-1', 'db-primary'
  kind TEXT NOT NULL            -- 'host', 'service', 'sensor'
);

CREATE TABLE metric_names (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE     -- 'cpu_pct', 'mem_bytes', 'req_latency_ms'
);

CREATE TABLE metrics (
  ts        INTEGER NOT NULL,   -- Unix epoch seconds
  source_id INTEGER NOT NULL REFERENCES metric_sources(id),
  metric_id INTEGER NOT NULL REFERENCES metric_names(id),
  value     REAL NOT NULL,
  PRIMARY KEY (ts, source_id, metric_id)
);
```

### Why a Composite Primary Key?

`(ts, source_id, metric_id)` is the natural access key: "give me metric M for source S between time A and time B." The composite PK doubles as the index that makes that range scan fast. Rows are physically ordered by timestamp — new inserts always append to the end.

### Normalizing Source and Metric Names

Storing `source_id` and `metric_id` as integer foreign keys instead of raw strings saves significant storage. If you have 1 million rows, storing the string `"web-server-1"` 1 million times wastes far more space than an integer. More importantly, the integer fits in the composite primary key and compresses well.

<figure class="diagram">
<svg viewBox="0 0 680 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Time-series schema: metrics fact table linked to metric_sources and metric_names, with timeline showing sequential appends">
  <defs>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- metric_sources -->
  <rect x="10" y="60" width="150" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="10" y="60" width="150" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="85" y="78" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">metric_sources</text>
  <text x="24" y="102" font-size="11" fill="var(--muted)">PK id</text>
  <text x="24" y="118" font-size="11" fill="var(--text)">name UNIQUE</text>
  <text x="24" y="134" font-size="11" fill="var(--text)">kind</text>

  <!-- metrics (center) -->
  <rect x="240" y="40" width="200" height="120" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <rect x="240" y="40" width="200" height="26" rx="6" fill="var(--accent)" opacity="0.3"/>
  <text x="340" y="58" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">metrics</text>
  <text x="254" y="82" font-size="11" fill="var(--muted)">PK ts (Unix epoch)</text>
  <text x="254" y="98" font-size="11" fill="var(--muted)">PK/FK source_id</text>
  <text x="254" y="114" font-size="11" fill="var(--muted)">PK/FK metric_id</text>
  <text x="254" y="130" font-size="11" fill="var(--text)">value REAL</text>
  <text x="254" y="148" font-size="10" fill="var(--muted)">→ ordered by (ts, source, metric)</text>

  <!-- metric_names -->
  <rect x="520" y="60" width="150" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="520" y="60" width="150" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="595" y="78" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">metric_names</text>
  <text x="534" y="102" font-size="11" fill="var(--muted)">PK id</text>
  <text x="534" y="118" font-size="11" fill="var(--text)">name UNIQUE</text>

  <!-- Arrows -->
  <line x1="160" y1="105" x2="238" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="520" y1="105" x2="442" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Timeline illustration -->
  <line x1="40" y1="220" x2="640" y2="220" stroke="var(--border)" stroke-width="2"/>
  <text x="40" y="240" font-size="10" fill="var(--muted)">t=1000</text>
  <text x="200" y="240" font-size="10" fill="var(--muted)">t=1060</text>
  <text x="360" y="240" font-size="10" fill="var(--muted)">t=1120</text>
  <text x="520" y="240" font-size="10" fill="var(--muted)">t=1180</text>
  <rect x="40" y="205" width="40" height="14" rx="2" fill="var(--accent)" opacity="0.5"/>
  <rect x="200" y="205" width="40" height="14" rx="2" fill="var(--accent)" opacity="0.5"/>
  <rect x="360" y="205" width="40" height="14" rx="2" fill="var(--accent)" opacity="0.5"/>
  <rect x="520" y="205" width="40" height="14" rx="2" fill="var(--accent)" opacity="0.5"/>
  <text x="340" y="198" text-anchor="middle" font-size="10" fill="var(--muted)">sequential appends → cache-friendly</text>
</svg>
<figcaption>Metrics rows arrive in timestamp order and are stored sequentially in the B-tree — time-range scans are efficient sequential reads.</figcaption>
</figure>

## Downsampling: Keeping Storage Under Control

Raw second-by-second data grows fast. A common strategy is **downsampling** — aggregating fine-grained data into coarser buckets and deleting the originals:

- Keep raw (1-second) data for 24 hours.
- Keep 1-minute averages for 30 days.
- Keep 1-hour averages for 1 year.
- Keep 1-day averages forever.

```sql
-- 1-minute average rollup
CREATE TABLE metrics_1m (
  ts        INTEGER NOT NULL,   -- start of minute
  source_id INTEGER NOT NULL,
  metric_id INTEGER NOT NULL,
  avg_val   REAL NOT NULL,
  min_val   REAL NOT NULL,
  max_val   REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  PRIMARY KEY (ts, source_id, metric_id)
);

-- Compute a rollup for a given minute
INSERT OR REPLACE INTO metrics_1m
SELECT
  (ts / 60) * 60 AS ts,
  source_id,
  metric_id,
  AVG(value)   AS avg_val,
  MIN(value)   AS min_val,
  MAX(value)   AS max_val,
  COUNT(*)     AS sample_count
FROM metrics
WHERE ts >= ? AND ts < ? + 60
GROUP BY (ts / 60) * 60, source_id, metric_id;
```

> **Note:** Storing `min_val` and `max_val` alongside the average lets you draw accurate charts even from rolled-up data — you still know the spike was there, even if you compressed it into a 1-minute bucket.

## Retention: Auto-Purge

```sql
-- Delete raw metrics older than 24 hours
DELETE FROM metrics
WHERE ts < strftime('%s','now') - 86400;
```

Run this as a scheduled job. In SQLite, deleting many rows at once can cause a large write-ahead-log entry; deleting in batches of 10 000 rows reduces pressure.

## Gap Filling

A common analytics need is "show me a chart with one data point per minute, even if no data arrived." Databases with `GENERATE_SERIES` or window functions make this easy; SQLite doesn't have `GENERATE_SERIES`, but you can simulate it with a CTE or a pre-seeded time spine table.

```sql
-- Time spine: pre-seeded minute buckets (illustrative)
CREATE TABLE time_spine_1m (ts INTEGER PRIMARY KEY);
-- ...populated by INSERT with known time range...

SELECT sp.ts,
       COALESCE(m.avg_val, 0) AS avg_val
FROM time_spine_1m sp
LEFT JOIN metrics_1m m
  ON m.ts = sp.ts
  AND m.source_id = 1
  AND m.metric_id = 1
WHERE sp.ts BETWEEN ? AND ?
ORDER BY sp.ts;
```

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Time-Series Queries</span></div>
  <div class="widget-body">
    <textarea data-setup="
CREATE TABLE metric_sources (id INTEGER PRIMARY KEY, name TEXT UNIQUE, kind TEXT);
CREATE TABLE metric_names (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE metrics (ts INTEGER, source_id INTEGER, metric_id INTEGER, value REAL, PRIMARY KEY(ts, source_id, metric_id));
CREATE TABLE metrics_1m (ts INTEGER, source_id INTEGER, metric_id INTEGER, avg_val REAL, min_val REAL, max_val REAL, sample_count INTEGER, PRIMARY KEY(ts, source_id, metric_id));
INSERT INTO metric_sources VALUES (1,'web-1','host'),(2,'web-2','host'),(3,'db-1','host');
INSERT INTO metric_names VALUES (1,'cpu_pct'),(2,'mem_bytes'),(3,'req_latency_ms');
INSERT INTO metrics VALUES (1700000000,1,1,42.1),(1700000001,1,1,43.5),(1700000002,1,1,41.8),(1700000060,1,1,55.0),(1700000061,1,1,57.2),(1700000000,2,1,30.1),(1700000060,2,1,31.5),(1700000000,1,2,1073741824),(1700000060,1,2,1174405120),(1700000000,3,3,5.2),(1700000001,3,3,6.1),(1700000002,3,3,4.9);
INSERT INTO metrics_1m VALUES (1700000000,1,1,42.47,41.8,43.5,3),(1700000060,1,1,56.1,55.0,57.2,2),(1700000000,2,1,30.1,30.1,30.1,1),(1700000060,2,1,31.5,31.5,31.5,1);
">-- 1-minute CPU averages for web-1 (from rollup table)
SELECT datetime(ts, 'unixepoch') AS minute,
       ROUND(avg_val, 2) AS avg_cpu,
       ROUND(min_val, 2) AS min_cpu,
       ROUND(max_val, 2) AS max_cpu
FROM metrics_1m
WHERE source_id = 1 AND metric_id = 1
ORDER BY ts;

-- Try: raw data for a 3-second window
-- SELECT ts, value FROM metrics
-- WHERE source_id = 1 AND metric_id = 1
--   AND ts BETWEEN 1700000000 AND 1700000002
-- ORDER BY ts;</textarea>
  </div>
</div>

## Key Takeaways

- **Composite primary key on `(ts, source_id, metric_id)`** physically orders data by time — the most important optimization for range scans.
- **Normalize source and metric names** to integers to reduce row size and improve compression.
- **Downsampling** (1s → 1m → 1h → 1d rollups) keeps storage bounded while preserving analytical accuracy.
- **Retention deletes** must be scheduled and batched to avoid write amplification.
- At extreme scale (millions of series, sub-second intervals), purpose-built databases like InfluxDB, TimescaleDB, or Prometheus are the right tool; the relational patterns here apply inside those systems too.
