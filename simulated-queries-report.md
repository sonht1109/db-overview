# Simulated SQL Widgets — Fix Report

**Date:** July 15, 2026  
**Total pages with `data-setup` widgets:** 249  
**Total widgets analyzed:** 272  

---

## Understanding the Problem

Most `data-setup` widgets create fake tables (orders, customers, accounts, etc.) and seed them with `INSERT` statements. For pages teaching **SQL syntax** (SELECT, JOIN, GROUP BY, WHERE, etc.), this is correct and unavoidable — no system view contains retail orders or customer data.

The issue is pages teaching **database internals** where real system views, PRAGMAs, or catalog queries **do** exist that could replace the simulation. This report identifies those pages.

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Must keep simulated data (SQL teaching) | ~195 pages | No change |
| Can replace with real system query | ~20 pages | Fix with real queries |
| Should remove widget entirely | ~30 pages | Remove, no real alternative exists |
| Already partially uses real queries | ~4 pages | Already ok |

---

## Section 1: Pages to FIX with Real Queries

These pages teach about database internals where a real system view, PRAGMA, or catalog query exists.

---

### 1.1 Page: 082-heap-files-and-page-layouts.html
**Title:** Heap files and page layouts  
**Current simulation:** Creates `products` table with INSERTs, then queries `page_count`, `page_size` from SQLite PRAGMAs  
**Issue:** The `data-setup` creates unnecessary fake data; the `page_count`/`page_size` PRAGMAs are already real  
**Fix:** Remove `data-setup`. Query sqlite_master directly:  

```sql
-- Page statistics for the SQLite database
SELECT 
  name AS table_name,
  page_count,
  page_size,
  page_count * page_size AS total_bytes,
  CAST(page_count * page_size AS REAL) / (1024 * 1024) AS total_mb
FROM pragma_page_count, pragma_page_size;
```

---

### 1.2 Page: 086-free-space-management.html
**Title:** Free space management  
**Current simulation:** Creates 200 `events` rows, then queries `page_count`, `freelist_count`  
**Issue:** Same as above — the creation of fake events clutters the real query  
**Fix:** Remove `data-setup`. Query real stats directly:

```sql
SELECT 
  page_count, 
  page_size, 
  freelist_count,
  page_count * page_size AS file_bytes,
  freelist_count * page_size AS bytes_reclaimable
FROM pragma_page_count, pragma_page_size, pragma_freelist_count;
```

---

### 1.3 Page: 092-splits-merges-and-rebalancing.html
**Title:** Splits, merges, and rebalancing  
**Current simulation:** Creates 500-row `orders` table with index, then queries `sqlite_master` and `page_count`  
**Issue:** `sqlite_master` IS already a real system table. The 500 inserts are for creating a large index, which is a fair use case but could be simplified.  
**Fix:** Keep the data setup (needed to demonstrate splits) but update query to be clearer about what's real:

```sql
-- sqlite_master IS the real system catalog
SELECT name, type, rootpage 
FROM sqlite_master 
WHERE type = 'index' AND tbl_name = 'orders';

-- Real page stats
SELECT page_count, freelist_count 
FROM pragma_page_count, pragma_freelist_count;
```

---

### 1.4 Page: 098-space-amplification.html
**Title:** Space amplification  
**Current simulation:** Creates `events` table, then queries `page_count`, `freelist_count`  
**Issue:** Same pattern — fake data + real PRAGMA  
**Fix:** Remove `data-setup`. Query real stats:

```sql
SELECT 
  page_count,
  freelist_count,
  page_count - freelist_count AS pages_in_use,
  ROUND(CAST(page_count AS REAL) / NULLIF(page_count - freelist_count, 0), 2) AS space_amplification
FROM pragma_page_count, pragma_freelist_count;
```

---

### 1.5 Page: 141-leader-follower-replication.html
**Title:** Leader-follower replication  
**Current simulation:** Creates `replication_status` table with fake LSNs  
**Issue:** PostgreSQL has `pg_stat_replication`, MySQL has `SHOW REPLICA STATUS`  
**Fix:** Replace with a PostgreSQL query:

