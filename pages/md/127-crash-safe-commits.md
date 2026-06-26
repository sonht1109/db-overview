Every time you call `COMMIT`, you are making a promise: that transaction's changes will survive forever — even if the power dies one millisecond later. Keeping that promise without bringing the database to a grinding halt is the central challenge of crash-safe commits.

## Why durability is hard

A modern computer has several layers between a `COMMIT` statement and a bit flipped on stable storage:

1. **CPU registers / caches** — gone on power loss
2. **OS page cache** (kernel buffer) — gone on power loss unless flushed
3. **Disk write cache** — gone on power loss unless the drive respects `fsync`
4. **Non-volatile storage** — survives

Simply writing to a file is not enough. The OS may batch those writes in its page cache for seconds before they reach the disk. A crash in that window means silent data loss.

The standard solution is the **Write-Ahead Log (WAL)**.

## The Write-Ahead Log

The WAL rule is simple: **log the change before you apply it to the data pages**.

Every modification is first appended to a sequential log file as a *log record*. Log records are small, sequential, and fast to write. Before `COMMIT` returns to the application, the engine calls `fsync` (or an equivalent) on the log — forcing those bytes to durable storage. Only then does the commit succeed.

```sql
-- What happens inside the engine on every change (pseudocode):
-- 1. Write log record {txn_id, page, before-image, after-image} → WAL
-- 2. fsync(WAL)       ← durable now
-- 3. COMMIT returns   ← the promise is made
-- 4. Dirty data pages may be written to disk later (background)
```

The data pages themselves are written lazily in the background by a *checkpoint* process. If the system crashes before a checkpoint, those pages are out of date — but the WAL contains everything needed to replay and redo the missing writes.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing WAL write, fsync, COMMIT, then lazy data-page flush">
  <!-- Timeline axis -->
  <line x1="40" y1="200" x2="600" y2="200" stroke="var(--border)" stroke-width="2"/>
  <polygon points="600,196 612,200 600,204" fill="var(--border)"/>
  <text x="618" y="204" font-size="13" fill="var(--text)">time</text>

  <!-- Phase markers on axis -->
  <line x1="120" y1="195" x2="120" y2="205" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="240" y1="195" x2="240" y2="205" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="360" y1="195" x2="360" y2="205" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="500" y1="195" x2="500" y2="205" stroke="var(--border)" stroke-width="1.5"/>

  <!-- WAL write arrow -->
  <line x1="40" y1="140" x2="120" y2="140" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4,3"/>
  <polygon points="120,136 132,140 120,144" fill="var(--accent)"/>
  <text x="55" y="130" font-size="13" fill="var(--text)">Write log record</text>
  <text x="55" y="144" font-size="11" fill="var(--text)" opacity="0.7">(in memory)</text>

  <!-- fsync arrow -->
  <line x1="120" y1="140" x2="240" y2="140" stroke="var(--accent)" stroke-width="2.5"/>
  <polygon points="240,136 252,140 240,144" fill="var(--accent)"/>
  <text x="140" y="130" font-size="13" fill="var(--text)">fsync(WAL)</text>
  <text x="140" y="144" font-size="11" fill="var(--text)" opacity="0.7">→ durable</text>

  <!-- COMMIT returns -->
  <rect x="232" y="100" width="100" height="30" rx="6" fill="var(--accent)" opacity="0.85"/>
  <text x="282" y="120" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold">COMMIT ✓</text>
  <line x1="282" y1="130" x2="282" y2="200" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3,3"/>

  <!-- Idle gap -->
  <text x="300" y="155" font-size="12" fill="var(--text)" opacity="0.6">… background …</text>

  <!-- Checkpoint / data page flush -->
  <line x1="360" y1="140" x2="500" y2="140" stroke="var(--border)" stroke-width="2"/>
  <polygon points="500,136 512,140 500,144" fill="var(--border)"/>
  <rect x="504" y="122" width="90" height="34" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="549" y="136" font-size="12" fill="var(--text)" text-anchor="middle">Checkpoint:</text>
  <text x="549" y="150" font-size="12" fill="var(--text)" text-anchor="middle">flush pages</text>

  <!-- Crash zone annotation -->
  <rect x="245" y="58" width="108" height="24" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="299" y="74" font-size="11" fill="var(--text)" text-anchor="middle">crash here → WAL</text>
  <text x="299" y="88" font-size="11" fill="var(--text)" text-anchor="middle" opacity="0.7">replays the write</text>
  <line x1="299" y1="92" x2="299" y2="100" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>

  <!-- X-axis labels -->
  <text x="120" y="218" font-size="11" fill="var(--text)" text-anchor="middle">log written</text>
  <text x="240" y="218" font-size="11" fill="var(--text)" text-anchor="middle">log durable</text>
  <text x="360" y="218" font-size="11" fill="var(--text)" text-anchor="middle">…later…</text>
  <text x="500" y="218" font-size="11" fill="var(--text)" text-anchor="middle">pages durable</text>
