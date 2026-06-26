Running a database on a single machine is a well-understood problem. You tune your indexes, optimize your queries, and add more RAM when things slow down. The moment you distribute data across multiple machines, though, a new class of constraints appears — constraints that don't come from hardware limits or bad SQL, but from the fundamental physics of networked systems. Understanding these tradeoffs is the foundation for every design decision in distributed databases.

## The Three Pressures: Consistency, Availability, Partition Tolerance

In 2000, Eric Brewer observed that distributed systems face three desirable properties, and — as formally proven by Gilbert and Lynch in 2002 — **no system can guarantee all three simultaneously** when a network partition occurs. This is the CAP theorem.

| Property | What it means | Example guarantee |
|---|---|---|
| **Consistency (C)** | Every read sees the most recent write (or an error) | All nodes agree on the current account balance |
| **Availability (A)** | Every request gets a response — no timeouts, no errors | The system answers even if some nodes are down |
| **Partition tolerance (P)** | The system keeps working even when network messages are lost or delayed | The cluster survives a broken network link between data centers |

The catch: **partition tolerance is not optional**. Networks do drop packets and split clusters — that's the real world. So every practical distributed database must choose between C and A when a partition occurs:

- **CP systems** (e.g., HBase, etcd, Zookeeper) refuse to answer rather than return stale data. During a partition they become unavailable to preserve consistency.
- **AP systems** (e.g., Cassandra, DynamoDB in eventual-consistency mode) keep answering but may return data that isn't yet fully up to date. They stay available and reconcile divergence later.

> **Note:** CAP is often oversimplified. Real systems don't sit neatly in one bucket — most offer tunable behavior. Cassandra's consistency level (`ONE`, `QUORUM`, `ALL`) lets you slide along the CP–AP spectrum per query. Think of CAP as a map of the territory, not a rigid classification.

<figure class="diagram">
<svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CAP theorem triangle showing three vertices: Consistency, Availability, and Partition Tolerance, with example databases placed between each pair">
  <!-- Triangle -->
  <polygon points="310,30 570,260 50,260" fill="none" stroke="var(--border)" stroke-width="2"/>

  <!-- Vertex labels -->
  <text x="310" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--accent)">Consistency</text>
  <text x="310" y="34" text-anchor="middle" font-size="11" fill="var(--text)">(every read = latest write)</text>

  <text x="582" y="258" text-anchor="start" font-size="14" font-weight="bold" fill="var(--accent)">Availability</text>
  <text x="582" y="272" text-anchor="start" font-size="11" fill="var(--text)">(always responds)</text>

  <text x="38" y="258" text-anchor="end" font-size="14" font-weight="bold" fill="var(--accent)">Partition</text>
  <text x="38" y="272" text-anchor="end" font-size="14" font-weight="bold" fill="var(--accent)">Tolerance</text>
  <text x="38" y="286" text-anchor="end" font-size="11" fill="var(--text)">(survives splits)</text>

  <!-- CP zone label -->
  <text x="178" y="130" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">CP</text>
  <text x="178" y="145" text-anchor="middle" font-size="11" fill="var(--text)">etcd, HBase</text>
  <text x="178" y="159" text-anchor="middle" font-size="11" fill="var(--text)">Zookeeper</text>

  <!-- AP zone label -->
  <text x="442" y="130" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">AP</text>
  <text x="442" y="145" text-anchor="middle" font-size="11" fill="var(--text)">Cassandra, DynamoDB</text>
  <text x="442" y="159" text-anchor="middle" font-size="11" fill="var(--text)">(eventual consistency)</text>

  <!-- CA zone label (impossible in practice) -->
  <text x="310" y="230" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">CA (single-node only)</text>
  <text x="310" y="245" text-anchor="middle" font-size="11" fill="var(--text)">PostgreSQL, MySQL</text>
  <text x="310" y="259" text-anchor="middle" font-size="11" fill="var(--text)">(not partition-tolerant by design)</text>

  <!-- "Must pick one side" arrow during partition -->
  <line x1="310" y1="55" x2="310" y2="195" stroke="var(--border)" stroke-width="1" stroke-dasharray="5,3"/>
  <text x="315" y="135" font-size="10" fill="var(--text)">partition</text>
  <text x="315" y="147" font-size="10" fill="var(--text)">occurs →</text>
  <text x="315" y="159" font-size="10" fill="var(--text)">pick C or A</text>