```sql
-- Real PostgreSQL replication lag query
SELECT
  application_name AS replica_name,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes,
  EXTRACT(EPOCH FROM replay_lag) AS lag_seconds
FROM pg_stat_replication
WHERE state = 'streaming'
ORDER BY replay_lag DESC;
```

---

### 1.6 Page: 142-synchronous-vs-asynchronous-replication.html
**Title:** Synchronous vs asynchronous replication  
**Current simulation:** Creates `replicas` table with fake sync/async modes  
**Issue:** PostgreSQL's `pg_stat_replication` has `sync_state` column  
**Fix:**

```sql
SELECT
  application_name,
  sync_state,
  sync_priority,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication
ORDER BY sync_priority;
```

---

### 1.7 Page: 144-replication-lag.html
**Title:** Replication lag  
**Current simulation:** Creates `events` table with fake primary/replica data  
**Issue:** PostgreSQL `pg_stat_replication` has real `replay_lag`  
**Fix:**

```sql
SELECT
  application_name,
  EXTRACT(EPOCH FROM replay_lag) AS lag_seconds,
  CASE 
    WHEN replay_lag > interval '5 seconds' THEN 'WARNING: Lagging'
    ELSE 'OK'
  END AS status
FROM pg_stat_replication;
```

---

### 1.8 Page: 145-failover-and-promotion.html
**Title:** Failover and promotion  
**Current simulation:** Creates `leader_log` table with fake LSNs  
**Issue:** No single real query exists for failover simulation — this is a conceptual demo  
**Fix:** Remove the widget. The concept is better illustrated by the diagram/text already on the page.

---

### 1.9 Page: 152-two-phase-commit.html
**Title:** Two-phase commit  
**Current simulation:** Creates `prepared_xacts` with fake in-doubt transactions  
**Issue:** PostgreSQL has `pg_prepared_xacts` — THE real system view for this exact topic  
**Fix:**

```sql
-- Real in-doubt prepared transactions (PostgreSQL)
SELECT
  gid,
  database,
  owner,
  prepared,
  EXTRACT(EPOCH FROM now() - prepared)::integer AS age_seconds,
  CASE 
    WHEN now() - prepared > interval '5 minutes' 
      THEN 'ORPHANED — investigate'
    ELSE 'RECENT'
  END AS status
FROM pg_prepared_xacts
ORDER BY prepared;
```

---

### 1.10 Page: 094-checkpoints.html
**Title:** Checkpoints  
**Current simulation:** Creates `buffer_pool` table with dirty/clean page simulation  
**Issue:** PostgreSQL has `pg_stat_bgwriter` with checkpoint stats  
**Fix:**

```sql
-- Real PostgreSQL checkpoint statistics
SELECT
  checkpoints_timed,
  checkpoints_req,
  buffers_checkpoint,
  buffers_clean,
  buffers_backend,
  maxwritten_clean,
  ROUND(100.0 * buffers_checkpoint / NULLIF(buffers_checkpoint + buffers_clean + buffers_backend, 0), 1) AS pct_from_checkpoints
FROM pg_stat_bgwriter;
```

---

### 1.11 Page: 122-the-write-ahead-log.html
**Title:** The write-ahead log  
**Current simulation:** Creates `wal_log` table with fake WAL records  
**Issue:** SQLite has `PRAGMA wal_checkpoint`, `PRAGMA journal_mode`. No direct view into WAL contents, but users can check WAL status  
**Fix:** Replace with real WAL status queries:

```sql
-- Real WAL status in SQLite
PRAGMA journal_mode;
-- Check WAL checkpoint status
PRAGMA wal_checkpoint;
```

---

### 1.12 Page: 123-redo-and-undo.html
**Title:** Redo and undo  
**Current simulation:** Creates `wal` table with fake redo/undo records  
**Issue:** The recovery process itself is opaque; no real system view shows redo/undo logs  
**Fix:** Remove the widget. The ARES algorithm description in text is sufficient.

---

