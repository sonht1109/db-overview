When you read a value from a distributed database, how fresh is it? If a write just landed on one replica and your read hits a different one, you might get yesterday's answer. **Strong consistency** is the guarantee that eliminates this ambiguity: every read sees the most recently committed write, no matter which node you ask. It is the hardest guarantee a distributed database can offer — and understanding what it costs is essential before you can reason about any weaker alternative.

## What "Strong" Actually Means

Strong consistency is formally captured by a model called **linearizability** (also called *external consistency* or *atomic consistency*). The rule is simple to state: the system must behave as if every operation executes **instantly** at some single point in time between when the client sent the request and when it received the response.

This has a concrete consequence: once a write completes, *every* subsequent read — on *any* node — must return that written value or something newer. There is no window where a node can legitimately hand back a stale answer.

Compare the two timelines below:

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline comparing eventual consistency (stale read possible) with strong consistency (all reads see latest write)">
  <!-- Section labels -->
  <text x="10" y="20" font-size="13" font-weight="bold" fill="var(--text)">Eventual consistency</text>
  <text x="340" y="20" font-size="13" font-weight="bold" fill="var(--text)">Strong consistency (linearizable)</text>
  <line x1="320" y1="8" x2="320" y2="272" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>

  <!-- LEFT: eventual consistency -->
  <!-- Client writes to node A -->
  <text x="10" y="50" font-size="12" fill="var(--text)">Client</text>
  <line x1="50" y1="55" x2="50" y2="240" stroke="var(--border)" stroke-width="1.5"/>
  <text x="85" y="50" font-size="12" fill="var(--text)">Node A</text>
  <line x1="120" y1="55" x2="120" y2="240" stroke="var(--border)" stroke-width="1.5"/>
  <text x="185" y="50" font-size="12" fill="var(--text)">Node B</text>
  <line x1="220" y1="55" x2="220" y2="240" stroke="var(--border)" stroke-width="1.5"/>

  <!-- Write request: client → A -->
  <line x1="50" y1="75" x2="120" y2="90" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="55" y="73" font-size="11" fill="var(--text)">write x=9</text>
  <circle cx="120" cy="90" r="4" fill="var(--accent)"/>
  <!-- ACK back -->
  <line x1="120" y1="100" x2="50" y2="112" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="58" y="124" font-size="11" fill="var(--accent)">ack</text>

  <!-- Replication to B is async (delayed) -->
  <line x1="120" y1="130" x2="220" y2="190" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="135" y="157" font-size="11" fill="var(--border)">async repl</text>

  <!-- Client reads from B (before replication arrives) -->
  <line x1="50" y1="145" x2="220" y2="158" stroke="#e05c5c" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="55" y="142" font-size="11" fill="#e05c5c">read x</text>
  <!-- B returns stale value -->
  <line x1="220" y1="168" x2="50" y2="180" stroke="#e05c5c" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="58" y="192" font-size="11" fill="#e05c5c">x = 0  ← stale!</text>

  <!-- RIGHT: strong consistency -->
  <text x="350" y="50" font-size="12" fill="var(--text)">Client</text>
  <line x1="390" y1="55" x2="390" y2="240" stroke="var(--border)" stroke-width="1.5"/>
  <text x="420" y="50" font-size="12" fill="var(--text)">Node A</text>
  <line x1="455" y1="55" x2="455" y2="240" stroke="var(--border)" stroke-width="1.5"/>
  <text x="540" y="50" font-size="12" fill="var(--text)">Node B</text>
  <line x1="575" y1="55" x2="575" y2="240" stroke="var(--border)" stroke-width="1.5"/>

  <!-- Write request: client → A -->
  <line x1="390" y1="75" x2="455" y2="88" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="393" y="73" font-size="11" fill="var(--text)">write x=9</text>
  <circle cx="455" cy="88" r="4" fill="var(--accent)"/>

  <!-- A syncs to B before acking -->
  <line x1="455" y1="100" x2="575" y2="112" stroke="var(--accent)" stroke-width="1.5"/>
  <circle cx="575" cy="112" r="4" fill="var(--accent)"/>
  <!-- B acks A -->
  <line x1="575" y1="120" x2="455" y2="132" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/>
  <!-- A acks client -->
  <line x1="455" y1="140" x2="390" y2="152" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="393" y="164" font-size="11" fill="var(--accent)">ack (both replicas updated)</text>

  <!-- Client reads from B -->
  <line x1="390" y1="185" x2="575" y2="196" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="393" y="183" font-size="11" fill="var(--text)">read x</text>
  <!-- B returns fresh value -->
  <line x1="575" y1="206" x2="390" y2="218" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="395" y="230" font-size="11" fill="var(--accent)">x = 9  ← always fresh</text>

  <!-- Arrow marker definition -->
  <defs>
    <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)"/>
    </marker>
  </defs>
</svg>
<figcaption>Left: with eventual consistency, a read on Node B can return a stale value while replication is in-flight. Right: with strong consistency, the write is not acknowledged until all required replicas confirm it — so any subsequent read sees the new value.</figcaption>
</figure>

## How It Is Achieved

