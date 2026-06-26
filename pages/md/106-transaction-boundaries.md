Every transaction has a beginning and an end. Those two moments — where you open a transaction and where you close it — are its **boundaries**. Choosing the right boundaries is one of the most practical skills in database programming: too narrow and your data can be left in a half-written state; too wide and you hold locks longer than necessary, slowing everything else down.

## Opening and Closing a Transaction

In SQL, you mark the boundaries explicitly with three statements:

| Statement | Meaning |
|---|---|
| `BEGIN` (or `START TRANSACTION`) | Opens a new transaction. Everything after this is part of the same unit. |
| `COMMIT` | Closes the transaction successfully. All changes become permanent and visible to others. |
| `ROLLBACK` | Closes the transaction by undoing every change made since `BEGIN`. |

```sql
BEGIN;

UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- debit Alice
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- credit Bob

COMMIT;  -- both changes land together, or neither does
```

If the process crashes after the `UPDATE`s but before the `COMMIT`, the database engine replays or discards the partial work on recovery — Alice is not debited without Bob being credited.

> **Note:** Many database drivers operate in **auto-commit** mode by default, which means every individual statement is its own transaction. You only need `BEGIN` when you want to group multiple statements into one unit.

## Where to Draw the Line

The golden rule: **a transaction should span exactly the work that must succeed or fail together** — no more, no less.

Consider transferring money between accounts. These two updates are causally linked — one cannot succeed without the other. They belong inside the same transaction boundary. On the other hand, logging the transfer to an audit table is a separate concern; if the log write fails, you may not want to roll back the transfer itself.

A common mistake is keeping transactions open while waiting for user input or making a network call. The transaction holds locks during that wait, blocking other clients. Keep the boundary tight: fetch what you need, close the transaction, then interact with the user, then open a new transaction to write the result.

<figure class="diagram">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing a transaction from BEGIN to COMMIT with two operations inside, versus a rolled-back transaction">
  <!-- Timeline axis -->
  <line x1="40" y1="110" x2="600" y2="110" stroke="var(--border)" stroke-width="1.5"/>
  <!-- Arrow head -->
  <polygon points="600,110 592,105 592,115" fill="var(--border)"/>
  <text x="610" y="114" font-size="12" fill="var(--text)">time</text>

  <!-- Successful transaction block -->
  <rect x="80" y="70" width="240" height="40" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="200" y="94" text-anchor="middle" font-size="13" fill="var(--text)">UPDATE · UPDATE</text>

  <!-- BEGIN marker -->
  <line x1="80" y1="58" x2="80" y2="122" stroke="var(--accent)" stroke-width="2"/>
  <text x="80" y="52" text-anchor="middle" font-size="12" fill="var(--accent)">BEGIN</text>

  <!-- COMMIT marker -->
  <line x1="320" y1="58" x2="320" y2="122" stroke="var(--accent)" stroke-width="2"/>
  <text x="320" y="52" text-anchor="middle" font-size="12" fill="var(--accent)">COMMIT</text>
  <text x="200" y="140" text-anchor="middle" font-size="12" fill="var(--text)">Changes are durable</text>

  <!-- Failed transaction block -->
  <rect x="380" y="70" width="160" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="460" y="94" text-anchor="middle" font-size="13" fill="var(--text)">UPDATE · ERROR</text>

  <!-- BEGIN2 marker -->
  <line x1="380" y1="58" x2="380" y2="122" stroke="var(--border)" stroke-width="2"/>
  <text x="380" y="52" text-anchor="middle" font-size="12" fill="var(--text)">BEGIN</text>

  <!-- ROLLBACK marker -->
  <line x1="540" y1="58" x2="540" y2="122" stroke="#e05" stroke-width="2"/>
  <text x="540" y="52" text-anchor="middle" font-size="12" fill="#e05">ROLLBACK</text>
  <text x="460" y="140" text-anchor="middle" font-size="12" fill="var(--text)">Changes are undone</text>

  <!-- Labels -->
  <text x="200" y="175" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">Successful transaction</text>
  <text x="460" y="175" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">Failed transaction</text>
</svg>
<figcaption>A committed transaction makes all its changes durable; a rolled-back transaction leaves the database unchanged.</figcaption>
</figure>

## Savepoints: Partial Rollbacks

Sometimes you want to undo only part of a transaction. SQL provides **savepoints** for this:

```sql
BEGIN;

INSERT INTO orders (customer_id, total) VALUES (42, 99.00);

SAVEPOINT before_promo;

UPDATE promotions SET uses = uses + 1 WHERE code = 'SAVE10';
-- suppose this update finds 0 rows (invalid code)

ROLLBACK TO SAVEPOINT before_promo;  -- undo just the promo update
-- the INSERT above is still in play

COMMIT;  -- only the order insert is committed
```

A `ROLLBACK TO SAVEPOINT` does not end the transaction — it rewinds to a checkpoint inside it. You can then continue working and eventually `COMMIT` or `ROLLBACK` the whole thing.

> **Note:** Savepoints are standard SQL and supported by PostgreSQL, MySQL, and SQLite. They are especially useful in application code that builds up complex writes where one optional step might fail.

## Trying It Yourself

The widget below lets you experiment with `BEGIN`, `COMMIT`, and `ROLLBACK`. Notice that without an explicit `BEGIN`, each statement auto-commits. Try wrapping the two `UPDATE`s in a transaction and rolling back — then check whether the balances changed.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Transaction boundaries</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 500), (2, 'Bob', 300);">-- Run this block as-is to see a committed transfer.
-- Then change COMMIT to ROLLBACK and re-run to see the undo.

BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

SELECT name, balance FROM accounts;</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: What happens if you ROLLBACK instead of COMMIT?</summary><div class="reveal-body">Both UPDATE statements are undone. Alice keeps her 500 and Bob keeps his 300 — exactly as if neither statement had run. The database guarantees that a rolled-back transaction leaves no trace.</div></details>
