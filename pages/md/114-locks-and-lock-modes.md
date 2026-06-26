When two transactions want to touch the same data at the same time, the database needs a referee. **Locks** are that referee. A lock is a token the engine grants before allowing access to a resource — if another transaction already holds a conflicting lock, the newcomer must wait. Understanding lock modes tells you exactly when transactions can coexist and when they must queue up.

## What Gets Locked

Locks can protect different granularities of data:

| Granularity | Example | Trade-off |
|-------------|---------|-----------|
| **Row** | one tuple in `orders` | Fine control; many locks in memory |
| **Page** | an 8 KB disk page | Coarser; fewer metadata entries |
| **Table** | entire `orders` table | Cheap overhead; blocks all concurrent work |
| **Database** | whole DB | Rare; used for backups or DDL |

Most OLTP databases (PostgreSQL, MySQL InnoDB, SQL Server) default to **row-level locks** so that concurrent transactions touching different rows can proceed in parallel.

## The Two Core Modes: Shared and Exclusive

Every lock has a **mode** that determines what other locks can coexist on the same resource.

**Shared lock (S)** — acquired for reads. Multiple transactions can hold shared locks on the same row simultaneously, because concurrent reads do not conflict.

**Exclusive lock (X)** — acquired for writes. Only one transaction may hold an exclusive lock at a time, and it blocks all other locks (shared *and* exclusive) until it is released.

The compatibility matrix summarises when a new request must wait:

| Requested \ Held | S (shared) | X (exclusive) |
|-----------------|:----------:|:-------------:|
| **S (shared)**  | ✓ allowed  | ✗ wait        |
| **X (exclusive)**| ✗ wait    | ✗ wait        |

> **Note:** "Compatible" means the new lock can be granted immediately. "Wait" means the requesting transaction blocks until the holding transaction commits or rolls back and releases its locks.

## Timeline: Shared vs. Exclusive in Action

<figure class="diagram">
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing three transactions: Txn A and Txn B share an S-lock while Txn C waits for an X-lock">
  <!-- Background lanes -->
  <rect x="10" y="35" width="185" height="245" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <rect x="205" y="35" width="185" height="245" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <rect x="400" y="35" width="230" height="245" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>

  <!-- Lane headers -->
  <text x="102" y="26" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Txn A (SELECT)</text>
  <text x="297" y="26" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Txn B (SELECT)</text>
  <text x="514" y="26" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Txn C (UPDATE)</text>

  <!-- Timelines -->
  <line x1="102" y1="55" x2="102" y2="265" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/>
  <line x1="297" y1="55" x2="297" y2="265" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/>
  <line x1="514" y1="55" x2="514" y2="265" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/>

  <!-- Txn A: acquires S-lock at t1, releases at t4 -->
  <circle cx="102" cy="80"  r="5" fill="var(--accent)"/>
  <text x="112" y="84"  font-size="12" fill="var(--text)">S-lock acquired ✓</text>

  <rect x="55" y="90" width="94" height="110" rx="4" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="1"/>
  <text x="102" y="148" text-anchor="middle" font-size="11" fill="var(--text)">reading…</text>

  <circle cx="102" cy="215" r="5" fill="var(--accent)"/>
  <text x="112" y="219" font-size="12" fill="var(--text)">S-lock released</text>

  <!-- Txn B: acquires S-lock at t2 (coexists with A) -->
  <circle cx="297" cy="115" r="5" fill="var(--accent)"/>
  <text x="307" y="119" font-size="12" fill="var(--text)">S-lock acquired ✓</text>

  <rect x="250" y="125" width="94" height="80" rx="4" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="1"/>
  <text x="297" y="168" text-anchor="middle" font-size="11" fill="var(--text)">reading…</text>

  <circle cx="297" cy="220" r="5" fill="var(--accent)"/>
  <text x="307" y="224" font-size="12" fill="var(--text)">S-lock released</text>

  <!-- Txn C: requests X-lock at t3, blocked, gets it after both release -->
  <circle cx="514" cy="95"  r="5" fill="#e05252"/>
  <text x="524" y="99"  font-size="12" fill="#e05252">X-lock requested</text>

  <!-- blocked zone -->
  <rect x="465" y="108" width="100" height="110" rx="4" fill="#e05252" opacity="0.10" stroke="#e05252" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="514" y="148" text-anchor="middle" font-size="11" fill="#e05252">BLOCKED</text>
  <text x="514" y="163" text-anchor="middle" font-size="10" fill="#e05252">(waiting for A, B)</text>

  <circle cx="514" cy="232" r="5" fill="var(--accent)"/>
  <text x="524" y="236" font-size="12" fill="var(--text)">X-lock granted ✓</text>
  <text x="524" y="252" font-size="12" fill="var(--text)">writing…</text>