</svg>
<figcaption>The CAP triangle: distributed systems must pick two of three. Since partitions are unavoidable, the real choice is between consistency and availability during a split.</figcaption>
</figure>

## Latency vs. Throughput at Scale

Scaling out adds a second pressure that CAP doesn't fully capture: **latency**. On one machine, a write commits and is immediately visible to the next read — the two operations share the same memory bus. Across machines they communicate over a network, and that changes the math dramatically.

| Operation | Single machine | Same data center (LAN) | Cross data center (WAN) |
|---|---|---|---|
| Memory read | ~100 ns | — | — |
| Disk read (SSD) | ~100 µs | — | — |
| Network round-trip | — | ~0.5 ms | 30–150 ms |
| Synchronous replication | ~1 ms | ~2–5 ms | 30–150 ms per write |

Synchronous replication — waiting for every replica to confirm a write before acknowledging the client — guarantees consistency but adds latency proportional to the slowest replica. **Asynchronous replication** acknowledges the client immediately and propagates the write in the background, keeping latency low but leaving a window where replicas can diverge.

This is the core distributed latency trade-off: **strong consistency costs time; low latency risks staleness**.

## The Quorum Shortcut

Most production systems don't choose between "wait for all replicas" and "wait for none." They use a **quorum**: wait for a majority to confirm, then return. With a replication factor of 3 (three copies of every piece of data), the rules are:

- **W = 2** — a write is confirmed once 2 of 3 replicas acknowledge it.
- **R = 2** — a read consults 2 of 3 replicas and returns the newest value.
- **W + R > N** (2 + 2 > 3) — because write and read sets must overlap, at least one replica in every read has seen every confirmed write.

This gives you consistency without requiring all nodes. The surviving node that missed a write will receive it during anti-entropy (background reconciliation). You tolerate one replica failure with no impact on reads or writes.

<details class="reveal"><summary>Reveal: What happens if W + R ≤ N?</summary><div class="reveal-body">

If write and read quorums don't overlap, it's possible to read from replicas that haven't yet received a recent write — you get **stale reads** even though the write was "confirmed." For example, with N=3, W=1, R=1: a write goes to replica 1, a subsequent read hits replica 2, which hasn't gotten the write yet. The reader sees old data. This is the intended behavior of eventual-consistency (AP) configurations — you trade freshness for speed.

</div></details>

## Operational Complexity: The Hidden Cost

Beyond CAP and latency, distributing a database introduces a third class of tradeoffs that are easy to underestimate: **operational complexity**. A single-node database has one failure mode (it's down or it's up). A distributed database has many:

- Which node is authoritative for a key right now?
- How do you add a node without downtime?
- How do you handle a network split that lasted 90 seconds — which writes from each side win?
- How do you debug a query that touches 12 shards and one of them returned an error?

Every guarantee that was "free" on one machine — serializability, a single clock, a single write-ahead log — becomes a protocol that must be designed, implemented, tested, and operated. This is why the first rule of distributed systems is: **don't distribute until you must**. Vertical scaling (bigger machine) stays simpler longer than most people expect, and sharding or replication should only appear when a single machine genuinely cannot meet your requirements.

Try the query below to explore how quorum math works across different replication configurations.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Quorum calculator</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE configs (label TEXT, N INTEGER, W INTEGER, R INTEGER); INSERT INTO configs VALUES ('Weak (AP)', 3, 1, 1); INSERT INTO configs VALUES ('Quorum (balanced)', 3, 2, 2); INSERT INTO configs VALUES ('Strong (CP)', 3, 3, 2); INSERT INTO configs VALUES ('High-write (5 replicas)', 5, 3, 3); INSERT INTO configs VALUES ('Read-heavy (5 replicas)', 5, 2, 4);">-- For each config, compute whether it guarantees consistency (W+R > N)
-- and how many node failures it can tolerate for writes and reads.
SELECT
  label,
  N,
  W,
  R,
  W + R AS w_plus_r,
  CASE WHEN W + R > N THEN 'YES' ELSE 'NO (eventual)' END AS consistent,
  W - 1 AS write_fault_tolerance,
  R - 1 AS read_fault_tolerance
FROM configs
ORDER BY N, W;</textarea>
  </div>
</div>

Edit the `W` and `R` values in the setup, or add your own row, to see how consistency and fault-tolerance shift. Notice that you can never get both `write_fault_tolerance` and `read_fault_tolerance` to be as high as `N - 1` at the same time — that's CAP and quorum math in action.
