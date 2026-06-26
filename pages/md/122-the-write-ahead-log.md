Imagine the power goes out the instant after a user's `COMMIT` returns. Did the transaction survive? Without a careful design, the answer is "maybe" — and "maybe" is not good enough. The **write-ahead log (WAL)** is the mechanism that turns "maybe" into "yes, always." It is the foundation of durability in virtually every production database engine.

## What the Problem Is

A database stores its permanent data in **pages** (typically 8 KB blocks) on disk. Updating a row means modifying one or more of those pages. But pages travel through an in-memory **buffer pool** before they are written back to disk (see Chapter 12). At any moment, the buffer pool holds "dirty" pages — pages whose in-memory content is newer than what is on disk.

A crash at the wrong instant can leave pages in a half-written, internally inconsistent state. Worse, even a fully written page may reflect only *part* of a multi-page transaction. The database needs a way to guarantee that either all changes from a committed transaction are on disk, or none of them are.

Writing every dirty page to disk synchronously on each commit would be correct, but disastrously slow — a single transaction can touch dozens of scattered pages.

## The Write-Ahead Rule

WAL solves this with one simple invariant:

> **Before any page is written to disk, the log record describing that change must already be on disk.**

The log is a sequential append-only file. Writing to it is fast because sequential I/O is far cheaper than random I/O across scattered data pages. On commit, the database **flushes only the log** — the dirty data pages can follow later, in the background, in any order convenient for the I/O scheduler. This is called a **log-force-at-commit**.

Because the log is written first ("write ahead"), recovery can always reconstruct what happened, even if the data pages never made it to disk before a crash.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing WAL log records flushed to disk at commit before dirty data pages are written in the background">

  <!-- Timeline axis -->
  <line x1="30" y1="60" x2="610" y2="60" stroke="var(--border)" stroke-width="1.5"/>
  <text x="30" y="50" font-size="12" fill="var(--text)" font-weight="bold">Time →</text>

  <!-- Phase 1: Transaction modifies rows in buffer pool -->
  <rect x="30" y="75" width="150" height="54" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="105" y="98" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">1. Modify rows</text>
  <text x="105" y="114" text-anchor="middle" font-size="11" fill="var(--text)">in buffer pool</text>
  <text x="105" y="128" text-anchor="middle" font-size="11" fill="var(--text)">(pages dirty, log in RAM)</text>

  <!-- Arrow -->
  <line x1="180" y1="102" x2="210" y2="102" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arrowWAL)"/>

  <!-- Phase 2: Log flush at COMMIT -->
  <rect x="210" y="75" width="150" height="54" rx="5" fill="var(--accent)" opacity="0.18" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="285" y="98" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--accent)">2. COMMIT</text>
  <text x="285" y="114" text-anchor="middle" font-size="11" fill="var(--text)">flush log records</text>
  <text x="285" y="128" text-anchor="middle" font-size="11" fill="var(--text)">to disk (fsync)</text>

  <!-- Arrow -->
  <line x1="360" y1="102" x2="390" y2="102" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arrowWAL)"/>

  <!-- Phase 3: Lazy page writes -->
  <rect x="390" y="75" width="210" height="54" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="495" y="98" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">3. Dirty pages written</text>
  <text x="495" y="114" text-anchor="middle" font-size="11" fill="var(--text)">later, in background</text>
  <text x="495" y="128" text-anchor="middle" font-size="11" fill="var(--text)">(any order, batched)</text>

  <!-- "Client gets OK" label -->
  <line x1="285" y1="129" x2="285" y2="160" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3"/>
  <rect x="200" y="160" width="170" height="28" rx="4" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1"/>
  <text x="285" y="179" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">Client receives COMMIT OK</text>

  <!-- Crash zone illustration -->
  <rect x="30" y="210" width="580" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="46" y="232" font-size="12" font-weight="bold" fill="var(--text)">If a crash happens after step 2 (log on disk, pages not yet written):</text>
  <text x="46" y="252" font-size="12" fill="var(--text)">→ Recovery reads the log and REDOES all committed changes. Durability preserved.</text>
  <text x="46" y="272" font-size="12" fill="var(--text)">→ Uncommitted changes are UNDONE (rolled back) using undo info in the log.</text>

  <defs>
    <marker id="arrowWAL" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>
