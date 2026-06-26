When a database crashes mid-transaction, it needs a way to recover cleanly: committed work must survive, and uncommitted work must vanish. The write-ahead log (WAL) you saw in the previous section records every change — but replaying the *entire* log from the beginning on every restart would be unbearably slow. **Checkpoints** are the mechanism that bounds how far back recovery must reach.

## What a Checkpoint Does

A checkpoint is a deliberate synchronization point at which the database guarantees that all dirty (modified) buffer pages have been flushed to disk and that the WAL up to that point is no longer needed for crash recovery.

The sequence looks like this:

1. The engine writes a `BEGIN CHECKPOINT` record into the WAL.
2. It flushes all modified data pages from the buffer pool to their on-disk home (the data files).
3. It writes an `END CHECKPOINT` record that names the *checkpoint LSN* (Log Sequence Number) — the WAL position as of the checkpoint.
4. Anything in the WAL **before** that LSN is now redundant for crash recovery and can eventually be truncated or recycled.

<figure class="diagram">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing WAL segments, a checkpoint, and how recovery only replays from the checkpoint forward">
  <!-- WAL bar -->
  <rect x="30" y="80" width="580" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <!-- WAL label -->
  <text x="30" y="72" font-size="13" fill="var(--text)" font-family="sans-serif" font-weight="600">WAL (log file)</text>

  <!-- Old segments — greyed out -->
  <rect x="30" y="80" width="220" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5" opacity="0.5"/>
  <text x="130" y="101" font-size="12" fill="var(--text)" font-family="sans-serif" text-anchor="middle" opacity="0.5">older log records</text>

  <!-- Checkpoint marker -->
  <line x1="250" y1="60" x2="250" y2="130" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5,3"/>
  <text x="250" y="55" font-size="12" fill="var(--accent)" font-family="sans-serif" text-anchor="middle" font-weight="700">CHECKPOINT</text>
  <text x="250" y="148" font-size="11" fill="var(--accent)" font-family="sans-serif" text-anchor="middle">(LSN = 5000)</text>

  <!-- New segments — active -->
  <rect x="250" y="80" width="360" height="30" rx="4" fill="var(--accent)" opacity="0.18" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="430" y="101" font-size="12" fill="var(--text)" font-family="sans-serif" text-anchor="middle">new log records (replay on crash)</text>

  <!-- Crash marker -->
  <line x1="580" y1="60" x2="580" y2="130" stroke="#e05c5c" stroke-width="2" stroke-dasharray="4,3"/>
  <text x="580" y="55" font-size="12" fill="#e05c5c" font-family="sans-serif" text-anchor="middle" font-weight="700">CRASH</text>

  <!-- Arrow under new segment -->
  <line x1="252" y1="170" x2="578" y2="170" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <text x="415" y="188" font-size="12" fill="var(--text)" font-family="sans-serif" text-anchor="middle">recovery replays only this portion</text>

  <!-- Truncation label -->
  <text x="130" y="170" font-size="11" fill="var(--text)" font-family="sans-serif" text-anchor="middle" opacity="0.55">can be truncated / recycled</text>
</svg>
<figcaption>After a checkpoint at LSN 5000, crash recovery only needs to replay the portion of the WAL that follows it.</figcaption>
</figure>

> **Note:** A checkpoint does not mean transactions are paused. Most modern databases (PostgreSQL, MySQL InnoDB, SQLite WAL mode) perform *fuzzy checkpoints* — pages are flushed incrementally in the background while normal reads and writes continue.

## Restart and the ARIES Protocol

When the database restarts after a crash, it runs a structured recovery algorithm. The one used by most systems (directly or in spirit) is **ARIES** (Algorithm for Recovery and Isolation Exploiting Semantics).

Recovery happens in three passes:

| Pass | Name | What it does |
|---|---|---|
| 1 | **Analysis** | Scans the WAL from the last checkpoint forward. Identifies which transactions were in-flight at the time of the crash, and which pages were dirty. |
| 2 | **Redo** | Replays *every* log record from the checkpoint, re-applying all changes — even those from transactions that never committed. This brings the database to the exact state it was in the moment of the crash. |
| 3 | **Undo** | Rolls back any transaction that was still active (uncommitted) at crash time, walking the log backwards using *compensation log records* (CLRs). |

The Redo pass might seem surprising — why redo uncommitted work, only to undo it? Because ARIES decouples the question "did this change reach disk?" from "did the transaction commit?". Redoing everything first is simpler and correct; the Undo pass then enforces atomicity cleanly.

### Checkpoint frequency vs. recovery time

There is a direct trade-off:

- **More frequent checkpoints** → shorter WAL segment to replay → **faster restart**, but more continuous I/O during normal operation.
- **Less frequent checkpoints** → less ongoing I/O, but **longer restart** if a crash occurs.

Database administrators (and configuration files) expose a knob for this. In PostgreSQL the relevant settings are `checkpoint_timeout` and `max_wal_size`; in SQLite WAL mode the checkpoint is triggered after a configurable number of WAL frames.

## Seeing It in the WAL

Real WAL records are binary, but we can simulate their logical content in a table. The widget below models a tiny transaction log. Run the query to identify which transactions would be **redone** and which would be **undone** given a crash after the last record — exactly what the ARIES analysis pass determines.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Simulated WAL analysis</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE wal_log (lsn INTEGER PRIMARY KEY, type TEXT NOT NULL, txn_id INTEGER NOT NULL, page TEXT, description TEXT); INSERT INTO wal_log VALUES (4990,'CHECKPOINT',0,NULL,'Checkpoint — all pages flushed'); INSERT INTO wal_log VALUES (5001,'BEGIN',101,NULL,'Transaction 101 starts'); INSERT INTO wal_log VALUES (5010,'UPDATE',101,'accounts:42','Debit $200 from account 42'); INSERT INTO wal_log VALUES (5020,'BEGIN',102,NULL,'Transaction 102 starts'); INSERT INTO wal_log VALUES (5030,'UPDATE',102,'accounts:17','Credit $50 to account 17'); INSERT INTO wal_log VALUES (5040,'COMMIT',102,NULL,'Transaction 102 commits'); INSERT INTO wal_log VALUES (5050,'UPDATE',101,'accounts:99','Credit $200 to account 99'); -- CRASH here — txn 101 never committed">SELECT
  txn_id,
  CASE
    WHEN txn_id IN (SELECT txn_id FROM wal_log WHERE type = 'COMMIT') THEN 'REDO then keep'
    ELSE 'REDO then UNDO'
  END AS recovery_action,
  GROUP_CONCAT(type || ' (' || lsn || ')', ' → ') AS log_entries
FROM wal_log
WHERE type != 'CHECKPOINT'
GROUP BY txn_id
ORDER BY txn_id;</textarea>
  </div>
</div>

Try adding another `INSERT INTO wal_log VALUES (5060,'COMMIT',101,NULL,'Transaction 101 commits');` inside the textarea before the `SELECT`, then re-run — watch transaction 101's recovery action change from `REDO then UNDO` to `REDO then keep`.

## Key Takeaways

- A **checkpoint** flushes dirty pages and records the WAL position so recovery never needs to go further back.
- **Crash recovery** replays the WAL from the last checkpoint (Redo), then rolls back any uncommitted transactions (Undo).
- The **ARIES** three-pass protocol (Analysis → Redo → Undo) is the standard model behind most production databases.
- Checkpoint frequency is a tunable trade-off between steady-state I/O cost and restart time.
