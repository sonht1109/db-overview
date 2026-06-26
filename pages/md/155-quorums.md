When a database is spread across multiple nodes, any write or read must touch *some* of those nodes — but how many? Touching all of them is safe but slow; touching just one is fast but risky. **Quorums** give you a principled middle ground: a minimum count of nodes that must agree before an operation is considered complete, chosen so that any two quorums overlap, guaranteeing consistency without requiring unanimous agreement.

## The Core Idea: Majority Overlap

Imagine a cluster of **5 nodes** holding replicas of the same data. Define:

- **W** = write quorum — how many nodes must acknowledge a write before it succeeds.
- **R** = read quorum — how many nodes must respond to a read before you return the result.

The golden rule is:

> **W + R > N**
>
> where **N** is the total number of replicas. This ensures the read set and write set share at least one node, so a reader always sees the latest write.

A common choice with N = 5 is **W = 3, R = 3**. Any write touches 3 nodes; any subsequent read also touches 3 nodes. Because 3 + 3 = 6 > 5, at least one node must appear in both sets — that node carries the freshest value.

You can tune W and R to shift the trade-off:

| Configuration | Strength | Weakness |
|---|---|---|
| W = N, R = 1 | Reads are fast | Writes stall if any node is down |
| W = 1, R = N | Writes are fast | Reads are slow; loses safety if N−1 nodes lag |
| W = ⌈N/2⌉+1, R = ⌈N/2⌉+1 | Balanced; tolerates minority failures | Both reads and writes need majority |
| W = N−1, R = 2 | Reads nearly free | Writes expensive; still overlaps |

> **Note:** The quorum condition W + R > N is *necessary but not sufficient* for strong consistency. If clocks skew or the system allows concurrent conflicting writes, you still need per-key versioning (e.g., Lamport timestamps or vector clocks) to pick the winner.

## Visualizing the Overlap

The diagram below shows a 5-node cluster. A write reaches nodes 1–3 (blue); a subsequent read reaches nodes 3–5 (orange). Node 3 is in both sets — the overlap is guaranteed.

<figure class="diagram">
<svg viewBox="0 0 620 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Five-node quorum diagram showing write set (nodes 1-3) and read set (nodes 3-5) overlapping at node 3">
  <!-- Node circles -->
  <!-- Node 1 - write only -->
  <circle cx="80" cy="115" r="38" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="2"/>
  <text x="80" y="110" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Node 1</text>
  <text x="80" y="128" text-anchor="middle" font-size="11" fill="var(--text)">Write ✓</text>

  <!-- Node 2 - write only -->
  <circle cx="200" cy="115" r="38" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="2"/>
  <text x="200" y="110" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Node 2</text>
  <text x="200" y="128" text-anchor="middle" font-size="11" fill="var(--text)">Write ✓</text>

  <!-- Node 3 - OVERLAP -->
  <circle cx="320" cy="115" r="42" fill="var(--accent)" opacity="0.55" stroke="var(--border)" stroke-width="3"/>
  <text x="320" y="108" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Node 3</text>
  <text x="320" y="125" text-anchor="middle" font-size="11" fill="var(--text)">Write ✓</text>
  <text x="320" y="141" text-anchor="middle" font-size="11" fill="var(--text)">Read ✓</text>

  <!-- Node 4 - read only -->
  <circle cx="440" cy="115" r="38" fill="var(--border)" opacity="0.5" stroke="var(--border)" stroke-width="2"/>
  <text x="440" y="110" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Node 4</text>
  <text x="440" y="128" text-anchor="middle" font-size="11" fill="var(--text)">Read ✓</text>

  <!-- Node 5 - read only -->
  <circle cx="560" cy="115" r="38" fill="var(--border)" opacity="0.5" stroke="var(--border)" stroke-width="2"/>
  <text x="560" y="110" text-anchor="middle" font-size="14" fill="var(--text)" font-weight="bold">Node 5</text>
  <text x="560" y="128" text-anchor="middle" font-size="11" fill="var(--text)">Read ✓</text>

  <!-- Labels at top -->
  <rect x="30" y="20" width="240" height="28" rx="5" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="1"/>
  <text x="150" y="39" text-anchor="middle" font-size="13" fill="var(--accent)" font-weight="bold">Write quorum (W=3): nodes 1-3</text>

  <rect x="270" y="20" width="320" height="28" rx="5" fill="var(--border)" opacity="0.3" stroke="var(--border)" stroke-width="1"/>
  <text x="430" y="39" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Read quorum (R=3): nodes 3-5</text>

  <!-- Overlap label -->
  <text x="320" y="200" text-anchor="middle" font-size="12" fill="var(--text)" font-style="italic">Node 3 is the guaranteed overlap — it always has the latest write</text>
</svg>
<figcaption>W=3, R=3 on a 5-node cluster: the write and read quorums overlap at Node 3, ensuring consistency.</figcaption>
</figure>

## Fault Tolerance

A quorum-based system can continue operating as long as enough nodes remain alive to form a quorum. With N = 5 and W = R = 3, the system tolerates **2 node failures** — because 3 surviving nodes still form a valid quorum.

The general formula: a majority quorum (W = R = ⌈N/2⌉ + 1) tolerates up to **⌊(N−1)/2⌋** failures. This is why distributed databases often use odd replica counts (3, 5, 7) — they maximise fault tolerance per node added.

> **Note:** "Tolerates failures" means the system stays *available* and *consistent*. If too many nodes fail to form a quorum, the system should **refuse** the operation rather than silently return stale or split data. Systems like DynamoDB allow you to configure this trade-off explicitly.

## Quorums in Real Systems

Quorums appear throughout distributed databases, sometimes under different names:

- **Apache Cassandra** exposes `QUORUM`, `LOCAL_QUORUM`, and `ALL` consistency levels directly — you choose W and R per query.
- **Raft / Paxos consensus** (used by etcd, CockroachDB, TiKV) implicitly require majority quorums to elect a leader and commit log entries.
- **Amazon DynamoDB** uses quorum reads/writes across its replication group by default, with eventual consistency as an opt-in shortcut.

Try reasoning through the quorum math yourself before moving on.

<details class="reveal"><summary>Reveal: What is the minimum W for a 7-node cluster that must survive 2 simultaneous failures?</summary><div class="reveal-body">

With N = 7 and a need to survive 2 failures, you need at least **5 nodes alive** to form quorums. Set **W = 4, R = 4** (since 4 + 4 = 8 > 7, overlap is guaranteed). You could also use W = 5, R = 3 or other combinations as long as W + R > 7 and W > 2 (so writes always reach a majority of the 5 surviving nodes). The symmetric majority choice is W = R = 4.

</div></details>

The elegance of quorums is that they reduce a hard distributed-systems problem — "do all nodes agree?" — into a much simpler arithmetic constraint. As long as W + R > N holds, any read is guaranteed to intersect the latest write, and consistency is maintained even in the face of partial failures.
