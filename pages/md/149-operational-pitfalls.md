Replication keeps your data available and your reads fast — but it also introduces a class of subtle, hard-to-reproduce bugs that only surface in production under real load. This page catalogs the most common operational traps so you can recognize and avoid them.

## Replication Slot Bloat

PostgreSQL's logical and physical replication slots are a convenient way to ensure a replica never misses a WAL segment. The primary holds back WAL files until every consumer attached to a slot has confirmed receipt. That guarantee becomes a liability when a replica falls behind or is abandoned:

| What happened | Consequence |
|---|---|
| Replica crashes and stays down | Primary retains every WAL file since the crash |
| Slot created for testing, never cleaned up | Disk fills silently — no queries fail until the disk is full |
| Network partition lasting hours | Same as crash; slot keeps accumulating |

When the primary's disk fills, it **shuts down** — taking your primary offline to protect data integrity. This is one of the most dramatic outages a replication slot can cause.

```sql
-- PostgreSQL: check for slots that are falling behind
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots
ORDER BY retained_wal DESC;
```

> **Note:** Set `max_slot_wal_keep_size` (PostgreSQL 13+) to cap how much WAL a slot can retain. If a slot falls too far behind, the primary invalidates it rather than filling the disk. The replica will then need a full resync, but your primary stays up.

## Failover Gone Wrong

Promoting a replica to primary sounds straightforward — your orchestration tool issues the command, updates the DNS record, and traffic flows to the new leader. In practice, three things commonly go wrong:

**Split-brain.** If the old primary is merely partitioned (not dead), it may keep accepting writes while the promoted replica also accepts writes. Both nodes believe they are the leader. Writes diverge and there is no automatic way to merge them.

**Stale application connections.** Connection pools cache the primary's IP. After promotion, application servers keep sending writes to the old primary until their connections time out or they re-resolve DNS. Writes during this window are lost.

**Follower data loss at promotion.** In asynchronous replication, the elected replica may not have applied the last few transactions from the old primary. Those transactions are gone — they were never replicated.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Split-brain scenario: old primary and newly promoted replica both accept writes simultaneously">
  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
    <marker id="arr-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Old Primary (left) -->
  <rect x="40" y="60" width="160" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="120" y="86" font-size="14" fill="var(--text)" text-anchor="middle" font-weight="bold">Old Primary</text>
  <text x="120" y="106" font-size="12" fill="var(--accent)" text-anchor="middle">still accepting writes</text>

  <!-- Promoted Replica (right) -->
  <rect x="440" y="60" width="160" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="520" y="86" font-size="14" fill="var(--text)" text-anchor="middle" font-weight="bold">New Primary</text>
  <text x="520" y="106" font-size="12" fill="var(--accent)" text-anchor="middle">also accepting writes</text>

  <!-- Network partition barrier -->
  <line x1="310" y1="30" x2="310" y2="230" stroke="var(--accent)" stroke-width="3" stroke-dasharray="8 4"/>
  <text x="310" y="22" font-size="12" fill="var(--accent)" text-anchor="middle">network partition</text>

  <!-- Arrows: app writes to old primary -->
  <rect x="60" y="168" width="120" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="120" y="189" font-size="12" fill="var(--text)" text-anchor="middle">App (stale pool)</text>
  <line x1="120" y1="168" x2="120" y2="120" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr2)"/>

  <!-- Arrows: app writes to new primary -->
  <rect x="460" y="168" width="120" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="520" y="189" font-size="12" fill="var(--text)" text-anchor="middle">App (re-routed)</text>
  <line x1="520" y1="168" x2="520" y2="120" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr2)"/>

  <!-- Diverge label -->
  <text x="120" y="232" font-size="12" fill="var(--text)" text-anchor="middle">Write set A</text>
  <text x="520" y="232" font-size="12" fill="var(--text)" text-anchor="middle">Write set B</text>
  <text x="310" y="252" font-size="13" fill="var(--accent)" text-anchor="middle" font-weight="bold">diverged — no automatic merge</text>
</svg>
<figcaption>Split-brain: both nodes accept writes simultaneously during a partition. Reconciling the two diverged write sets requires manual intervention.</figcaption>
</figure>

**Mitigation strategies:**

- Use a **fencing token** or **STONITH** (Shoot The Other Node In The Head) to forcibly disable the old primary before the new one accepts writes.
- Route application traffic through a **proxy** (e.g., PgBouncer, ProxySQL, or HAProxy) rather than directly to host IPs. The proxy switches targets in one place.
- For zero data-loss failover, use **synchronous replication** on at least one replica so promotion is guaranteed to carry all committed transactions.

## Schema Migrations Under Replication

Deploying a schema change (DDL) on a replicated cluster is trickier than on a single node. A naive `ALTER TABLE` on the primary will replicate, but the window between applying it on the primary and applying it on replicas can break in-flight queries and replication itself.

Common patterns and their hazards:

| Migration approach | Risk |
|---|---|
| `ALTER TABLE … ADD COLUMN NOT NULL` without a default | Fails on older replicas that still hold rows without that column |
| Adding a column with a `DEFAULT` (pre-PG 11) | Rewrites the whole table; replica must replay a massive write; lag spikes |
| Dropping a column the application still reads | App errors between deploy and replica catchup |
| Renaming a column | Breaks replica SQL views and triggers referencing the old name |

The safe pattern for zero-downtime migrations is **expand–contract**:

1. **Expand** — add the new column (nullable, no default), deploy code that writes both old and new columns.
2. **Backfill** — populate the new column in small batches during off-peak hours.
3. **Contract** — once all replicas have caught up and backfill is complete, drop the old column in a separate deploy.

## Cascading Replica Chains

Some architectures create replica chains: Replica B replicates from Replica A, which replicates from the Primary. This reduces load on the primary but compounds lag and failure modes — a hiccup at Replica A freezes all of Replica A's downstream followers.

> **Note:** In MySQL, this topology is called **relay chains**. In PostgreSQL, cascading standby is supported but each hop adds latency. Monitor *every* hop, not just the primary's direct followers.

---

Use this widget to explore how a missing column (simulating a migration applied on the primary but not yet on the replica) causes query failures. The `orders_primary` table has the new `status` column; `orders_replica` does not yet.

<div class="widget" data-widget="sql"
  data-setup="CREATE TABLE orders_primary (id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL, status TEXT); INSERT INTO orders_primary VALUES (1, 7, 99.99, 'shipped'), (2, 7, 14.50, 'pending'), (3, 12, 200.00, 'shipped'); CREATE TABLE orders_replica (id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL); INSERT INTO orders_replica VALUES (1, 7, 99.99), (2, 7, 14.50), (3, 12, 200.00);">
-- The primary has a new 'status' column; the replica does not yet.
-- This query works on the primary:
SELECT id, amount, status FROM orders_primary WHERE customer_id = 7;

-- Try changing the table name to orders_replica and re-run.
-- The replica query will fail because 'status' does not exist there yet.
</div>

The gap between when a migration lands on the primary and when it fully propagates to all replicas is a real deployment risk. The expand–contract pattern closes that gap safely.
