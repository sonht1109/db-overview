When multiple nodes in a replicated system can accept writes, you gain availability and geographic flexibility — but you also open the door to **write conflicts**. A conflict occurs when two nodes accept different writes to the same row (or key) before they have had a chance to synchronize. Both writes are valid locally, but they contradict each other globally. Resolving that contradiction without losing data or corrupting state is the central challenge of multi-master (multi-primary) replication.

## What a Conflict Looks Like

Imagine an order management system replicated across two data centers — US and EU. A customer's loyalty-points balance starts at 200.

1. At 10:00:00, the EU node records a purchase and **subtracts 50 points** → balance becomes 150.
2. At 10:00:01, the US node records a different purchase and **subtracts 80 points** → balance becomes 120.
3. Neither node knew about the other's write when it happened.

When replication catches up, both nodes see two conflicting updates. The correct answer — 70 points remaining — is not what either node computed. A naive resolution (e.g., "last write wins") silently drops one transaction.

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing two concurrent conflicting writes on EU and US nodes before replication sync">
  <!-- Timeline axis -->
  <line x1="60" y1="60" x2="580" y2="60" stroke="var(--border)" stroke-width="2"/>
  <line x1="60" y1="200" x2="580" y2="200" stroke="var(--border)" stroke-width="2"/>

  <!-- Node labels -->
  <text x="30" y="64" font-size="13" fill="var(--text)" text-anchor="middle">EU</text>
  <text x="30" y="204" font-size="13" fill="var(--text)" text-anchor="middle">US</text>

  <!-- Time markers -->
  <text x="160" y="40" font-size="12" fill="var(--text)" text-anchor="middle">t=10:00:00</text>
  <text x="320" y="40" font-size="12" fill="var(--text)" text-anchor="middle">t=10:00:01</text>
  <text x="490" y="40" font-size="12" fill="var(--text)" text-anchor="middle">t=10:00:05 (sync)</text>

  <!-- EU write event -->
  <circle cx="160" cy="60" r="6" fill="var(--accent)"/>
  <rect x="110" y="70" width="110" height="34" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="165" y="87" font-size="12" fill="var(--text)" text-anchor="middle">200 − 50 = 150</text>
  <text x="165" y="100" font-size="11" fill="var(--text)" text-anchor="middle">EU balance: 150</text>

  <!-- US write event -->
  <circle cx="320" cy="200" r="6" fill="var(--accent)"/>
  <rect x="268" y="210" width="110" height="34" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="323" y="227" font-size="12" fill="var(--text)" text-anchor="middle">200 − 80 = 120</text>
  <text x="323" y="240" font-size="11" fill="var(--text)" text-anchor="middle">US balance: 120</text>

  <!-- Sync arrows -->
  <line x1="490" y1="65" x2="490" y2="195" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3"/>
  <polygon points="490,190 485,178 495,178" fill="var(--accent)"/>
  <polygon points="490,70 485,82 495,82" fill="var(--accent)"/>

  <!-- Conflict label -->
  <rect x="430" y="118" width="100" height="28" rx="4" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="480" y="136" font-size="12" fill="var(--accent)" text-anchor="middle" font-weight="bold">CONFLICT</text>
</svg>
<figcaption>Two nodes write different updates to the same row before replicating — a classic write conflict.</figcaption>
</figure>

> **Note:** Single-leader replication avoids this entirely because only one node accepts writes. Conflicts are a trade-off you accept in exchange for multi-primary availability.

## Conflict Detection

Before you can resolve a conflict you have to know one happened. Common detection strategies:

| Strategy | How it works | Typical use |
|---|---|---|
| **Timestamps / wall clock** | Compare `updated_at` timestamps | Simple but vulnerable to clock skew |
| **Version vectors** | Each replica tracks a logical counter per peer; compare vectors | CouchDB, Riak |
| **Operational transformation** | Track the intent of each operation, not just the value | Collaborative editors (Google Docs) |
| **Application-layer locks** | Serialize writes through a coordinator for critical rows | Financial systems |

Vector clocks (sometimes called version vectors) are the most rigorous approach: they let a system determine whether two writes are causally related (one happened *before* the other) or truly concurrent (neither knew about the other). Only concurrent writes produce a genuine conflict.

