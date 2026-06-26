A **deadlock** happens when two or more transactions are each waiting for a lock that the other holds — and none can proceed. It is not a bug in the application code, exactly; it is an emergent property of allowing multiple transactions to lock resources in different orders. Every serious database system has to deal with deadlocks, and every one of them does.

## How a Deadlock Forms

Deadlocks require at least two transactions and at least two locked resources. The classic scenario:

| Step | Transaction A | Transaction B |
|------|---------------|---------------|
| 1 | Locks **row 1** (success) | — |
| 2 | — | Locks **row 2** (success) |
| 3 | Tries to lock **row 2** → **waits** | — |
| 4 | — | Tries to lock **row 1** → **waits** |

Now A is waiting for B to release row 2, and B is waiting for A to release row 1. Neither will ever release — they are deadlocked.

The four classic conditions that must all be true for a deadlock to occur (Coffman conditions):

1. **Mutual exclusion** — a lock can only be held by one transaction at a time.
2. **Hold and wait** — a transaction holds at least one lock while waiting for another.
3. **No preemption** — locks are not forcibly taken away; a transaction must release them voluntarily.
4. **Circular wait** — there is a cycle in the "waiting for" graph (A waits for B, B waits for A).

<figure class="diagram">
<svg viewBox="0 0 580 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wait-for graph showing Transaction A and Transaction B in a deadlock cycle, each holding one lock and waiting for the other">
  <!-- Background panels -->
  <rect x="10" y="30" width="170" height="220" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <rect x="400" y="30" width="170" height="220" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>

  <!-- Transaction nodes -->
  <ellipse cx="95" cy="100" rx="52" ry="28" fill="var(--accent)" opacity="0.85"/>
  <text x="95" y="105" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--surface-2)">Txn A</text>

  <ellipse cx="485" cy="100" rx="52" ry="28" fill="var(--accent)" opacity="0.85"/>
  <text x="485" y="105" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--surface-2)">Txn B</text>

  <!-- Resource nodes -->
  <rect x="40" y="175" width="110" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="95" y="196" text-anchor="middle" font-size="12" fill="var(--text)">Row 1</text>
  <text x="95" y="214" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.7">(locked by A)</text>

  <rect x="430" y="175" width="110" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="485" y="196" text-anchor="middle" font-size="12" fill="var(--text)">Row 2</text>
  <text x="485" y="214" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.7">(locked by B)</text>

  <!-- A holds Row 1 (solid) -->
  <line x1="95" y1="128" x2="95" y2="172" stroke="var(--accent)" stroke-width="2"/>
  <text x="102" y="155" font-size="11" fill="var(--text)">holds</text>

  <!-- B holds Row 2 (solid) -->
  <line x1="485" y1="128" x2="485" y2="172" stroke="var(--accent)" stroke-width="2"/>
  <text x="492" y="155" font-size="11" fill="var(--text)">holds</text>

  <!-- A waits for Row 2 (dashed, cross) -->
  <line x1="147" y1="100" x2="390" y2="100" stroke="#e05252" stroke-width="2" stroke-dasharray="6 4"/>
  <!-- arrowhead toward B's row -->
  <polygon points="430,196 418,189 418,203" fill="#e05252"/>
  <line x1="390" y1="100" x2="390" y2="196" stroke="#e05252" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="250" y="93" text-anchor="middle" font-size="11" fill="#e05252">A waits for Row 2</text>

  <!-- B waits for Row 1 (dashed, cross) -->
  <line x1="430" y1="200" x2="290" y2="200" stroke="#e05252" stroke-width="2" stroke-dasharray="6 4"/>
  <line x1="290" y1="200" x2="190" y2="145" stroke="#e05252" stroke-width="2" stroke-dasharray="6 4"/>
  <polygon points="190,145 178,143 186,133" fill="#e05252"/>
  <text x="350" y="218" text-anchor="middle" font-size="11" fill="#e05252">B waits for Row 1</text>

  <!-- Deadlock label -->
  <rect x="218" y="115" width="144" height="30" rx="6" fill="#e05252" opacity="0.15" stroke="#e05252" stroke-width="1"/>
  <text x="290" y="135" text-anchor="middle" font-size="13" font-weight="bold" fill="#e05252">DEADLOCK</text>
