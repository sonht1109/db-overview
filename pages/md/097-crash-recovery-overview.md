When a database crashes — power cut, OS panic, process killed — it must restart and end up in a **consistent state**. That means committed transactions are fully visible, and any transaction that never finished is completely gone. Getting this right is called **crash recovery**, and it is one of the most carefully engineered parts of any serious database engine.

## The Problem: Writes Are Not Atomic by Default

A single `INSERT` or `UPDATE` may touch multiple disk pages: the row itself, one or more index entries, maybe a free-space map. Those writes land at different times. If power fails in the middle, the database wakes up with half-finished work spread across the disk.

Consider a bank transfer:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

If the engine crashes after the first `UPDATE` but before `COMMIT`, account 1 has lost $100 and account 2 has gained nothing. Crash recovery must undo that partial write.

> **Note:** Even a `COMMIT` acknowledgment can arrive while some dirty pages are still in the OS buffer cache, not yet on disk. Recovery must handle *that* too.

## The Write-Ahead Log (WAL)

The standard solution is the **write-ahead log** (WAL). Before any page is modified on disk, a description of that change is appended to a sequential log file. "Write-ahead" means the log entry is flushed to durable storage *before* the corresponding data page is written.

The log contains records like:

| LSN | Transaction | Operation | Table | Old value | New value |
|-----|-------------|-----------|-------|-----------|-----------|
| 101 | T42 | UPDATE | accounts | balance=500 | balance=400 |
| 102 | T42 | UPDATE | accounts | balance=300 | balance=400 |
| 103 | T42 | COMMIT | — | — | — |
| 104 | T55 | INSERT | orders | — | (row data) |

**LSN** (Log Sequence Number) is a monotonically increasing ID that orders every log record. Two recovery rules follow directly from this structure:

- **REDO**: If a committed transaction's changes did not make it to the data pages before the crash, replay those log records to put them back.
- **UNDO**: If an uncommitted transaction left partial changes on the data pages, reverse its log records to erase the partial work.

### Checkpoints

Replaying the entire log on every restart would be too slow. Engines periodically write a **checkpoint** — a log record that says "at this point, all changes up to LSN X are safely on disk." Recovery only needs to process records *after* the last checkpoint, keeping restart time bounded regardless of how long the database has been running.

## ARIES: The Algorithm Behind the Practice

Most production databases (PostgreSQL, SQL Server, DB2, and many others) implement a recovery protocol called **ARIES** (Algorithm for Recovery and Isolation Exploiting Semantics), developed at IBM in the 1990s. ARIES has three phases:

1. **Analysis** — scan the log forward from the last checkpoint to figure out which transactions were active at crash time and which pages were dirty (modified but not flushed).
2. **REDO** — replay the log forward from the earliest relevant LSN, reapplying every update, even for transactions that will later be rolled back. This restores the database to its exact state at the moment of the crash.
3. **UNDO** — walk the log backward and undo the changes of every transaction that never committed.

The counter-intuitive step is REDO-before-UNDO: ARIES first reconstructs the crash state (including uncommitted garbage), then cleanly removes it. This approach handles edge cases such as transactions that were in the middle of rolling back when the crash occurred.

> **Note:** SQLite uses a simpler journal-based mechanism (rollback journal or WAL mode) that achieves the same safety guarantees with less complexity, trading some throughput for simplicity. The core ideas — log before you write, track what committed, redo then undo — are the same.

## Try It: Simulating a Transaction Log

The widget below models a tiny transaction log table. The query identifies which transactions committed and which were left incomplete — exactly what the Analysis phase of ARIES does. Try adding a `COMMIT` row for `T55` and re-run to see it change status.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Transaction log analysis</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE wal_log (lsn INTEGER PRIMARY KEY, txn_id TEXT NOT NULL, op TEXT NOT NULL, detail TEXT); INSERT INTO wal_log VALUES (101,'T42','UPDATE','accounts: balance 500->400'); INSERT INTO wal_log VALUES (102,'T42','UPDATE','accounts: balance 300->400'); INSERT INTO wal_log VALUES (103,'T42','COMMIT',''); INSERT INTO wal_log VALUES (104,'T55','INSERT','orders: row 9'); INSERT INTO wal_log VALUES (105,'T55','UPDATE','inventory: qty 10->9');">-- Which transactions committed, and which need to be rolled back?
SELECT
  txn_id,
  CASE WHEN MAX(op) = 'COMMIT' THEN 'committed'
       ELSE 'incomplete -- must UNDO'
  END AS status,
  COUNT(*) AS log_records
FROM wal_log
GROUP BY txn_id
ORDER BY txn_id;</textarea>
  </div>
</div>

## Key Takeaways

| Concept | What it does |
|---------|-------------|
| Write-ahead log (WAL) | Records every change before touching data pages; enables both redo and undo |
| LSN | Orders log records so recovery knows what happened and in what sequence |
| Checkpoint | Limits how far back recovery must scan; keeps restart time practical |
| REDO phase | Replays the log to reconstruct the exact state at crash time |
| UNDO phase | Reverses every uncommitted transaction's changes to restore consistency |

Crash recovery is what lets a database make the "durable" and "atomic" promises in ACID. The WAL is the mechanism; ARIES (or a similar protocol) is the algorithm that uses it correctly even when the crash happens at the worst possible moment.