</svg>
<figcaption>WAL commit timeline: the log is forced to disk before COMMIT returns; data pages are flushed lazily by a background checkpoint.</figcaption>
</figure>

## Recovery after a crash

When the database restarts after a crash, the recovery manager replays the WAL forward from the last checkpoint. This is called the **redo pass**.

| Log record state | Action on recovery |
|---|---|
| Record has a COMMIT entry in the log | **Redo** all changes — they were promised durable |
| Record has no COMMIT (transaction was in-flight) | **Undo** any partial changes — the transaction never committed |

This two-phase approach (redo committed work, undo uncommitted work) is the basis of the **ARIES** recovery algorithm used by most production databases (PostgreSQL, MySQL InnoDB, SQL Server).

> **Note:** SQLite uses a slightly different mechanism — it can use either a *rollback journal* or WAL mode (`PRAGMA journal_mode=WAL`). Both ensure the same durability guarantee; WAL mode additionally allows concurrent readers while a write is in progress.

## Seeing durability in action

The widget below simulates a transfer between two accounts. Try modifying the amounts — notice that if the INSERT into `transfers` succeeded, the balances in `accounts` must reflect it (atomicity + durability). There is no half-applied state.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Crash-safe transfer</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 1000), (2, 'Bob', 500); CREATE TABLE transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER, to_id INTEGER, amount INTEGER, committed_at TEXT); CREATE TABLE wal_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, txn_id TEXT, entry_type TEXT, detail TEXT); INSERT INTO wal_log VALUES (NULL, 'txn-42', 'BEGIN', 'transaction started'); INSERT INTO wal_log VALUES (NULL, 'txn-42', 'UPDATE', 'accounts id=1 balance: 1000 -> 800'); INSERT INTO wal_log VALUES (NULL, 'txn-42', 'UPDATE', 'accounts id=2 balance: 500 -> 700'); INSERT INTO wal_log VALUES (NULL, 'txn-42', 'INSERT', 'transfers row added'); INSERT INTO wal_log VALUES (NULL, 'txn-42', 'COMMIT', 'log fsynced — durable');">-- The WAL log for a completed transfer (already committed):
SELECT seq, txn_id, entry_type, detail FROM wal_log ORDER BY seq;

-- Confirm the account balances match what the log says:
-- SELECT id, name, balance FROM accounts;</textarea>
  </div>
</div>

Uncomment the second query to verify the balances. Because the log shows a COMMIT record, recovery would always redo this transfer — the promise holds even after a crash.

<details class="reveal"><summary>Reveal: What happens to a transaction whose log has no COMMIT record?</summary><div class="reveal-body">Recovery treats it as incomplete. The undo pass reverses every change that transaction made to data pages, leaving the database as if the transaction never started. The application will see a connection error or a rolled-back transaction, and it must retry.</div></details>