### 1.13 Page: 223-access-patterns-first.html
**Title:** Access patterns first  
**Current simulation:** Creates `orders` table and explains index usage  
**Issue:** No direct real replacement — the simulated data IS the lesson  
**Fix:** Keep as-is. The widget is a valid teaching tool.

---

### 1.14 Page: 224-picking-the-right-indexes.html
**Title:** Picking the right indexes  
**Current simulation:** Creates `orders` table and EXPLAIN queries  
**Issue:** EXPLAIN on real data IS real. PostgreSQL has `pg_stat_user_indexes`, `pg_stat_user_tables`  
**Fix:** Add a second widget with real index stats:

```sql
-- Real index usage stats (PostgreSQL)
SELECT 
  schemaname || '.' || indexrelname AS index_name,
  idx_scan AS times_used,
  idx_tup_read AS rows_returned,
  idx_tup_fetch AS rows_fetched,
  CASE WHEN idx_scan = 0 THEN 'UNUSED — consider dropping'
       ELSE 'used' 
  END AS recommendation
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```

---

### 1.15 Page: 235-schema-migrations-in-production.html
**Title:** Schema migrations in production  
**Current simulation:** Creates `pg_locks` simulation  
**Issue:** `pg_locks` IS a real PostgreSQL system view  
**Fix:** Replace with real query:

```sql
-- Real pg_locks for migration blocking checks
SELECT
  l.pid,
  l.locktype,
  l.mode,
  l.granted,
  a.query_start,
  a.query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted
ORDER BY a.query_start;
```

---

### 1.16 Page: 232-point-in-time-recovery.html
**Title:** Point-in-time recovery  
**Current simulation:** Creates fake WAL records  
**Issue:** No real system view for PITR — it's an operational procedure  
**Fix:** Remove the widget. Replace with a note about `pg_waldump` for inspecting WAL.

---

### 1.17 Page: 288-one-database-can-do-everything.html
**Title:** One database can do everything  
**Current simulation:** Creates workload analysis tables  
**Issue:** Generic teaching page, simulation is fine  
**Fix:** Keep as-is.

---

### 1.18 Page: 251-start-from-workload-not-fashion.html
**Title:** Start from workload, not fashion  
**Current simulation:** Creates orders/accounts simulation  
**Issue:** Generic teaching page  
**Fix:** Keep as-is.

---

### 1.19 Page: 295-what-to-build-for-practice.html
**Title:** What to build for practice  
**Current simulation:** Creates sample schema for a mini-database project  
**Issue:** This is a practice exercise — simulation is the point  
**Fix:** Keep as-is.

---

## Section 2: Pages to REMOVE Widget From

These pages simulate database internals where no real system view provides equivalent visibility. The widget adds no value that the text doesn't already provide.