## Conflict Resolution Strategies

Once a conflict is detected, the system must pick a winner or merge the changes. There is no universally correct answer — the right strategy depends on your data semantics.

### Last Write Wins (LWW)

The write with the latest timestamp is kept; the other is discarded. It is dead simple and widely used (Cassandra defaults to it), but it **silently drops data**. In the loyalty-points example, the EU deduction would be lost entirely if the US timestamp is later.

Use LWW only when losing concurrent writes is acceptable — for example, a "last seen online" timestamp where the most recent value genuinely supersedes earlier ones.

### Merge / CRDT

A **Conflict-free Replicated Data Type (CRDT)** is a data structure designed so that all concurrent updates can always be merged automatically into a consistent result. Common examples:

- **G-Counter** (grow-only counter): each replica tracks its own increment; the total is the sum of all replicas.
- **LWW-Register**: a register that applies last-write-wins per key.
- **OR-Set** (observed-remove set): a set where adds and removes can be merged without conflict.

CRDTs work because the merge operation is commutative, associative, and idempotent — it doesn't matter what order replicas exchange their updates.

### Application-Defined Resolution

Many systems expose the conflict to the application layer and let the business logic decide. CouchDB, for instance, stores all conflicting revisions and lets the application read them and write back a resolved version. This is the most flexible approach — and the most work.

```sql
-- Pseudo-code: application resolves loyalty-point conflict
-- Both writes are visible; application merges by computing the correct delta
SELECT balance, version
FROM loyalty_points_revisions
WHERE user_id = 42
ORDER BY version;

-- Application computes: 200 - 50 - 80 = 70, writes resolved value
UPDATE loyalty_points SET balance = 70, version = 3 WHERE user_id = 42;
```

### Custom Merge Functions

Some databases (like DynamoDB with Lambda triggers, or PostgreSQL logical replication with conflict-resolution plugins) let you register a server-side function that runs automatically when a conflict is detected — keeping the logic close to the data without exposing raw conflicts to every application client.

## Trying It Out

The widget below simulates a simplified conflict log — the kind of table a multi-primary system might maintain before resolution runs. Explore the data, then try the query that mimics a Last Write Wins resolution.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Conflict Resolution</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE conflict_log (conflict_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, node TEXT NOT NULL, new_balance INTEGER NOT NULL, written_at TEXT NOT NULL); INSERT INTO conflict_log VALUES (1, 42, 'EU', 150, '2024-06-01 10:00:00'); INSERT INTO conflict_log VALUES (2, 42, 'US', 120, '2024-06-01 10:00:01'); INSERT INTO conflict_log VALUES (3, 99, 'EU', 300, '2024-06-01 10:05:00'); INSERT INTO conflict_log VALUES (4, 99, 'US', 290, '2024-06-01 10:04:58');">-- Last Write Wins: pick the row with the latest written_at per user
SELECT user_id,
       node        AS winning_node,
       new_balance AS resolved_balance,
       written_at  AS winning_timestamp
FROM conflict_log
WHERE (user_id, written_at) IN (
    SELECT user_id, MAX(written_at)
    FROM conflict_log
    GROUP BY user_id
)
ORDER BY user_id;

-- Try changing MAX to MIN to see "First Write Wins" instead.
-- Notice user 99: the EU write arrives LATER even though it has a lower balance.
-- LWW picks it silently -- potentially wrong for a debit scenario.</textarea>
  </div>
</div>

Notice how LWW chooses EU's balance of 300 for user 99, even though the US had the lower (and arguably more "correct") debit applied first. This illustrates why LWW is dangerous for anything involving money or inventory.

## Preventing Conflicts

Resolution is always imperfect — the best strategy is often to minimize conflicts in the first place:

- **Shard writes by owner**: route all writes for a given user, order, or tenant to a single primary. That primary replicates to others read-only, eliminating conflicts for that partition.
- **Use single-leader for sensitive rows**: even in a multi-primary cluster, designate one leader per resource for writes that demand strict consistency.
- **Commutative operations**: design updates as deltas (`balance = balance - 50`) rather than absolute assignments (`balance = 150`). Two concurrent delta updates can be applied in any order and still converge — though you still need to guard against double-application.
