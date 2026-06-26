Consensus algorithms — Paxos, Raft, and their relatives — are remarkable engineering achievements. They let a cluster of nodes agree on a single value even when some nodes crash or messages are delayed. But consensus is a precise tool with a narrow job description. Understanding what it *cannot* do is just as important as understanding what it can, because conflating the two leads to systems that feel safe but aren't.

## Consensus Solves Agreement, Not Correctness

Consensus guarantees that all nodes agree on the *same* value. It says nothing about whether that value is the *right* value.

Consider a distributed key-value store using Raft. When a leader receives a `PUT key=balance, value=500`, Raft faithfully replicates that write to a quorum of followers and confirms it committed. But if the application computed `500` by reading a stale snapshot — one that didn't reflect a concurrent withdrawal — then every replica now consistently stores the *wrong* balance.

> **Note:** Consensus is an agreement protocol, not a validation protocol. Garbage in, garbage out — replicated consistently across every node.

The implication is significant: **serializability and snapshot isolation must be enforced at the application or transaction layer, not inside the consensus layer**. Systems like Google Spanner layer a transaction manager (with 2-Phase Locking) on top of Paxos. The two concerns are separate.

## What Consensus Does Not Solve

### Performance at Scale

Consensus requires a quorum of nodes to exchange messages before any write is acknowledged. This means every committed write incurs at least one full network round-trip (often two), and throughput is bounded by the leader's ability to pipeline proposals.

| Concern | Consensus verdict |
|---|---|
| Fault-tolerant agreement | Solved (that's the whole point) |
| High write throughput | Not solved — quorum overhead applies to every write |
| Low read latency | Not solved — stale reads need explicit leases or quorum reads |
| Cross-partition transactions | Not solved — consensus is per-shard; spanning shards needs a separate protocol (e.g., 2PC) |

Horizontal write scaling typically requires **sharding**, not just consensus. Each shard may run its own Raft group, but adding shards doesn't reduce the per-shard latency cost.

### Cross-Partition Atomicity

A single Raft group commits changes atomically within one partition. But if a transfer debits Account A (shard 1) and credits Account B (shard 2), you need *two* separate consensus groups to both commit or both abort. Consensus alone gives you no mechanism for that coordination — you need Two-Phase Commit (2PC) or an equivalent protocol layered on top.

The diagram below shows the boundary:

<figure class="diagram">
<svg viewBox="0 0 620 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Consensus handles agreement within one shard; 2PC coordinates across shards">
  <!-- Shard 1 Raft group -->
  <rect x="30" y="40" width="240" height="180" rx="10" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="150" y="30" font-size="13" text-anchor="middle" fill="var(--text)" font-weight="bold">Shard 1 (Raft group)</text>
  <rect x="60" y="65" width="70" height="36" rx="6" fill="var(--accent)" opacity="0.85"/>
  <text x="95" y="88" font-size="12" text-anchor="middle" fill="#fff">Leader</text>
  <rect x="60" y="135" width="70" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="95" y="158" font-size="12" text-anchor="middle" fill="var(--text)">Follower</text>
  <rect x="160" y="135" width="70" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="195" y="158" font-size="12" text-anchor="middle" fill="var(--text)">Follower</text>
  <!-- arrows within shard 1 -->
  <line x1="95" y1="101" x2="95" y2="133" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr)"/>
  <line x1="120" y1="83" x2="165" y2="133" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="150" y="210" font-size="11" text-anchor="middle" fill="var(--text)" opacity="0.75">Consensus: ✓ agrees</text>
  <text x="150" y="225" font-size="11" text-anchor="middle" fill="var(--text)" opacity="0.75">within this shard</text>

  <!-- Shard 2 Raft group -->
  <rect x="350" y="40" width="240" height="180" rx="10" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="470" y="30" font-size="13" text-anchor="middle" fill="var(--text)" font-weight="bold">Shard 2 (Raft group)</text>
  <rect x="380" y="65" width="70" height="36" rx="6" fill="var(--accent)" opacity="0.85"/>
  <text x="415" y="88" font-size="12" text-anchor="middle" fill="#fff">Leader</text>
  <rect x="380" y="135" width="70" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="415" y="158" font-size="12" text-anchor="middle" fill="var(--text)">Follower</text>
  <rect x="480" y="135" width="70" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="515" y="158" font-size="12" text-anchor="middle" fill="var(--text)">Follower</text>
  <!-- arrows within shard 2 -->
  <line x1="415" y1="101" x2="415" y2="133" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr)"/>
  <line x1="440" y1="83" x2="485" y2="133" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="470" y="210" font-size="11" text-anchor="middle" fill="var(--text)" opacity="0.75">Consensus: ✓ agrees</text>
  <text x="470" y="225" font-size="11" text-anchor="middle" fill="var(--text)" opacity="0.75">within this shard</text>

  <!-- 2PC bridge -->
  <line x1="270" y1="115" x2="350" y2="115" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6,4" marker-end="url(#arr2)"/>
  <line x1="350" y1="125" x2="270" y2="125" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6,4" marker-end="url(#arr2)"/>
  <rect x="272" y="255" width="200" height="34" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="372" y="277" font-size="12" text-anchor="middle" fill="var(--text)">2PC coordinator (outside consensus)</text>

  <!-- arrowhead markers -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
</svg>
<figcaption>Raft provides agreement within each shard; a separate coordinator (e.g., 2PC) is needed to span shards atomically.</figcaption>
</figure>

### Availability Under Network Partition

By the CAP theorem, a consensus system that prioritizes **consistency** (CP) will refuse writes when it cannot reach a quorum. Raft elects no leader without a majority. During a partition, the minority partition is unavailable for writes — by design.

If your application needs to accept writes even during a split network, consensus is the wrong primitive. Eventually-consistent systems (like Dynamo-style databases) trade agreement for availability, using conflict resolution strategies instead.

### External Side Effects

Once a value is committed through consensus, you cannot un-commit it. If committing a log entry triggered an external side effect — sending an email, charging a credit card, calling a third-party API — consensus gives you no way to roll that back if the surrounding transaction later aborts. Idempotency and sagas are application-level concerns that consensus does not touch.

## A Useful Mental Model

Think of consensus as a **shared, fault-tolerant append-only log**. Any node can propose an entry; the cluster agrees on the order. That's it. Every property above that — serializability, cross-shard atomicity, availability during partitions, side-effect management — must be built on top of, or around, that log.

<details class="reveal"><summary>Reveal: Can a system use consensus AND be highly available?</summary><div class="reveal-body">

Yes, with caveats. Systems like CockroachDB and TiDB use Raft per-shard and achieve high *overall* availability by having many independent Raft groups — a partition only affects the shards whose majority nodes are separated. Individual shards still go unavailable if they lose quorum. So "highly available" here means the *cluster* rarely fully stops, not that *every shard* is always writable.

</div></details>

The practical takeaway: consensus is a powerful foundation, but it is not a complete distributed database. The layers above it — transaction management, isolation levels, cross-shard coordination, and application-level idempotency — are where most of the real engineering challenge lives.