</svg>
<figcaption>Wait-for graph: A holds Row 1 and wants Row 2; B holds Row 2 and wants Row 1 — a cycle with no exit.</figcaption>
</figure>

## Detection: The Wait-For Graph

Most production databases (PostgreSQL, MySQL InnoDB, SQL Server, Oracle) use **deadlock detection** rather than prevention. The engine periodically — or on every lock request — builds a **wait-for graph**:

- Each node is an active transaction.
- A directed edge **A → B** means "A is waiting for a lock that B holds."

A deadlock exists if and only if the graph has a **cycle**. When a cycle is found, the database picks a **victim** — usually the transaction that has done the least work or holds the fewest locks — and rolls it back, releasing its locks. The surviving transactions can then proceed.

> **Note:** The victim transaction receives an error (e.g., `ERROR: deadlock detected` in PostgreSQL). Your application must be prepared to catch this error and **retry the transaction**.

### Deadlock prevention (the alternative)

Some systems avoid deadlocks entirely by imposing ordering rules:

- **Wait-Die**: an older transaction waits; a younger one is rolled back ("dies").
- **Wound-Wait**: an older transaction preempts ("wounds") a younger one; a younger one waits.

These are used in distributed databases where detection is expensive. For single-node SQL databases, detection + victim rollback is the standard approach.

## Avoiding Deadlocks in Practice

Deadlocks cannot always be prevented, but they can be made rare:

1. **Always lock in the same order.** If every transaction locks rows in ascending `id` order, a cycle cannot form. This is the single most effective rule.
2. **Keep transactions short.** Fewer locks held for less time means fewer chances for a cycle.
3. **Use `SELECT ... FOR UPDATE` deliberately.** Acquire all the locks you need at the start of the transaction, not halfway through.
4. **Avoid user interaction inside a transaction.** Never leave a transaction open while waiting for a human to click a button.

## Try It Yourself

SQLite uses a coarser database-level lock, so true deadlocks from two concurrent connections are not demonstrable in a single sql.js session. The widget below simulates the **logical pattern** — the read-lock-then-request sequence — so you can see which steps conflict and in what order.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Lock order simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 500); INSERT INTO accounts VALUES (2, 'Bob', 300); CREATE TABLE lock_log (step TEXT, txn TEXT, resource TEXT, action TEXT); INSERT INTO lock_log VALUES ('1', 'Txn A', 'accounts row id=1', 'LOCK acquired'); INSERT INTO lock_log VALUES ('2', 'Txn B', 'accounts row id=2', 'LOCK acquired'); INSERT INTO lock_log VALUES ('3', 'Txn A', 'accounts row id=2', 'WAITING -- B holds it'); INSERT INTO lock_log VALUES ('4', 'Txn B', 'accounts row id=1', 'WAITING -- A holds it (DEADLOCK)'); INSERT INTO lock_log VALUES ('5', 'Txn B', 'accounts row id=1', 'VICTIM: rolled back by engine'); INSERT INTO lock_log VALUES ('6', 'Txn A', 'accounts row id=2', 'LOCK acquired -- cycle broken'); -- Simulate the safe outcome after victim rollback: UPDATE accounts SET balance = balance - 100 WHERE id = 1; UPDATE accounts SET balance = balance + 100 WHERE id = 2;">-- Walk through the deadlock scenario step by step:
SELECT step, txn, resource, action FROM lock_log ORDER BY CAST(step AS INTEGER);

-- Then check the final account state after Txn A completes:
-- SELECT * FROM accounts;
</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Why does locking in a consistent order prevent deadlocks?</summary><div class="reveal-body">

If every transaction locks resources in the same global order (say, always by ascending row ID), then no circular dependency can form. To have a cycle you would need: A holds resource X and wants Y, while B holds Y and wants X. But if both A and B must acquire X before Y, then whichever transaction gets X first will also get Y before the other transaction even requests Y — no cycle, no deadlock. Consistent ordering breaks the **circular wait** condition, which is one of the four conditions required for deadlock.

</div></details>
