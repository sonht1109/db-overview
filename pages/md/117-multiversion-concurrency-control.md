Most locking strategies work by making readers wait for writers and writers wait for readers. **Multiversion concurrency control (MVCC)** takes a different approach: instead of blocking, the database keeps *multiple versions* of each row and serves each transaction its own consistent snapshot of the data. Readers never block writers; writers never block readers. This is how PostgreSQL, MySQL InnoDB, Oracle, and SQLite's WAL mode achieve high concurrency without sacrificing correctness.

## The Core Idea: Row Versions

Whenever a transaction modifies a row, the database does **not** overwrite the old value in place. Instead it stamps the old row with an expiry marker and writes a **new version** alongside it. Both versions coexist on disk for a while.

Each transaction gets a **transaction ID (XID)** when it starts. The engine uses this ID — together with the creation and expiry stamps on each row version — to decide which version is "visible" to that transaction. A transaction sees exactly the versions that were committed *before it started*: a frozen, consistent snapshot.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two row versions of the same row coexisting, each stamped with created-by and expired-by transaction IDs, and two concurrent transactions each seeing a different version">

  <!-- Title row labels -->
  <text x="20" y="22" font-size="13" font-weight="bold" fill="var(--text)">Row versions in storage</text>
  <text x="430" y="22" font-size="13" font-weight="bold" fill="var(--text)">What each transaction sees</text>

  <!-- Version 1 box (old) -->
  <rect x="20" y="35" width="370" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="36" y="56" font-size="12" font-weight="bold" fill="var(--text)">Version 1  (old)</text>
  <text x="36" y="76" font-size="12" fill="var(--text)">balance = 1000</text>
  <text x="36" y="95" font-size="11" fill="var(--text)">created by XID 40  ·  expired by XID 55</text>
  <rect x="200" y="60" width="170" height="44" rx="4" fill="var(--accent)" opacity="0.12" stroke="var(--accent)" stroke-width="1"/>
  <text x="285" y="79" text-anchor="middle" font-size="11" fill="var(--accent)" font-weight="bold">visible to XID 50</text>
  <text x="285" y="96" text-anchor="middle" font-size="11" fill="var(--accent)">(started before XID 55 wrote)</text>

  <!-- Version 2 box (new) -->
  <rect x="20" y="135" width="370" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="36" y="156" font-size="12" font-weight="bold" fill="var(--text)">Version 2  (current)</text>
  <text x="36" y="176" font-size="12" fill="var(--text)">balance = 1500</text>
  <text x="36" y="195" font-size="11" fill="var(--text)">created by XID 55  ·  not yet expired</text>
  <rect x="200" y="160" width="170" height="44" rx="4" fill="var(--accent)" opacity="0.12" stroke="var(--accent)" stroke-width="1"/>
  <text x="285" y="179" text-anchor="middle" font-size="11" fill="var(--accent)" font-weight="bold">visible to XID 60</text>
  <text x="285" y="196" text-anchor="middle" font-size="11" fill="var(--accent)">(started after XID 55 committed)</text>

  <!-- Vertical line between versions -->
  <line x1="205" y1="115" x2="205" y2="135" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>

  <!-- Right panel: transactions -->
  <rect x="420" y="35" width="205" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="522" y="57" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">Txn XID 50</text>
  <text x="522" y="75" text-anchor="middle" font-size="12" fill="var(--text)">Reads balance = 1000</text>
  <text x="522" y="90" text-anchor="middle" font-size="11" fill="var(--text)">(no blocking)</text>

  <rect x="420" y="135" width="205" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="522" y="157" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">Txn XID 60</text>
  <text x="522" y="175" text-anchor="middle" font-size="12" fill="var(--text)">Reads balance = 1500</text>
  <text x="522" y="190" text-anchor="middle" font-size="11" fill="var(--text)">(no blocking)</text>

  <!-- Arrows from versions to txn boxes -->
  <line x1="390" y1="75" x2="420" y2="65" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arrowMVCC)"/>
  <line x1="390" y1="175" x2="420" y2="165" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arrowMVCC)"/>

  <defs>
    <marker id="arrowMVCC" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Vacuum label -->
  <rect x="20" y="240" width="605" height="58" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" stroke-dasharray="6 3"/>
  <text x="36" y="261" font-size="12" font-weight="bold" fill="var(--text)">Vacuum / Garbage Collection</text>
  <text x="36" y="281" font-size="12" fill="var(--text)">Once no active transaction can see Version 1 anymore, the database reclaims its space.</text>
  <text x="36" y="296" font-size="11" fill="var(--text)">(PostgreSQL calls this process VACUUM; InnoDB uses a purge thread.)</text>
