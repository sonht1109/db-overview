Snapshot isolation (SI) is a concurrency control technique used by PostgreSQL, Oracle, SQL Server, MySQL (InnoDB), and many others. Instead of blocking readers with locks, it gives each transaction its own **frozen snapshot** of the database — a consistent view of all data as it existed at the moment the transaction started. Reads never wait for writers, and writers never block readers.

## How Snapshots Work

Every row in the database is actually stored as a chain of **versions**. When a transaction updates a row, it writes a new version alongside the old one rather than overwriting it in place. This technique is called **Multi-Version Concurrency Control (MVCC)** — snapshot isolation is built on top of it.

Each transaction is assigned a monotonically increasing **transaction ID (txid)**. A row version is visible to a transaction only if:

1. It was committed **before** the transaction's snapshot was taken, and
2. It has not been deleted (or its deletion was committed after the snapshot).

This means two transactions running at the same time will each see a consistent, stable world — even if the other transaction is busily writing new versions.

<figure class="diagram">
<svg viewBox="0 0 640 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing Txn A and Txn B each reading their own snapshot of a row while Txn C writes a new version">

  <!-- Background -->
  <rect x="10" y="10" width="620" height="248" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>

  <!-- Time axis -->
  <line x1="60" y1="235" x2="610" y2="235" stroke="var(--border)" stroke-width="1.4"/>
  <text x="335" y="252" text-anchor="middle" font-size="12" fill="var(--text)">time →</text>

  <!-- Tick marks -->
  <line x1="120" y1="230" x2="120" y2="240" stroke="var(--border)" stroke-width="1.2"/>
  <text x="120" y="252" text-anchor="middle" font-size="11" fill="var(--text)">t1</text>
  <line x1="240" y1="230" x2="240" y2="240" stroke="var(--border)" stroke-width="1.2"/>
  <text x="240" y="252" text-anchor="middle" font-size="11" fill="var(--text)">t2</text>
  <line x1="380" y1="230" x2="380" y2="240" stroke="var(--border)" stroke-width="1.2"/>
  <text x="380" y="252" text-anchor="middle" font-size="11" fill="var(--text)">t3</text>
  <line x1="510" y1="230" x2="510" y2="240" stroke="var(--border)" stroke-width="1.2"/>
  <text x="510" y="252" text-anchor="middle" font-size="11" fill="var(--text)">t4</text>

  <!-- Txn A bar -->
  <rect x="120" y="42" width="390" height="30" rx="5" fill="var(--accent)" opacity="0.25"/>
  <line x1="120" y1="42" x2="120" y2="72" stroke="var(--accent)" stroke-width="2"/>
  <text x="115" y="38" text-anchor="end" font-size="13" font-weight="bold" fill="var(--accent)">Txn A</text>
  <text x="315" y="62" text-anchor="middle" font-size="12" fill="var(--text)">reads balance = 1000  (snapshot at t1)</text>
  <line x1="510" y1="42" x2="510" y2="72" stroke="var(--accent)" stroke-width="2"/>
  <text x="512" y="38" font-size="11" fill="var(--text)">COMMIT</text>

  <!-- Txn C bar (writer) -->
  <rect x="240" y="92" width="140" height="30" rx="5" fill="var(--accent)" opacity="0.55"/>
  <line x1="240" y1="92" x2="240" y2="122" stroke="var(--accent)" stroke-width="2"/>
  <text x="235" y="88" text-anchor="end" font-size="13" font-weight="bold" fill="var(--accent)">Txn C</text>
  <text x="310" y="112" text-anchor="middle" font-size="12" fill="var(--text)">writes balance = 1500</text>
  <line x1="380" y1="92" x2="380" y2="122" stroke="var(--accent)" stroke-width="2"/>
  <text x="382" y="88" font-size="11" fill="var(--text)">COMMIT</text>

  <!-- new version marker -->
  <rect x="382" y="140" width="120" height="22" rx="4" fill="var(--accent)" opacity="0.18" stroke="var(--accent)" stroke-width="1"/>
  <text x="442" y="155" text-anchor="middle" font-size="11" fill="var(--text)">new version visible (txid > t2)</text>

  <!-- Txn B bar -->
  <rect x="380" y="172" width="130" height="30" rx="5" fill="var(--accent)" opacity="0.25"/>
  <line x1="380" y1="172" x2="380" y2="202" stroke="var(--accent)" stroke-width="2"/>
  <text x="375" y="168" text-anchor="end" font-size="13" font-weight="bold" fill="var(--accent)">Txn B</text>
  <text x="445" y="192" text-anchor="middle" font-size="12" fill="var(--text)">reads balance = 1500  (snapshot at t3)</text>
  <line x1="510" y1="172" x2="510" y2="202" stroke="var(--accent)" stroke-width="2"/>

  <!-- Annotation: Txn A sees old version -->
  <line x1="200" y1="72" x2="200" y2="135" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="202" y="148" font-size="11" fill="var(--text)">Txn A still sees</text>
  <text x="202" y="161" font-size="11" fill="var(--text)">old version (1000)</text>