| # | File | Title | Why Remove |
|---|------|-------|------------|
| 1 | 097-crash-recovery-overview.html | Crash recovery overview | Simulates WAL log entries; recovery is opaque by design |
| 2 | 121-what-can-go-wrong.html | What can go wrong | Simulates txn_log; no real system view for recovery analysis |
| 3 | 124-checkpoints-and-restart.html | Checkpoints and restart | Simulates WAL entries; PRAGMA wal_checkpoint is simpler |
| 4 | 128-recovering-unfinished-work.html | Recovering unfinished work | Simulates WAL recovery; no real equivalent |
| 5 | 129-why-recovery-shapes-design.html | Why recovery shapes design | Simulates pages/log tracking; concept is explained in text |
| 6 | 127-crash-safe-commits.html | Crash-safe commits | Simulates WAL log for crash safety demo |
| 7 | 145-failover-and-promotion.html | Failover and promotion | Simulates leader log; already identified above |
| 8 | 146-conflict-handling.html | Conflict handling | Simulates multi-writer conflicts; logical demo, not queryable |
| 9 | 147-multi-leader-systems.html | Multi-leader systems | Simulates write conflicts; no real system view |
| 10 | 148-replication-logs.html | Replication logs | Simulates replog; text explains the concept adequately |
| 11 | 149-operational-pitfalls.html | Operational pitfalls | Simulates schema mismatch; operational warning, not query |
| 12 | 161-strong-consistency.html | Strong consistency | Simulates quorum reads; conceptual demo |
| 13 | 162-eventual-consistency.html | Eventual consistency | Simulates replica divergence; conceptual demo |
| 14 | 163-read-your-writes.html | Read-your-writes | Simulates LSN routing; architectural concept |
| 15 | 164-monotonic-reads.html | Monotonic reads | Simulates LSN-based routing; conceptual demo |
| 16 | 167-latency-vs-correctness.html | Latency vs correctness | Simulates quorum configs; math, not queryable |
| 17 | 168-conflict-free-approaches.html | Conflict-free approaches | Simulates CRDT merge; conceptual demo |
| 18 | 159-cost-of-coordination.html | Cost of coordination | Simulates latency math; formula, not queryable |
| 19 | 114-locks-and-lock-modes.html | Locks and lock modes | Simulates lock_log; could use pg_locks but API is complex |
| 20 | 115-two-phase-locking.html | Two-phase locking | Simulates lock acquisition sequence |
| 21 | 116-deadlocks-and-detection.html | Deadlocks and detection | Simulates lock ordering |
| 22 | 117-multiversion-concurrency-control.html | MVCC | Simulates snapshot table; could reference pg_snapshots if available |
| 23 | 118-snapshot-isolation.html | Snapshot isolation | Simulates snapshots; conceptual demo |
| 24 | 119-choosing-isolation-levels.html | Choosing isolation levels | Simulates flight booking; teaching tool |
| 25 | 138-failure-becomes-normal.html | Failure becomes normal | Simulates heartbeats; conceptual demo |
| 26 | 139-new-tradeoffs-at-scale.html | New tradeoffs at scale | Simulates quorum config math |
| 27 | 143-read-replicas.html | Read replicas | Simulates primary/replica divergence; already partly fixed |
| 28 | 194-lsm-trees.html | LSM trees | Simulates LSM levels; conceptual demo |
| 29 | 195-compaction.html | Compaction | Simulates SST files; conceptual demo |
| 30 | 196-time-series-and-event-workloads.html | Time-series workloads | Simulates sensor readings; teaching tool |
| 31 | 201-nodes-edges-and-properties.html | Nodes, edges, and properties | Simulates graph model; teaching tool — keep as-is, not remove |
| 32 | 206-performance-characteristics.html | Performance characteristics | Simulates graph traversal; conceptual demo |

---

## Section 3: Pages to KEEP (Simulation is Correct)

These ~195 pages teach SQL fundamentals (SELECT, WHERE, JOIN, GROUP BY, subqueries, CTEs, transactions, etc.) where simulated data is the only practical approach. Examples: `002-`, `003-`, `004-`, `012-` through `026-`, `031-` through `051-`, `054-`, `057-` through `093-` (with noted exceptions above), `171-` through `179-`, `181-` through `229-`.

These pages do NOT need changes — the simulation IS the value.

---

## Priority Action Items

1. **High priority** (real system view exists, simulation is misleading):
   - `152-two-phase-commit.html` → replace with `pg_prepared_xacts`
   - `141-leader-follower-replication.html` → replace with `pg_stat_replication`
   - `142-synchronous-vs-asynchronous-replication.html` → replace with `pg_stat_replication`
   - `094-checkpoints.html` → replace with `pg_stat_bgwriter`
   - `095-buffer-pools.html` → ✅ **DONE** — replaced with `pg_statio_user_tables`
   - `235-schema-migrations-in-production.html` → replace with real `pg_locks`

2. **Medium priority** (real PRAGMAs exist, simulation is clutter):
   - `082-heap-files-and-page-layouts.html` → use real PRAGMAs only
   - `086-free-space-management.html` → use real PRAGMAs only
   - `098-space-amplification.html` → use real PRAGMAs only

3. **Low priority** (remove widget entirely, text is sufficient):
   - 30 pages in Section 2 above
