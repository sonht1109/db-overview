When a database's write volume is modest but read volume is enormous — think a news site, an analytics dashboard, or a product catalog — the bottleneck isn't the leader's ability to accept writes, it's the leader's CPU and I/O being consumed by thousands of concurrent `SELECT` queries. **Read replicas** are the standard answer: spin up additional followers, route read traffic to them, and let the leader focus on writes.

## What a Read Replica Is

A read replica is a follower that is configured to accept `SELECT` queries from application clients. It continuously replays the leader's replication stream to stay current, but it refuses `INSERT`, `UPDATE`, and `DELETE` — those always go to the leader.

<figure class="diagram">
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Read replica topology: the application sends writes to the primary and reads to one of two read replicas; the primary streams changes to both replicas">
  <defs>
    <marker id="arr-acc" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr-brd" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Application box -->
  <rect x="220" y="14" width="200" height="52" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="36" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Application</text>
  <text x="320" y="56" text-anchor="middle" font-size="12" fill="var(--text)">writes → primary  |  reads → replica</text>

  <!-- Write arrow: app → primary -->
  <line x1="280" y1="66" x2="210" y2="126" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr-acc)"/>
  <text x="218" y="102" text-anchor="middle" font-size="11" fill="var(--accent)">WRITE</text>

  <!-- Read arrows: app → replicas -->
  <line x1="360" y1="66" x2="430" y2="126" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr-brd)"/>
  <text x="422" y="102" text-anchor="middle" font-size="11" fill="var(--text)">READ</text>
  <line x1="370" y1="66" x2="530" y2="126" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr-brd)"/>

  <!-- Primary box -->
  <rect x="80" y="126" width="160" height="60" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="160" y="151" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Primary</text>
  <text x="160" y="170" text-anchor="middle" font-size="12" fill="var(--text)">Writes + reads</text>

  <!-- Replication stream arrows: primary → replicas -->
  <line x1="240" y1="160" x2="390" y2="160" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-acc)"/>
  <text x="315" y="152" text-anchor="middle" font-size="11" fill="var(--accent)">replication stream</text>
  <line x1="240" y1="168" x2="490" y2="200" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-acc)"/>

  <!-- Replica 1 box -->
  <rect x="390" y="130" width="160" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="470" y="155" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Read Replica 1</text>
  <text x="470" y="174" text-anchor="middle" font-size="11" fill="var(--text)">SELECT only</text>

  <!-- Replica 2 box -->
  <rect x="490" y="210" width="130" height="56" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="555" y="234" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Read Replica 2</text>
  <text x="555" y="252" text-anchor="middle" font-size="11" fill="var(--text)">SELECT only</text>
</svg>
<figcaption>Read replica topology: the primary handles all writes and streams changes to replicas; reads are distributed across replicas.</figcaption>
</figure>

Most relational databases support this out of the box. PostgreSQL uses **streaming replication**; MySQL calls them **read replicas** in both the upstream and managed flavors (Amazon RDS, Google Cloud SQL); MongoDB exposes **secondaries** in a replica set for reads via `readPreference`.

## Replication Lag and Stale Reads

Because replication is almost always **asynchronous**, there is a window — often milliseconds, sometimes seconds under load — between when the primary commits a write and when a replica applies it. During that window a read from the replica returns **stale data**.

| Scenario | What can go wrong |
|---|---|
| User changes their email, then immediately views their profile | Profile page reads from replica — shows the old email |
| An order is placed, then an analytics query counts today's orders | Count may be off by one or more |
| A row is deleted, then a read checks existence | Row might still appear on a lagging replica |

This is **read-your-own-write** inconsistency — a common gotcha. Strategies to handle it:

- **Route sensitive reads to the primary.** After a user writes, send their own reads to the primary for a short window (e.g., 1–2 seconds), then fall back to replicas.
- **Track replication position.** The primary returns a log sequence number (LSN in Postgres, binlog position in MySQL) after each write. The app can wait until a replica has reached that position before reading from it.
- **Accept staleness where it's fine.** Analytics, dashboards, and search indexes often tolerate seconds or even minutes of lag without any real harm.

> **Note:** PostgreSQL's `pg_stat_replication` view lets you inspect each replica's lag in bytes and time. `SELECT * FROM pg_stat_replication;` on the primary reveals the current replication state.

## When to Add Read Replicas

Read replicas shine in **read-heavy workloads** where writes are a small fraction of total queries. A rule of thumb: if your primary's CPU is high but write throughput is modest, adding a replica and pointing reporting queries at it often cuts primary load dramatically.

They are also commonly used for **operational isolation** — running long analytical queries against a replica so they cannot slow down the primary serving user-facing traffic. This is sometimes called an **analytics replica** or **reporting replica** and may even have a slight delay forced on it (`recovery_min_apply_delay` in Postgres) to guard against accidental deletes.

What read replicas do **not** solve:
- **Write bottlenecks.** Every replica still applies every write. If writes are the problem, you need sharding or a different architecture.
- **Reduced durability by themselves.** An async replica is not a substitute for backups — if the primary crashes before a write is replicated, that write is lost.

## Observing Replication Lag in SQLite (Simulated)

Real replication lag is a runtime phenomenon, but you can reason about it with a simple model. The widget below seeds two "snapshot" tables — one representing the primary at time T, one representing a lagging replica at time T−1 — and lets you compare what each would return.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Simulating stale reads from a lagging replica</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE primary_orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER); INSERT INTO primary_orders VALUES (1, 'Alice', 'shipped', 120); INSERT INTO primary_orders VALUES (2, 'Bob', 'cancelled', 45); INSERT INTO primary_orders VALUES (3, 'Carol', 'pending', 88); INSERT INTO primary_orders VALUES (4, 'Dave', 'shipped', 200); CREATE TABLE replica_orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER); INSERT INTO replica_orders VALUES (1, 'Alice', 'pending', 120); INSERT INTO replica_orders VALUES (2, 'Bob', 'pending', 45); INSERT INTO replica_orders VALUES (3, 'Carol', 'pending', 88);">-- The replica is one replication cycle behind the primary.
-- Row 4 (Dave) does not exist yet on the replica.
-- Alice and Bob have stale statuses on the replica.

-- Compare total shipped revenue as seen by each node:
SELECT 'primary' AS source, SUM(amount) AS shipped_revenue
FROM primary_orders WHERE status = 'shipped'
UNION ALL
SELECT 'replica' AS source, SUM(amount) AS shipped_revenue
FROM replica_orders WHERE status = 'shipped';

-- Try: query replica_orders for Bob's status — it shows 'pending'
-- even though the primary already has 'cancelled'.</textarea>
  </div>
</div>

The numbers diverge because the replica hasn't applied the latest writes yet. In a real system this gap closes within milliseconds — but for reads that must be accurate the moment after a write, that window matters.

<details class="reveal"><summary>Reveal: If you need to guarantee a user sees their own write, what is the simplest routing rule?</summary><div class="reveal-body">Send reads that belong to the <em>same user session that just wrote</em> to the primary, at least for a brief window after the write. Everything else can go to replicas. This is sometimes implemented with a sticky session flag or a short TTL cache entry: "user 42 wrote at T, route their reads to primary until T + 2 s." It's not elegant, but it's the most straightforward way to avoid read-your-own-write anomalies without sacrificing replica scalability for all other users.</div></details>
