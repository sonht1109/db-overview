In a single-node database, consistency is straightforward: write a value, read it back, and you get what you wrote. Distributed databases shatter that guarantee. When your data lives on multiple nodes spread across data centers — possibly on different continents — keeping every replica perfectly in sync at all times is either impossible or too expensive to be practical. **Eventual consistency** is the pragmatic answer: all replicas will agree *eventually*, but reads during the convergence window may return stale data.

## Why "eventual" and not "immediate"?

The CAP theorem (covered in Chapter 16) showed that a distributed system can guarantee at most two of: Consistency, Availability, and Partition Tolerance. Choosing availability and partition tolerance means relaxing strong consistency. But there is a spectrum between "always perfectly in sync" and "total chaos."

Eventual consistency says: **if no new writes occur, all replicas will converge to the same value in finite time.** It makes no promise about *how long* convergence takes, and it makes no promise that any given read will see the latest write.

> **Note:** "Eventual" is a minimum guarantee, not a maximum. Many systems that are *technically* eventually consistent converge in milliseconds under normal conditions. The gap between theory and practice is often smaller than you'd fear.

## A concrete timeline

The diagram below shows two replicas diverging after a write, then reconciling.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing write to Replica A, replication lag, then convergence with Replica B">
  <!-- timeline axis -->
  <line x1="60" y1="50" x2="600" y2="50" stroke="var(--border)" stroke-width="2"/>
  <text x="60" y="38" font-size="12" fill="var(--text)" text-anchor="middle">t=0</text>
  <text x="220" y="38" font-size="12" fill="var(--text)" text-anchor="middle">t=1</text>
  <text x="380" y="38" font-size="12" fill="var(--text)" text-anchor="middle">t=2</text>
  <text x="540" y="38" font-size="12" fill="var(--text)" text-anchor="middle">t=3</text>
  <!-- tick marks -->
  <line x1="60" y1="45" x2="60" y2="55" stroke="var(--border)" stroke-width="2"/>
  <line x1="220" y1="45" x2="220" y2="55" stroke="var(--border)" stroke-width="2"/>
  <line x1="380" y1="45" x2="380" y2="55" stroke="var(--border)" stroke-width="2"/>
  <line x1="540" y1="45" x2="540" y2="55" stroke="var(--border)" stroke-width="2"/>

  <!-- Replica A row -->
  <text x="30" y="105" font-size="13" fill="var(--text)" text-anchor="middle" font-weight="bold">A</text>
  <rect x="45" y="85" width="130" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="110" y="108" font-size="13" fill="var(--text)" text-anchor="middle">balance = 100</text>
  <!-- write event -->
  <circle cx="220" cy="50" r="7" fill="var(--accent)"/>
  <text x="220" y="76" font-size="11" fill="var(--accent)" text-anchor="middle">WRITE: 80</text>
  <rect x="205" y="85" width="130" height="36" rx="6" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)"/>
  <text x="270" y="108" font-size="13" fill="var(--text)" text-anchor="middle">balance = 80</text>
  <rect x="365" y="85" width="130" height="36" rx="6" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)"/>
  <text x="430" y="108" font-size="13" fill="var(--text)" text-anchor="middle">balance = 80</text>
  <rect x="525" y="85" width="70" height="36" rx="6" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)"/>
  <text x="560" y="108" font-size="13" fill="var(--text)" text-anchor="middle">= 80</text>

  <!-- Replica B row -->
  <text x="30" y="185" font-size="13" fill="var(--text)" text-anchor="middle" font-weight="bold">B</text>
  <rect x="45" y="165" width="130" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
  <text x="110" y="188" font-size="13" fill="var(--text)" text-anchor="middle">balance = 100</text>
  <!-- B still stale at t=1 -->
  <rect x="205" y="165" width="130" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-dasharray="5,3"/>
  <text x="270" y="188" font-size="13" fill="var(--text)" text-anchor="middle">balance = 100</text>
  <text x="270" y="205" font-size="10" fill="var(--text)" fill-opacity="0.6" text-anchor="middle">(stale read)</text>
  <!-- replication arrives at t=2 -->
  <line x1="380" y1="123" x2="380" y2="163" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arr)"/>
  <text x="390" y="148" font-size="11" fill="var(--accent)">replicate</text>
  <rect x="365" y="165" width="130" height="36" rx="6" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)"/>
  <text x="430" y="188" font-size="13" fill="var(--text)" text-anchor="middle">balance = 80</text>
  <rect x="525" y="165" width="70" height="36" rx="6" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)"/>
  <text x="560" y="188" font-size="13" fill="var(--text)" text-anchor="middle">= 80</text>

  <!-- converged label -->
  <text x="560" y="235" font-size="12" fill="var(--accent)" text-anchor="middle" font-weight="bold">Converged</text>
  <line x1="525" y1="121" x2="525" y2="163" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>

  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)"/>
    </marker>
  </defs>
