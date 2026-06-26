When multiple transactions run at the same time, the database must ensure they don't corrupt each other's work. **Two-phase locking (2PL)** is the classical protocol that achieves this: every transaction must acquire a lock before accessing a row and must not release any lock until it has finished acquiring all the locks it needs. This deceptively simple rule turns out to be sufficient to guarantee **serializability** — the strongest isolation guarantee a database can offer.

## The Two Phases

The name comes from the shape of a transaction's locking activity over time:

- **Growing phase** — the transaction acquires locks. It may not release any yet.
- **Shrinking phase** — the transaction releases locks. It may not acquire any new ones.

The boundary between the two phases is called the **lock point**. After the lock point, the transaction is committed to using only the data it has already locked.

<figure class="diagram">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two-phase locking timeline showing growing phase then shrinking phase separated by the lock point at commit">

  <!-- Background -->
  <rect x="10" y="10" width="620" height="195" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>

  <!-- Phase labels -->
  <text x="170" y="35" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Growing Phase</text>
  <text x="470" y="35" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Shrinking Phase</text>

  <!-- Divider at lock point -->
  <line x1="320" y1="45" x2="320" y2="185" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="320" y="195" text-anchor="middle" font-size="12" fill="var(--text)">Lock Point (COMMIT)</text>

  <!-- Lock count curve - growing then shrinking -->
  <!-- Growing arc -->
  <polyline points="40,160 100,130 160,105 220,85 280,72 320,68" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
  <!-- Shrinking arc -->
  <polyline points="320,68 370,80 420,105 480,135 560,165" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 3"/>

  <!-- Y axis -->
  <line x1="40" y1="50" x2="40" y2="170" stroke="var(--border)" stroke-width="1.2"/>
  <text x="36" y="55" text-anchor="end" font-size="11" fill="var(--text)">high</text>
  <text x="36" y="170" text-anchor="end" font-size="11" fill="var(--text)">0</text>
  <text x="14" y="120" text-anchor="middle" font-size="11" fill="var(--text)" transform="rotate(-90,14,120)">locks held</text>

  <!-- X axis -->
  <line x1="40" y1="170" x2="590" y2="170" stroke="var(--border)" stroke-width="1.2"/>
  <text x="315" y="185" text-anchor="middle" font-size="11" fill="var(--text)">time →</text>

  <!-- Acquire annotations -->
  <circle cx="100" cy="130" r="4" fill="var(--accent)"/>
  <text x="105" y="122" font-size="11" fill="var(--text)">lock row A</text>

  <circle cx="200" cy="88" r="4" fill="var(--accent)"/>
  <text x="205" y="80" font-size="11" fill="var(--text)">lock row B</text>

  <circle cx="280" cy="72" r="4" fill="var(--accent)"/>
  <text x="285" y="64" font-size="11" fill="var(--text)">lock row C</text>

  <!-- Release annotations -->
  <circle cx="400" cy="112" r="4" fill="var(--accent)" opacity="0.6"/>
  <text x="405" y="104" font-size="11" fill="var(--text)">release A, B</text>

  <circle cx="490" cy="138" r="4" fill="var(--accent)" opacity="0.6"/>
  <text x="495" y="130" font-size="11" fill="var(--text)">release C</text>

</svg>
<figcaption>A 2PL transaction acquires all locks it needs (growing), commits at the lock point, then releases them all (shrinking).</figcaption>
</figure>

In practice, most databases implement **strict 2PL**: all locks are held until commit or rollback. This prevents a subtle problem called *cascading aborts*, where other transactions that read your uncommitted data would also have to roll back if you abort.

## Shared and Exclusive Locks

2PL uses two types of locks to allow concurrent reads while still protecting writes:

| Lock type | Also called | Who can hold it simultaneously | Purpose |
|-----------|-------------|-------------------------------|---------|
| **Shared (S)** | Read lock | Many transactions at once | "I am reading this row" |
| **Exclusive (X)** | Write lock | Only one transaction | "I am modifying this row" |

The compatibility matrix is simple:

|          | S held | X held |
|----------|--------|--------|
| **S request** | ✓ granted | ✗ blocked |
| **X request** | ✗ blocked | ✗ blocked |

A transaction wanting to write must wait until all readers (and any concurrent writer) finish. A transaction wanting to read must wait only if someone is writing.

## Deadlocks

When two transactions each hold a lock the other needs, they will wait for each other forever — a **deadlock**.

```
Txn A holds lock on accounts(id=1), wants lock on accounts(id=2)
Txn B holds lock on accounts(id=2), wants lock on accounts(id=1)
→ Both wait. Neither can proceed.
```

Databases detect deadlocks automatically (via a wait-for graph or timeouts) and abort one of the transactions, letting the other proceed. The aborted transaction is then retried by the application.

> **Note:** Deadlocks are a normal part of life with 2PL. Well-written applications always wrap transactions in retry logic. Acquiring locks in a **consistent order** across all transactions (e.g., always lock lower `id` first) can eliminate many deadlocks before they start.

## 2PL in Action: a Bank Transfer

The classic example is transferring money between two accounts. The transaction must lock both rows before reading either one.

```sql
BEGIN;

-- Acquire exclusive locks on both rows
SELECT * FROM accounts WHERE id IN (1, 2) FOR UPDATE;

-- Now safely compute and apply the transfer
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;

COMMIT;  -- locks released here (strict 2PL)
```

Any other transaction trying to touch accounts 1 or 2 will block until this commit completes. Serializability is guaranteed: from the outside, these two transactions appear to run one after the other, in some order, with no interleaving.

## Try It Yourself

The widget below simulates what happens when two transactions compete for the same row. Run it to see the lock-compatible read scenario, then modify it to observe a write conflict.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Lock compatibility demo</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 1000), (2, 'Bob', 500); CREATE TABLE xfer_log (note TEXT); INSERT INTO xfer_log VALUES ('Transfer simulation (SQLite runs statements sequentially, modeling one txn at a time)'); UPDATE accounts SET balance = balance - 200 WHERE id = 1; UPDATE accounts SET balance = balance + 200 WHERE id = 2; INSERT INTO xfer_log VALUES ('Transferred $200 from Alice to Bob');">-- Check balances after the simulated transfer
SELECT owner, balance FROM accounts;

-- Also see the log
SELECT note FROM xfer_log;
</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Why does 2PL guarantee serializability?</summary><div class="reveal-body">

Because of the lock point. At the moment a transaction passes its lock point, it holds every lock it will ever need. Any other transaction that conflicts with it must either have finished before the lock point (and released its locks) or must wait until after the lock point (and sees only committed data). This creates a total ordering of conflicting transactions — exactly what serializability requires.

The formal proof is that the conflict graph of a 2PL schedule is always acyclic, which is the definition of a serializable execution.

</div></details>
