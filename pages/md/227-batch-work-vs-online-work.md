Every database operation is either **online** (serving a user request right now, latency matters) or **batch** (processing a large volume of work in the background, throughput matters). Mixing the two in the same query path is one of the most reliable ways to degrade user-facing performance. Separating them is one of the most effective — and underused — performance patterns in database engineering.

## Defining the Boundary

**Online work** is synchronous and user-facing. A user clicked a button; they are waiting for a response. Latency SLAs apply — typically under 200 ms, often under 50 ms.

**Batch work** is asynchronous and infrastructure-facing. No user is blocked. The goal is to process the most data in the least time. Throughput matters; latency does not.

The same database operation can be online or batch depending on context:

| Operation | Online context | Batch context |
|---|---|---|
| `SELECT SUM(total)` | Revenue widget on every page load → problem | Nightly report job → fine |
| `UPDATE SET status =` | Mark one order shipped (user action) → fine | Bulk-expire 500k sessions → problem |
| `INSERT` | One order checkout → fine | ETL loading 10M rows → problem |

## Why Batch Work Hurts Online Users

When a heavy batch job runs alongside an OLTP workload, it competes for:

- **Buffer pool / page cache** — the batch evicts hot OLTP pages, causing cache misses.
- **I/O bandwidth** — sequential batch reads saturate disk, increasing latency for random OLTP reads.
- **Lock contention** — a batch UPDATE that locks millions of rows blocks concurrent writers.
- **CPU** — aggressive batch processing saturates query threads, queuing online queries.

The result is a predictable pattern: user-facing latency spikes during ETL windows, nightly aggregation jobs, or bulk export operations.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing online latency spiking when a batch job runs in the same time window">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--text)"/>
    </marker>
  </defs>

  <!-- Axes -->
  <line x1="60" y1="200" x2="600" y2="200" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="60" y1="200" x2="60" y2="40" stroke="var(--border)" stroke-width="1.5"/>
  <text x="330" y="228" text-anchor="middle" font-size="11" fill="var(--muted)">Time →</text>
  <text x="25" y="120" text-anchor="middle" font-size="11" fill="var(--muted)" transform="rotate(-90,25,120)">Latency</text>

  <!-- Baseline latency line -->
  <polyline points="60,160 200,162 240,80 360,78 400,160 600,162"
    fill="none" stroke="var(--accent)" stroke-width="2.5"/>

  <!-- Batch window marker -->
  <rect x="240" y="40" width="160" height="160" fill="var(--muted)" opacity="0.1" stroke="var(--muted)" stroke-width="1" stroke-dasharray="5,3"/>
  <text x="320" y="58" text-anchor="middle" font-size="11" fill="var(--muted)">Batch job running</text>

  <!-- Normal baseline indicator -->
  <line x1="60" y1="162" x2="240" y2="162" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="150" y="178" text-anchor="middle" font-size="10" fill="var(--muted)">normal latency</text>

  <!-- Spike annotation -->
  <line x1="320" y1="78" x2="320" y2="58" stroke="var(--text)" stroke-width="1" opacity="0.5"/>
  <text x="320" y="172" text-anchor="middle" font-size="10" fill="var(--accent)" font-weight="600">latency spike</text>

  <!-- Tick labels -->
  <text x="60" y="216" text-anchor="middle" font-size="10" fill="var(--muted)">00:00</text>
  <text x="240" y="216" text-anchor="middle" font-size="10" fill="var(--muted)">02:00</text>
  <text x="400" y="216" text-anchor="middle" font-size="10" fill="var(--muted)">04:00</text>
  <text x="600" y="216" text-anchor="middle" font-size="10" fill="var(--muted)">06:00</text>
</svg>
<figcaption>Online latency spikes during the batch window (02:00–04:00). Batch and OLTP workloads compete for buffer pool, I/O, and CPU.</figcaption>
</figure>

## Separation Strategies

### 1. Time-Based Separation
Schedule batch jobs during off-peak hours. Simple, effective for predictable low-traffic windows. Fails when traffic is global and there is no quiet window.

### 2. Read Replica Routing
Run batch reads against a read replica, not the primary. This removes I/O pressure from the primary entirely. Works well for reporting and export jobs.

```sql
-- Application config: route heavy reads to replica
connection = db.connect(host='replica.db.internal')
result = connection.execute("SELECT * FROM events WHERE ...")
```

### 3. Chunked Batch Processing

A batch job that updates 10 million rows in one transaction holds locks and consumes resources for minutes. The same job processed in chunks of 1,000 rows releases locks between chunks, allowing online queries to proceed.

```sql
-- Bad: one giant transaction
UPDATE events SET processed = 1 WHERE processed = 0;  -- locks millions of rows

-- Better: chunked
UPDATE events SET processed = 1
WHERE id IN (
  SELECT id FROM events WHERE processed = 0 LIMIT 1000
);
-- repeat until done; sleep briefly between iterations
```

### 4. Outbox / Queue Pattern

Instead of writing directly to the database in a batch loop, write to a queue (RabbitMQ, Kafka, SQS) and let workers consume at a controlled rate. The queue provides backpressure — if the database is under pressure, workers slow down automatically.

### 5. Dedicated Batch Store

At scale, use a separate database optimised for batch workloads (columnar store, data warehouse) and replicate data from the OLTP store. Online queries never compete with batch queries because they run on different hardware.

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Chunked Batch Update</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); INSERT INTO events VALUES (1,'click',0,'2024-01-01'),(2,'view',0,'2024-01-01'),(3,'purchase',0,'2024-01-01'),(4,'click',0,'2024-01-01'),(5,'view',1,'2024-01-01'),(6,'click',0,'2024-01-01'),(7,'purchase',0,'2024-01-01'),(8,'view',0,'2024-01-01');">-- How many unprocessed events remain?
SELECT COUNT(*) AS unprocessed FROM events WHERE processed = 0;

-- Simulate one chunk: mark 3 rows at a time
-- UPDATE events SET processed = 1
-- WHERE id IN (SELECT id FROM events WHERE processed = 0 LIMIT 3);

-- Then check progress:
-- SELECT processed, COUNT(*) FROM events GROUP BY processed;</textarea>
  </div>
</div>

## Decision Guide

| Situation | Approach |
|---|---|
| Report that runs nightly, < 1h | Schedule in off-peak window |
| Report that must be near-real-time | Materialized view or read replica |
| Bulk update of millions of rows | Chunk + sleep loop |
| Event processing at high volume | Queue + controlled worker pool |
| Analytics over full dataset | Separate column store / data warehouse |

> **Key takeaways:** Never run batch work on the same resource path as online queries during peak traffic. Chunk large updates to release locks between batches. Route heavy reads to replicas. Use queues to decouple batch throughput from online availability. The boundary between online and batch is an architectural decision, not just a scheduling detail.