</svg>
<figcaption>Replica B briefly serves stale data (balance=100) after the write lands on Replica A; once replication arrives at t=2 both replicas converge.</figcaption>
</figure>

## Real-world patterns that use eventual consistency

Most large-scale systems accept eventual consistency for certain workloads while using stronger guarantees only where needed.

| System / Use case | Why eventual consistency is acceptable |
|---|---|
| DNS propagation | A stale IP record causes a temporary miss, not data corruption |
| Shopping cart totals | Slightly stale subtotals are fine; inventory check happens at checkout |
| Social media likes/views | Off-by-a-few is invisible to users |
| Cassandra (tunable) | Wide-area replication with low-latency writes trumps perfect sync |
| DynamoDB (default reads) | Eventual reads are cheaper; use strongly-consistent reads only when needed |

Notice the pattern: eventual consistency shines when **the cost of a stale read is low** and **the cost of coordination is high**.

## Conflicts: when replicas disagree

If two clients write to the same key on two different replicas before replication has a chance to sync, both replicas accept the write. Now the system has **conflicting versions**. Eventually consistent systems use one of several strategies to resolve this:

- **Last-Write-Wins (LWW):** each write carries a timestamp; the higher timestamp survives. Simple, but can silently drop data if clocks drift.
- **Version vectors / vector clocks:** each replica tracks a logical counter. The system can detect *that* a conflict happened and surface it to the application for resolution.
- **CRDTs (Conflict-free Replicated Data Types):** data structures (counters, sets, maps) designed so that any merge order produces the same result — no human resolution needed.

> **Note:** Last-Write-Wins is the default in many systems (Cassandra, DynamoDB) because it requires no extra bookkeeping. Use it only when losing a concurrent write is acceptable — which rules out financial balances, stock levels, and most counters.

## Seeing eventual consistency in SQLite (simulated)

SQLite is a single-node engine so it is always strongly consistent — but you can *simulate* a replication lag by modeling two replicas as separate tables and applying writes asynchronously. Try this exercise to see how a stale read can slip through before replication catches up.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Simulating stale reads</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE replica_a (key TEXT PRIMARY KEY, value INTEGER, updated_at INTEGER); CREATE TABLE replica_b (key TEXT PRIMARY KEY, value INTEGER, updated_at INTEGER); INSERT INTO replica_a VALUES ('balance', 100, 1); INSERT INTO replica_b VALUES ('balance', 100, 1); /* Simulate a write that reached replica_a but NOT yet replica_b */ UPDATE replica_a SET value = 80, updated_at = 2 WHERE key = 'balance';">
-- Read from both replicas right after the write.
-- Replica B hasn't synced yet, so it returns stale data.
SELECT 'replica_a' AS replica, value, updated_at FROM replica_a WHERE key = 'balance'
UNION ALL
SELECT 'replica_b' AS replica, value, updated_at FROM replica_b WHERE key = 'balance';
</textarea>
  </div>
</div>

Now try manually "applying" the replication to Replica B and re-running the SELECT:

```sql
-- Replication arrives: bring replica_b up to date
UPDATE replica_b SET value = 80, updated_at = 2 WHERE key = 'balance';

-- Both replicas now agree — converged!
SELECT 'replica_a' AS replica, value FROM replica_a WHERE key = 'balance'
UNION ALL
SELECT 'replica_b' AS replica, value FROM replica_b WHERE key = 'balance';
```

This toy example mirrors what a real replication pipeline does: the write journal from the primary is replayed on each replica until all copies converge.

## Key takeaways

- Eventual consistency trades **perfect synchrony for availability and performance**.
- Stale reads are a feature, not a bug — when the workload can tolerate them.
- Conflict resolution strategy is a critical design decision; LWW, vector clocks, and CRDTs each have distinct tradeoffs.
- Many systems make consistency *tunable* per operation — you can opt into a stronger guarantee only where you need it.