</svg>
<figcaption>Txn A and Txn B hold shared locks simultaneously. Txn C's exclusive-lock request blocks until both readers release, then proceeds alone.</figcaption>
</figure>

## Beyond S and X: Intent Locks

Row-level locking creates a challenge: before granting a table-level lock, the engine would need to scan every row to see who holds row locks — an expensive proposition. **Intent locks** solve this by letting a transaction announce its intentions at the table level before taking row locks.

The three main intent modes:

| Mode | Meaning |
|------|---------|
| **IS** (Intent Shared) | I will take S locks on some rows |
| **IX** (Intent Exclusive) | I will take X locks on some rows |
| **SIX** (Shared + Intent Exclusive) | I hold a table S-lock and will also take X locks on some rows |

A `LOCK TABLE … IN SHARE MODE` request checks the table-level intent lock, and can be denied instantly without row-by-row inspection. This is a key part of how real engines stay efficient.

## Lock Duration and Two-Phase Locking

When are locks released? In standard **two-phase locking (2PL)**:

1. **Growing phase** — the transaction acquires locks as it reads and writes; it never releases any.
2. **Shrinking phase** — after the first release, the transaction can only release locks, never acquire new ones.

In practice, most databases implement **strict 2PL**: all locks are held until `COMMIT` or `ROLLBACK`. This prevents a class of anomaly called cascading rollbacks and is the default in PostgreSQL, MySQL InnoDB, and SQL Server.

> **Note:** Releasing locks early (non-strict 2PL) can improve throughput but requires careful application design to avoid dirty reads and write skew. Most production systems stick with strict 2PL unless they use an optimistic or MVCC-based approach instead.

## Try It: Watching Lock Conflicts

SQLite serialises writes at the database level (it uses a simpler locking model than row-level systems), but you can observe the *effect* of exclusive locking: a write transaction prevents any concurrent write. The widget below lets you explore how `BEGIN EXCLUSIVE` versus `BEGIN DEFERRED` behave.

Run the setup first, then try the query to see what data is there. Edit the query to run different `SELECT` or `UPDATE` statements and observe results.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Lock simulation with version check</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE inventory (id INTEGER PRIMARY KEY, product TEXT, qty INTEGER, locked_by TEXT); INSERT INTO inventory VALUES (1, 'Widget A', 100, NULL); INSERT INTO inventory VALUES (2, 'Widget B', 50, NULL); INSERT INTO inventory VALUES (3, 'Widget C', 200, NULL); CREATE TABLE lock_log (ts TEXT, msg TEXT); INSERT INTO lock_log VALUES ('t1', 'Txn A: SELECT qty WHERE id=1 (S-lock on row 1)'); INSERT INTO lock_log VALUES ('t2', 'Txn B: SELECT qty WHERE id=1 (S-lock granted — compatible)'); INSERT INTO lock_log VALUES ('t3', 'Txn C: UPDATE qty WHERE id=1 (X-lock requested — BLOCKED by A and B)'); INSERT INTO lock_log VALUES ('t4', 'Txn A: COMMIT — S-lock released'); INSERT INTO lock_log VALUES ('t5', 'Txn B: COMMIT — S-lock released'); INSERT INTO lock_log VALUES ('t6', 'Txn C: X-lock GRANTED — write proceeds'); UPDATE inventory SET qty = qty - 10 WHERE id = 1;">-- The lock_log table narrates the lock sequence from the diagram above.
-- Try changing the SELECT below to an UPDATE to see write behaviour.
SELECT ts, msg FROM lock_log;
</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Why do two readers never block each other?</summary><div class="reveal-body">

Two `SELECT` statements both acquire **shared (S) locks**. S locks are compatible with other S locks because reading data never changes it — two readers see exactly the same version of the row, so there is no conflict. The engine can safely grant both locks simultaneously.

An **exclusive (X) lock** is incompatible with everything because a writer is about to change the data. If another reader or writer were allowed in simultaneously, they could see a half-written row or overwrite the in-progress change. Blocking them until the write commits guarantees they always see a consistent, committed state.

</div></details>