</svg>
<figcaption>Two versions of the same row coexist. Each transaction sees the version that was current at the moment it started.</figcaption>
</figure>

## Snapshot Isolation

The visibility rule just described gives each transaction **snapshot isolation**: every read within a transaction sees a consistent point-in-time snapshot, as if the rest of the world froze when the transaction began.

| Property | With MVCC |
|---|---|
| Readers block writers? | No |
| Writers block readers? | No |
| Dirty reads possible? | No — only committed versions are visible |
| Non-repeatable reads? | No — same snapshot throughout |
| Phantom reads? | No (in most MVCC implementations) |

This is why a long-running `SELECT` on PostgreSQL or MySQL InnoDB does not slow down concurrent `INSERT`/`UPDATE` workloads. The reader walks older row versions while writers add new ones.

> **Note:** MVCC prevents most read anomalies but does **not** automatically prevent write-write conflicts such as the lost update. Those still require explicit locking or compare-and-swap logic — as covered in the previous page.

## Write Conflicts and the Write Skew Problem

When two transactions both read the same snapshot and then write to *different* rows based on what they read, MVCC snapshot isolation can allow a subtle anomaly called **write skew**. Neither transaction overwrites the other (so it is not a lost update), but the combined result violates a constraint that both individually checked.

Classic example: an on-call scheduling system requires at least one doctor on shift at all times. Two doctors simultaneously check "is anyone else on duty?" — both see yes, both resign. Now nobody is on call.

Databases that need to prevent write skew offer **Serializable Snapshot Isolation (SSI)**, which tracks read/write dependencies and aborts transactions whose combined effect would not be achievable by any serial order. PostgreSQL has offered SSI since version 9.1.

## Garbage Collection: Cleaning Up Old Versions

Old versions accumulate on disk. Every MVCC engine needs a background process to reclaim space:

- **PostgreSQL** — `VACUUM` (and `autovacuum`): scans tables, marks dead tuples as free space, and optionally runs `ANALYZE` to update planner statistics.
- **MySQL InnoDB** — a **purge thread** reclaims undo log segments once no active transaction references them.
- **SQLite WAL mode** — a **checkpoint** process writes WAL frames back to the main database file; old frames become invisible once all readers have advanced past them.

Neglecting vacuuming (especially on high-churn tables) leads to **table bloat**: the table file grows even if the logical row count stays flat, because dead versions are never freed.

## See It in Action

SQLite does not expose its internal version stamps to SQL, but you can observe snapshot-like behavior through the WAL journal mode and transactions. The widget below simulates the snapshot effect by letting you see how uncommitted changes in one "session" are invisible to a query that runs without them.

Try this: run the default query, then uncomment the `INSERT` inside the CTE to see how a second writer would produce a new balance — while the original snapshot value stays what it was.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · MVCC snapshot simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, balance INTEGER NOT NULL); INSERT INTO accounts VALUES (1, 'Alice', 1000); INSERT INTO accounts VALUES (2, 'Bob', 2500); CREATE TABLE snapshots (taken_at TEXT, owner TEXT, balance INTEGER); INSERT INTO snapshots SELECT 'snapshot_at_T0', owner, balance FROM accounts;">-- Snapshot taken at T0 (simulates what a long-running read sees)
SELECT taken_at, owner, balance FROM snapshots;

-- Meanwhile, a writer updates Alice (committed after the snapshot was taken)
-- UPDATE accounts SET balance = 1500 WHERE owner = 'Alice';

-- The snapshot still shows the OLD value (1000), not 1500:
-- SELECT 'live' AS src, owner, balance FROM accounts
-- UNION ALL
-- SELECT taken_at, owner, balance FROM snapshots WHERE owner = 'Alice';
</textarea>
  </div>
</div>

Uncomment the `UPDATE` and the final `UNION ALL` query (remove the leading `--`), then re-run. The snapshot table still holds 1000 while the live table shows 1500 — exactly what MVCC delivers to a transaction that started before the update was committed.

<details class="reveal"><summary>Reveal: Why does VACUUM matter for query performance, not just disk space?</summary><div class="reveal-body">

PostgreSQL's query planner uses **table statistics** (row counts, column value distributions) to choose index vs. sequential scan, join order, and more. `VACUUM` optionally runs `ANALYZE`, which refreshes those statistics. On a heavily updated table, dead tuples inflate the apparent row count — the planner may think the table has millions of rows when only thousands are live, leading to bad plan choices. Regular autovacuum keeps statistics fresh and plans accurate.

</div></details>