</svg>
<figcaption>Txn A and Txn B each see a different, consistent snapshot even though Txn C committed a write between them.</figcaption>
</figure>

## Read Committed vs Snapshot Isolation

Both are MVCC-based, but they take snapshots at different granularities:

| Isolation level | Snapshot taken at… | Sees changes committed during the txn? | Repeatable reads? |
|---|---|---|---|
| **Read Committed** | each individual statement | Yes | No |
| **Snapshot Isolation** | transaction start | No | Yes |

With Read Committed, a long-running transaction can see different data each time it queries the same row — a **non-repeatable read**. Snapshot isolation eliminates this: once your transaction starts, the world is frozen for you.

> **Note:** PostgreSQL calls its SI mode `REPEATABLE READ`. Its `SERIALIZABLE` level adds extra checks on top of SI to catch a remaining anomaly (write skew). Other databases (Oracle, SQL Server) call SI `SNAPSHOT`. Always check your database's docs — the SQL standard names and real implementations don't map one-to-one.

## The Write Skew Problem

Snapshot isolation is *not* full serializability. It prevents dirty reads, non-repeatable reads, and phantom reads — but it still allows **write skew**.

Classic example: two doctors are on call. Hospital policy: at least one must always be on call. Both check the schedule and see the other is on call, so both decide they can safely clock off.

```
Txn A (Doctor 1): reads on_call → {Doctor1: yes, Doctor2: yes}
Txn B (Doctor 2): reads on_call → {Doctor1: yes, Doctor2: yes}

Txn A: UPDATE schedule SET on_call = false WHERE doctor = 1;  COMMIT;
Txn B: UPDATE schedule SET on_call = false WHERE doctor = 2;  COMMIT;

Result: nobody is on call. Policy violated.
```

Each transaction read data that the other transaction changed, but they touched **different rows** — so there's no write-write conflict to detect. Both transactions committed successfully against their own valid snapshot.

To prevent write skew under SI, you need either:
- **Serializable Snapshot Isolation (SSI)** — used by PostgreSQL `SERIALIZABLE`, which tracks read/write dependencies and aborts when a dangerous cycle is detected.
- **Explicit locking** — `SELECT ... FOR UPDATE` to force conflict detection on the rows you read.

## Try It: Seeing Your Snapshot in Action

The widget below sets up an `accounts` table and simulates what each transaction sees. SQLite runs in `DEFERRED` transaction mode; you can experiment with the version-visible logic by querying data before and after updates within the same session.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Snapshot reads</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 1000), (2, 'Bob', 500); /* Simulate Txn C committing a write */ UPDATE accounts SET balance = 1500 WHERE id = 1; CREATE TABLE snapshots (label TEXT, owner TEXT, balance INTEGER); /* before-write snapshot */ INSERT INTO snapshots VALUES ('before-write snapshot', 'Alice', 1000), ('before-write snapshot', 'Bob', 500); /* after-write snapshot */ INSERT INTO snapshots SELECT 'after-write snapshot', owner, balance FROM accounts;">-- Compare what two transactions at different times see:
SELECT label, owner, balance FROM snapshots ORDER BY label, owner;

-- Current committed state (what a new txn would see today):
SELECT 'current' AS label, owner, balance FROM accounts ORDER BY owner;
</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Why does snapshot isolation improve throughput compared to locking?</summary><div class="reveal-body">

Under two-phase locking, a writer must acquire an exclusive lock, which blocks all readers until the writer commits. Under snapshot isolation, readers never acquire locks on the rows they read — they simply consult the appropriate old version. Writers still lock rows they *write* (to detect write-write conflicts), but read-heavy workloads see dramatically less contention. This is why OLTP databases switched to MVCC: analytic queries and long reports no longer stall fast transactional writes.

</div></details>
