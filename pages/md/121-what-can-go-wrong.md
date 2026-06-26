Databases are expected to survive almost anything: power cuts mid-write, application bugs, hardware failures, even operating system crashes. The field of **recovery** is the set of techniques that make that survival guarantee real. Before diving into the mechanisms, it pays to be precise about *what* exactly can go wrong — because the failure types are distinct, and each demands a different cure.

## The Three Categories of Failure

Database researchers typically group failures into three buckets.

| Category | Cause | What survives |
|---|---|---|
| **Transaction failure** | Logic error, constraint violation, explicit rollback, timeout | Disk is fine; other transactions unaffected |
| **System failure** | OS crash, power loss, hardware reset | Disk contents survive; in-memory state is lost |
| **Media failure** | Disk head crash, bit rot, storage controller fault | The storage medium itself is damaged or destroyed |

These are not equally likely. Transaction failures happen constantly — any `ROLLBACK` is one. System failures are rare but certain to occur eventually. Media failures are rarer still, but catastrophic when they do.

## Transaction Failures: The Everyday Case

A transaction fails when the engine cannot (or should not) complete it. Common reasons:

- **Constraint violation** — an `INSERT` would break a `UNIQUE` or `FOREIGN KEY` rule.
- **Deadlock victim** — the engine chose this transaction to break a cycle (covered in Chapter 12).
- **Application rollback** — the application explicitly issues `ROLLBACK` because of business logic.
- **Timeout** — a lock wait exceeded the configured limit.

When a transaction fails, the database must **undo** any partial changes it already made. Because those changes live in memory (the buffer pool) and possibly on disk, the engine needs a way to reverse them precisely. This is the *undo* problem, and it is entirely solvable — the engine keeps enough information to reverse every write a transaction made.

> **Note:** A transaction failure never threatens data that other committed transactions wrote. The scope is limited to this one in-flight transaction.

## System Failures: The Hard Problem

A system failure — a power cut, kernel panic, or machine reboot — kills the process instantly. Everything in RAM disappears: the buffer pool, lock tables, transaction state. What remains is whatever was written to disk *before* the crash.

The danger is **partial writes**. A transaction that committed just before the crash may have only partially flushed its dirty pages to disk. A transaction that was mid-flight simply vanishes. After restart, the database is in an unknown state:

- Some committed transactions may have writes missing from disk (**redo** needed).
- Some in-flight transactions may have partial writes on disk (**undo** needed).

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing three transactions before a crash: one fully committed and flushed, one committed but not fully flushed, one still in-flight — and what recovery must do to each">

  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Time axis -->
  <line x1="40" y1="240" x2="600" y2="240" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="610" y="244" font-size="12" fill="var(--text)">time</text>
  <text x="40" y="258" font-size="11" fill="var(--text)">start</text>

  <!-- Crash marker -->
  <line x1="480" y1="20" x2="480" y2="245" stroke="#e05" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="484" y="18" font-size="12" font-weight="bold" fill="#e05">CRASH</text>

  <!-- Txn A: committed + fully flushed before crash -->
  <rect x="60" y="40" width="200" height="32" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="70" y="61" font-size="12" font-weight="bold" fill="var(--text)">Txn A</text>
  <rect x="262" y="44" width="60" height="24" rx="4" fill="var(--accent)" opacity="0.85"/>
  <text x="292" y="60" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">COMMIT</text>
  <!-- flush indicator -->
  <text x="340" y="61" font-size="11" fill="var(--text)">flushed ✓</text>
  <text x="520" y="61" font-size="11" fill="var(--accent)" font-weight="bold">no action needed</text>

  <!-- Txn B: committed but NOT fully flushed -->
  <rect x="100" y="100" width="240" height="32" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="110" y="121" font-size="12" font-weight="bold" fill="var(--text)">Txn B</text>
  <rect x="342" y="104" width="60" height="24" rx="4" fill="var(--accent)" opacity="0.85"/>
  <text x="372" y="120" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">COMMIT</text>
  <!-- some pages not flushed -->
  <text x="412" y="120" font-size="11" fill="var(--text)">partial flush</text>
  <text x="520" y="121" font-size="11" fill="#c80" font-weight="bold">REDO needed</text>

  <!-- Txn C: in-flight at crash -->
  <rect x="160" y="160" width="300" height="32" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="170" y="181" font-size="12" font-weight="bold" fill="var(--text)">Txn C</text>
  <text x="280" y="181" font-size="11" fill="var(--text)">(in-flight — no commit)</text>
  <!-- arrow cut off at crash -->
  <line x1="460" y1="176" x2="478" y2="176" stroke="#e05" stroke-width="2"/>
  <text x="520" y="181" font-size="11" fill="#e05" font-weight="bold">UNDO needed</text>

  <!-- Legend -->
  <rect x="40" y="260" width="560" height="16" rx="0" fill="none"/>
  <text x="40" y="272" font-size="11" fill="var(--text)">After restart: Txn B writes must be replayed (redo); Txn C partial writes must be reversed (undo).</text>
</svg>
<figcaption>Three transactions at the moment of a system crash, and the recovery action each requires.</figcaption>
</figure>

This is why **Write-Ahead Logging (WAL)** — covered in the next topic — exists. The log gives the engine a faithful record of every change, so it can reconstruct the correct state after any crash.

## Media Failures: The Catastrophic Case

A disk failure destroys the data itself. No amount of log replay can recover data from a drive that no longer works. The only defense is **redundancy**: replication, RAID, or regular backups stored somewhere else. Recovery here means restoring from a backup and then replaying any log entries recorded after that backup was taken.

> **Note:** Modern cloud databases sidestep most media failures by replicating data across multiple availability zones automatically. But the underlying principle is the same: have a known-good copy, and have a log to bring it forward.

## Putting It Together

Try this widget to see how the database distinguishes in-flight from committed transactions. The `status` column plays the role of the commit record in a real log.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Crash scenario simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE txn_log (txn_id INTEGER, action TEXT, committed INTEGER);
INSERT INTO txn_log VALUES (1, 'UPDATE accounts SET balance = 900 WHERE id = 1', 1);
INSERT INTO txn_log VALUES (1, 'UPDATE accounts SET balance = 1100 WHERE id = 2', 1);
INSERT INTO txn_log VALUES (2, 'UPDATE accounts SET balance = 500 WHERE id = 3', 1);
INSERT INTO txn_log VALUES (3, 'UPDATE accounts SET balance = 200 WHERE id = 1', 0);
INSERT INTO txn_log VALUES (3, 'UPDATE accounts SET balance = 750 WHERE id = 4', 0);">-- After a crash, recovery scans the log.
-- Rows where committed=1 need to be redone (replayed).
-- Rows where committed=0 belong to in-flight txns and must be undone (ignored or reversed).

SELECT
  txn_id,
  action,
  CASE committed
    WHEN 1 THEN 'REDO — replay this change'
    ELSE        'UNDO — reverse this change'
  END AS recovery_action
FROM txn_log
ORDER BY txn_id, rowid;</textarea>
  </div>
</div>

The output makes the split clear: every entry for committed transactions must be replayed; every entry for the uncommitted transaction (txn 3) must be rolled back. Real recovery algorithms — ARIES being the most influential — do exactly this, but with far more bookkeeping to handle checkpoints, page boundaries, and concurrent transactions efficiently.
