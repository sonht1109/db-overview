The most common database performance mistake is not a bad index or a slow query — it is **tuning without measuring**. Engineers guess at the bottleneck based on intuition, add indexes, change settings, and rewrite queries, then measure after the fact to see if anything improved. This approach is slow, often counterproductive, and sometimes makes things worse. Measurement-first performance work is faster, more reliable, and produces changes you can actually explain.

## The Measurement-First Loop

```
Observe → Measure → Hypothesize → Change ONE thing → Measure again → Compare
```

Each step matters. Changing multiple things at once makes it impossible to attribute improvement or regression to a specific cause. A controlled, one-change-at-a-time approach is slower in the short term and dramatically faster when something goes wrong.

## Tools for Measurement

### EXPLAIN / EXPLAIN ANALYZE

Every major database has a query plan inspection command. It shows how the planner intends to execute the query before running it, and what it actually did after.

```sql
-- SQLite: see the query plan
EXPLAIN QUERY PLAN
SELECT o.id, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending';
```

Key things to look for:
- **SCAN** — sequential table scan (potentially slow on large tables)
- **SEARCH using index** — index was used (good)
- **USING TEMP B-TREE** — sorting required a sort buffer (may indicate missing index)

### Slow Query Logs

Most databases can log queries that exceed a threshold. This gives you a ranked list of queries worth investigating:

```sql
-- PostgreSQL: see the top 10 slowest queries
SELECT query,
       calls,
       ROUND(total_exec_time::numeric, 2)  AS total_ms,
       ROUND(mean_exec_time::numeric, 2)   AS mean_ms,
       ROUND(stddev_exec_time::numeric, 2) AS stddev_ms
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  10;
```

> **Note:** `pg_stat_statements` must be enabled as an extension. It is the single most useful built-in tool for production query analysis in PostgreSQL.

### Execution Statistics

Table-level statistics tell you which tables are hot and what kind of operations dominate.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Measurement loop diagram: observe symptoms, measure with tools, hypothesize cause, change one thing, measure again">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Circle of steps -->
  <!-- Step 1: Observe -->
  <rect x="240" y="20" width="160" height="48" rx="8" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="320" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">1. Observe</text>
  <text x="320" y="58" text-anchor="middle" font-size="11" fill="var(--muted)">slow pages, alerts, errors</text>

  <!-- Arrow 1→2 -->
  <line x1="400" y1="44" x2="480" y2="100" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 2: Measure -->
  <rect x="480" y="100" width="140" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="550" y="120" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">2. Measure</text>
  <text x="550" y="138" text-anchor="middle" font-size="11" fill="var(--muted)">EXPLAIN, slow log</text>

  <!-- Arrow 2→3 -->
  <line x1="550" y1="148" x2="480" y2="200" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 3: Hypothesize -->
  <rect x="360" y="200" width="160" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="440" y="220" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">3. Hypothesize</text>
  <text x="440" y="238" text-anchor="middle" font-size="11" fill="var(--muted)">missing index? bad join?</text>

  <!-- Arrow 3→4 -->
  <line x1="360" y1="224" x2="280" y2="224" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 4: Change one thing -->
  <rect x="120" y="200" width="160" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="200" y="218" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">4. Change ONE thing</text>
  <text x="200" y="236" text-anchor="middle" font-size="11" fill="var(--muted)">add index, rewrite query</text>

  <!-- Arrow 4→5 -->
  <line x1="120" y1="214" x2="60" y2="148" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 5: Measure again -->
  <rect x="20" y="100" width="140" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="90" y="120" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">5. Measure again</text>
  <text x="90" y="138" text-anchor="middle" font-size="11" fill="var(--muted)">compare before / after</text>

  <!-- Arrow 5→1 -->
  <line x1="160" y1="114" x2="238" y2="50" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr)"/>
</svg>
<figcaption>The measurement-first loop: observe, measure, hypothesize, change one thing, measure again. Never skip directly from observation to change.</figcaption>
</figure>

## Reading EXPLAIN Output

A simplified guide to the most important plan nodes:

| Node type | What it means | When it's a problem |
|---|---|---|
| Seq Scan | Reading every row in the table | Large table, low selectivity predicate |
| Index Scan | Following an index to heap rows | Almost always fine |
| Index Only Scan | No heap fetch needed (covering index) | Best possible |
| Hash Join | Building a hash table to join | High memory use on large inputs |
| Nested Loop | Per-row inner probe | Dangerous without inner index |
| Sort | Explicit sort step | Missing index on ORDER BY column |

## Baselines and Benchmarks

Before any change, capture a **baseline**:

```sql
-- Run the target query 5 times, record wall-clock time
-- Document: table row counts, index list, configuration settings
```

After the change, run the same measurement and compare. A 30 % improvement on a 10 ms query saves 3 ms — which may or may not matter. A 30 % improvement on a 500 ms query saves 150 ms, which is the difference between meeting and blowing your SLA.

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Reading Query Plans</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, status TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL); INSERT INTO orders VALUES (1,101,'shipped',49.99,'2024-01-05'),(2,102,'pending',120.00,'2024-01-06'),(3,101,'pending',30.00,'2024-01-07'),(4,103,'cancelled',15.00,'2024-01-08'),(5,101,'shipped',200.00,'2024-01-09');">-- See query plan WITHOUT an index on status
EXPLAIN QUERY PLAN
SELECT id, total FROM orders WHERE status = 'pending';

-- Now create an index and re-check the plan:
-- CREATE INDEX idx_status ON orders(status);
-- EXPLAIN QUERY PLAN SELECT id, total FROM orders WHERE status = 'pending';</textarea>
  </div>
</div>

## Common Measurement Mistakes

| Mistake | Effect |
|---|---|
| Measuring only once | Query plan cache or OS page cache skews result |
| Measuring in development with tiny data | Indexes not used below a threshold; plans differ |
| Measuring at off-peak hours | Different data distribution, connection pool pressure |
| Changing multiple things at once | Cannot attribute improvement |
| Ignoring p99 latency | Mean hides the tail; SLA is about the tail |

## When to Stop Tuning

Performance tuning has diminishing returns. Stop when:

1. The query meets its SLA with headroom.
2. Further improvement requires architectural changes that are out of scope.
3. The cost of the next change (risk, complexity, time) exceeds the benefit.

> **Key takeaways:** Always establish a baseline before making changes. Use EXPLAIN to understand plans, not guess at them. Change one thing at a time and measure the delta. Track p95/p99 latency, not means. Stop when you meet the SLA — perfection is the enemy of shipped.