</svg>
<figcaption>WAL timeline: only the log must reach disk at commit time. Dirty data pages follow lazily in the background.</figcaption>
</figure>

## Anatomy of a Log Record

Each WAL record captures enough information to both **redo** and **undo** the change it describes:

| Field | Purpose |
|---|---|
| Log Sequence Number (LSN) | Unique, monotonically increasing ID for ordering records |
| Transaction ID | Which transaction wrote this record |
| Page ID | Which data page was modified |
| Before image | Old value — used to **undo** if the transaction aborts |
| After image | New value — used to **redo** if a crash interrupted the write |
| Record type | `BEGIN`, `UPDATE`, `COMMIT`, `ABORT`, `CHECKPOINT`, … |

The **LSN** is central to everything. Each data page stores the LSN of the most recent log record that modified it. During recovery, the engine compares page LSNs against log LSNs to decide which records still need to be replayed.

## Recovery: ARIES in a Nutshell

Most modern databases (PostgreSQL, SQL Server, DB2, MySQL InnoDB) use a recovery algorithm descended from **ARIES** (Algorithm for Recovery and Isolation Exploiting Semantics). Recovery runs in three passes:

1. **Analysis** — Scan the log forward from the last checkpoint. Reconstruct which transactions were active at the crash and which pages were dirty.
2. **Redo** — Replay every logged operation in LSN order, exactly as it happened. This restores the buffer pool to its crash-time state — including uncommitted changes.
3. **Undo** — Roll back any transactions that were active (uncommitted) at crash time, using the before images stored in the log.

After undo, the database is in a clean, consistent state and can reopen for business.

> **Note:** Checkpoints bound how far back recovery needs to scan. Periodically, the engine writes a checkpoint record to the log and flushes all dirty pages up to that point. On restart, recovery only needs to start from the last checkpoint — not the beginning of all time.

## WAL in SQLite

SQLite exposes WAL mode as a user-visible option. In the default journal mode (`DELETE`), SQLite writes a *rollback journal* (the old page content) before modifying the database file. In `WAL` mode it instead appends changes to a separate `-wal` file; readers can still access the original database file concurrently.

Try the widget below to see WAL mode in action. After enabling WAL, commits return faster because only the WAL file needs to be synced — the main database file is updated lazily during a checkpoint.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · WAL log structure simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE wal_log (lsn INTEGER PRIMARY KEY, txn_id INTEGER, page_id INTEGER, record_type TEXT, before_val TEXT, after_val TEXT); INSERT INTO wal_log VALUES (1001, 42, 7, 'BEGIN',   NULL,     NULL); INSERT INTO wal_log VALUES (1002, 42, 7, 'UPDATE',  '1000',   '1500'); INSERT INTO wal_log VALUES (1003, 42, 7, 'UPDATE',  '2500',   '2000'); INSERT INTO wal_log VALUES (1004, 42, 7, 'COMMIT',  NULL,     NULL); INSERT INTO wal_log VALUES (1005, 55, 3, 'BEGIN',   NULL,     NULL); INSERT INTO wal_log VALUES (1006, 55, 3, 'UPDATE',  'Alice',  'Alicia'); INSERT INTO wal_log VALUES (1007, 99, 5, 'BEGIN',   NULL,     NULL); INSERT INTO wal_log VALUES (1008, 99, 5, 'UPDATE',  '999',    '0');">-- Browse the simulated WAL log
SELECT lsn, txn_id, page_id, record_type, before_val, after_val
FROM wal_log
ORDER BY lsn;
</textarea>
  </div>
</div>

Try modifying the query to answer these questions: Which transaction IDs have a matching `COMMIT` record? Which ones were still active at "crash time" and would need to be undone during recovery? (Hint: a `COMMIT` or `ABORT` record closes a transaction.)

<details class="reveal"><summary>Reveal: Which transactions would REDO and which would UNDO on recovery?</summary><div class="reveal-body">

- **Txn 42** has a `COMMIT` at LSN 1004 — recovery would **redo** its changes (LSNs 1002–1003) to ensure durability.
- **Txn 55** and **Txn 99** have no `COMMIT` or `ABORT` record — they were in-flight at crash time. Recovery would **undo** their changes (LSNs 1006 and 1008) using the before-image values, rolling them back to preserve atomicity.

</div></details>
