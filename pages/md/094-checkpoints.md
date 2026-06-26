Every write-ahead log (WAL) tells the story of what changed — but that story keeps growing. On crash recovery, the engine must replay log entries to reconstruct a consistent state. A **checkpoint** is how the engine periodically says *"everything before this point is already on disk; start replay here."* Without checkpoints, recovery time grows unbounded and logs never shrink.

## The Problem Checkpoints Solve

Before any page is modified in the buffer pool, the engine writes a log record describing the change. On crash, it replays those records to reconstruct a consistent state. But the buffer pool holds many **dirty pages** — modified in RAM but not yet flushed to the data files. As that gap grows, so does recovery time.

A checkpoint compresses the gap by **forcing dirty pages to disk**, then writing a checkpoint record into the log that notes the LSN (Log Sequence Number) at that moment. After a crash, the engine scans the log only from the most recent checkpoint forward.

```
WAL (append-only)
─────────────────────────────────────────────────────────►
   LSN 1000       LSN 4200              LSN 6800
     │               │                     │
  [CKPT]          [CKPT]               crash here
     ↑               ↑
  pages flushed   pages flushed
  up to LSN 1000  up to LSN 4200

  Recovery replays only: LSN 4200 → LSN 6800
```

Without the checkpoint at LSN 4200, recovery would have to replay from LSN 1000 — or earlier.

## What Happens During a Checkpoint

A checkpoint is not instantaneous. In most engines it proceeds in phases:

| Phase | What happens |
|---|---|
| **Begin** | Record the checkpoint-start LSN; capture the list of active transactions |
| **Flush dirty pages** | Write modified buffer-pool pages to the data files on disk |
| **Write checkpoint record** | Append a checkpoint-end record to the WAL containing the begin LSN and active-transaction list |
| **Truncate old log (optional)** | Log segments older than the checkpoint start LSN can be archived or deleted |

The checkpoint record is the recovery's anchor. It tells the engine: "any transaction that committed before my begin LSN is already reflected in the data files."

> **Note:** During a *fuzzy* (or *online*) checkpoint — the mode used by PostgreSQL and most modern engines — dirty pages are flushed gradually in the background without blocking ongoing writes. The engine tolerates some newly-dirtied pages appearing during the flush; the active-transaction list captured at checkpoint-begin handles them during recovery.

## Checkpoint Frequency: The Trade-off

How often should the engine checkpoint?

| Checkpoint interval | Recovery time | Write amplification |
|---|---|---|
| Very frequent | Short (little replay needed) | High (more flushes, more I/O) |
| Infrequent | Long (more log to replay) | Low (pages batched efficiently) |

Most engines let you tune this. PostgreSQL exposes `checkpoint_completion_target` (how long to spread the flush over) and `max_wal_size` (triggers a checkpoint when the WAL reaches this size). SQLite checkpoints its WAL when it hits 1,000 pages by default, and also exposes a manual `PRAGMA wal_checkpoint`.

The right setting depends on your workload. OLTP systems with many small writes benefit from frequent checkpoints to keep recovery fast. Bulk-load jobs often disable or defer checkpoints temporarily for throughput, then checkpoint once at the end.

## Observing Checkpoint State

The widget below simulates what a checkpoint must track: which buffer-pool pages are dirty (must be flushed) versus already clean. It also shows a checkpoint history log. Try modifying the queries to explore both tables.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Checkpoint state simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE buffer_pool (page_id INTEGER PRIMARY KEY, table_name TEXT, last_lsn INTEGER, status TEXT); INSERT INTO buffer_pool VALUES (101, 'orders', 4310, 'dirty'); INSERT INTO buffer_pool VALUES (102, 'orders', 4285, 'clean'); INSERT INTO buffer_pool VALUES (103, 'customers', 4400, 'dirty'); INSERT INTO buffer_pool VALUES (104, 'customers', 4100, 'clean'); INSERT INTO buffer_pool VALUES (105, 'products', 4390, 'dirty'); INSERT INTO buffer_pool VALUES (106, 'products', 4050, 'clean'); CREATE TABLE checkpoint_log (ckpt_id INTEGER PRIMARY KEY, begin_lsn INTEGER, end_lsn INTEGER, pages_flushed INTEGER, started_at TEXT); INSERT INTO checkpoint_log VALUES (1, 3000, 3980, 8, '2024-01-15 10:00:00'); INSERT INTO checkpoint_log VALUES (2, 3980, 4280, 11, '2024-01-15 10:05:00');">-- Which pages must be flushed in the next checkpoint?
SELECT
  page_id,
  table_name,
  last_lsn,
  status
FROM buffer_pool
WHERE status = 'dirty'
ORDER BY last_lsn;

-- Try: change 'dirty' to 'clean' to see already-flushed pages.
-- Try: SELECT COUNT(*), status FROM buffer_pool GROUP BY status;
-- Try: SELECT * FROM checkpoint_log ORDER BY ckpt_id;</textarea>
  </div>
</div>

## Key Takeaways

- A checkpoint flushes dirty pages and plants a WAL anchor — crash recovery replays only from that point forward.
- Modern engines use *fuzzy checkpoints* to flush pages gradually in the background without stalling writes.
- Checkpoint frequency trades recovery speed against write I/O: checkpoint more often for fast recovery, less often for higher throughput.
- In SQLite WAL mode, `PRAGMA wal_checkpoint` exposes the mechanism directly — a good starting point before diving into PostgreSQL's `max_wal_size` or InnoDB's `innodb_io_capacity` tuning.