Strong consistency is not magic — it comes from coordination work that happens before the database says "your write succeeded." Three mechanisms are commonly combined:

### Synchronous replication

The primary node does not acknowledge a write until enough replicas have durably stored it. This is the opposite of "fire and forget" async replication. The write latency goes up because you are waiting for at least one full network round-trip to another machine, but you eliminate the window where replicas are out of sync.

### Consensus protocols

Real systems like **CockroachDB**, **Google Spanner**, and **YugabyteDB** use Raft or Multi-Paxos (covered in the previous chapter) to agree on a global order of writes before any of them are visible to readers. A write enters a replicated log; only after a majority of nodes have appended it is the write applied and acknowledged.

### Sticky or linearizable reads

Reads must also be coordinated — a client that always reads from a local replica might see an old log entry if that replica is lagging. Systems handle this by routing reads through the current leader, or by requiring the leader to confirm it is still leader (a **lease** or **read quorum**) before serving the read.

| Mechanism | What it prevents | Cost |
|---|---|---|
| Synchronous replication | Stale reads after a write | Write latency ↑ |
| Leader reads | Stale reads from lagging replicas | Scalability of reads ↓ |
| Consensus on write order | Conflicting concurrent writes | Coordination overhead |

## The CAP Trade-off

Strong consistency does not come for free. The **CAP theorem** (Brewer 2000, formalised by Gilbert and Lynch 2002) states that a distributed system can guarantee at most two of:

- **C**onsistency (every read returns the latest write)
- **A**vailability (every request gets a response)
- **P**artition tolerance (the system keeps working even if nodes cannot reach each other)

Because network partitions happen in any real cluster, every distributed database must choose between **CP** and **AP**:

- **CP (strongly consistent):** If a node cannot reach a quorum, it refuses to serve reads or writes rather than risk returning stale data. Examples: HBase, etcd, Zookeeper, CockroachDB (by default).
- **AP (highly available):** The system keeps answering requests even during a partition, accepting that some reads may be stale. Examples: Cassandra (with lower consistency levels), DynamoDB (with eventual consistency).

> **Note:** "Consistent" in CAP means linearizability — not the C in ACID, which is about constraint enforcement (see Chapter 10). These are different uses of the same word, and confusing them is one of the most common misunderstandings in distributed-systems conversations.

## The Real-World Cost

Strongly consistent reads and writes require at least **one network round-trip** between a majority of nodes before a result can be returned. In a cluster where nodes are co-located this might add 1–5 ms per operation. Across datacenters in different continents (like Spanner's global deployments), that round-trip can be 50–150 ms.

This is why many systems offer a spectrum rather than a binary choice:

```
Weakest ←─────────────────────────────────────────────→ Strongest
Eventual   Monotonic read   Session   Bounded staleness   Linearizable
```

Eventual consistency is fastest but offers the fewest guarantees. Linearizability is the gold standard but every operation pays coordination costs. The chapters that follow in this part cover where each weaker model sits and which guarantees it preserves.

Try the interactive example below to see how consistency levels map to concrete behaviour in Cassandra-style query syntax. The table simulates a write log across replicas so you can inspect what different quorum settings would return.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Consistency level simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE replica_log (replica TEXT, key TEXT, value INTEGER, written_at INTEGER); INSERT INTO replica_log VALUES ('node_a', 'balance', 500, 1); INSERT INTO replica_log VALUES ('node_b', 'balance', 500, 1); INSERT INTO replica_log VALUES ('node_c', 'balance', 500, 1); INSERT INTO replica_log VALUES ('node_a', 'balance', 750, 2); INSERT INTO replica_log VALUES ('node_b', 'balance', 750, 2); /* node_c did NOT yet receive the latest write (simulating async lag) */;">-- Which nodes have the latest value of 'balance'?
-- With a QUORUM read (any 2 of 3 nodes), do we see the new write?
SELECT replica, value, written_at
FROM replica_log
WHERE key = 'balance'
ORDER BY replica;

-- Uncomment to simulate a quorum read: pick the max value from any 2 nodes
-- SELECT MAX(value) AS quorum_read_result
-- FROM (
--   SELECT value FROM replica_log
--   WHERE key = 'balance'
--   ORDER BY written_at DESC
--   LIMIT 2
-- );
    </textarea>
  </div>
</div>

Notice that node_c still holds `balance = 500`. A quorum read (W=2 of 3 nodes) reaches node_a and node_b — both have the latest value, so a strongly consistent system returns `750`. An eventual-consistency read routed to node_c would silently return `500`. That single observable difference is what strong consistency prevents.

<details class="reveal"><summary>Reveal: Why does strong consistency also require coordinated reads, not just synchronous writes?</summary><div class="reveal-body">

A write might be synchronously replicated to a majority and acknowledged — but a replica that was briefly partitioned at that moment is now lagging. If you let clients read freely from any replica, a client routed to the lagging replica sees a value that predates the acknowledged write, violating linearizability. Strong consistency therefore requires that *reads* also go through a coordination step (leader routing, a read quorum, or a lease check) to confirm the replica is current before it responds.

</div></details>