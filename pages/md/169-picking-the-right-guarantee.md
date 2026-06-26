By now you have a toolbox of consistency guarantees — linearizability, causal consistency, read-your-writes, eventual consistency, and more. The hard part is not understanding them individually; it is knowing which one to reach for when you sit down to design a real system. This page builds a practical decision framework.

## The Core Tradeoff: What Are You Paying?

Every stronger consistency guarantee costs you something. The two main currencies are **latency** and **availability**.

- **Latency:** Stronger guarantees require coordination between nodes (waiting for acknowledgments, running consensus rounds). Every extra round-trip adds milliseconds.
- **Availability:** If a node or network link goes down, strongly consistent systems may refuse reads and writes rather than risk returning stale or split data. Weaker systems can keep serving requests from whichever nodes are reachable.

This is the heart of the CAP theorem and its more nuanced successor PACELC: you are always trading between these forces. There is no free lunch.

## A Taxonomy of Guarantees (Weakest to Strongest)

| Guarantee | What it promises | Typical cost |
|---|---|---|
| **Eventual consistency** | All replicas converge *eventually*; no ordering guarantee | Lowest latency, highest availability |
| **Monotonic reads** | Once you read a value, you never see an older one | Slight: route reads to same replica or epoch |
| **Read-your-writes** | You always see your own writes | Low: session affinity or sticky routing |
| **Causal consistency** | Causally related ops appear in order to all readers | Medium: vector-clock tracking overhead |
| **Snapshot isolation** | Reads see a consistent point-in-time snapshot | Medium: MVCC storage overhead |
| **Linearizability** | Every op appears instantaneous on a global timeline | High: consensus round per write |
| **Serializability** | Transactions appear to execute one-at-a-time | High: locking or OCC validation |

> **Note:** "Serializability" is the gold standard for transactions; "linearizability" is the gold standard for single-key operations. Databases that offer both (e.g., Google Spanner's "external consistency") are the strongest category but also the most expensive to operate.

## A Decision Framework

The right guarantee depends on three questions:

1. **Can users tolerate seeing stale data — even briefly?** Shopping cart contents, social media feeds, DNS lookups: yes. Bank balances, inventory counts, seat reservations: generally no.
2. **Do operations have causal dependencies?** A comment that replies to a post must be seen after the post. If operations are independent (e.g., per-user settings), causality enforcement is wasted effort.
3. **Is the operation a single key or a multi-key transaction?** Single-key ops can often get away with lighter guarantees than multi-key updates that must be atomic together.

<figure class="diagram">
<svg viewBox="0 0 640 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flowchart for picking a consistency guarantee">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
    <marker id="arr-acc" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Root question -->
  <rect x="180" y="10" width="280" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="30" text-anchor="middle" font-size="13" fill="var(--text)">Can users tolerate stale data?</text>
  <text x="320" y="48" text-anchor="middle" font-size="12" fill="var(--text)" opacity="0.7">(briefly / eventually)</text>

  <!-- YES branch -->
  <line x1="220" y1="58" x2="100" y2="120" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="140" y="100" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">Yes</text>

  <!-- NO branch -->
  <line x1="420" y1="58" x2="540" y2="120" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="500" y="100" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">No</text>

  <!-- Left subtree: stale OK -->
  <rect x="20" y="120" width="200" height="44" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="120" y="138" text-anchor="middle" font-size="13" fill="var(--text)">Are ops causally</text>
  <text x="120" y="155" text-anchor="middle" font-size="13" fill="var(--text)">related?</text>

  <!-- Left-left: not causal -->
  <line x1="60" y1="164" x2="40" y2="228" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="36" y="205" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">No</text>

  <rect x="0" y="228" width="150" height="44" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="75" y="246" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Eventual</text>
  <text x="75" y="263" text-anchor="middle" font-size="12" fill="var(--text)">consistency</text>

  <!-- Left-right: causal -->
  <line x1="170" y1="164" x2="200" y2="228" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="206" y="205" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">Yes</text>

  <rect x="145" y="228" width="150" height="44" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="220" y="246" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Causal</text>
  <text x="220" y="263" text-anchor="middle" font-size="12" fill="var(--text)">consistency</text>

  <!-- Right subtree: stale NOT ok -->
  <rect x="420" y="120" width="200" height="44" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="520" y="138" text-anchor="middle" font-size="13" fill="var(--text)">Multi-key transaction</text>
  <text x="520" y="155" text-anchor="middle" font-size="13" fill="var(--text)">needed?</text>

  <!-- Right-left: single key -->
  <line x1="460" y1="164" x2="400" y2="228" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="410" y="205" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">No</text>

  <rect x="320" y="228" width="150" height="44" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="395" y="246" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Linearizable</text>
  <text x="395" y="263" text-anchor="middle" font-size="12" fill="var(--text)">(single-key)</text>

  <!-- Right-right: multi-key -->
  <line x1="580" y1="164" x2="590" y2="228" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="606" y="205" text-anchor="middle" font-size="12" fill="var(--accent)" font-weight="bold">Yes</text>

  <rect x="480" y="228" width="155" height="44" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="557" y="246" text-anchor="middle" font-size="13" fill="var(--text)" font-weight="bold">Serializable</text>
  <text x="557" y="263" text-anchor="middle" font-size="12" fill="var(--text)">transactions</text>

  <!-- Example labels below -->
  <text x="75" y="310" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">e.g. DNS, feeds,</text>
  <text x="75" y="325" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">analytics</text>

  <text x="220" y="310" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">e.g. chat threads,</text>
  <text x="220" y="325" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">collaborative docs</text>

  <text x="395" y="310" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">e.g. counters,</text>
  <text x="395" y="325" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">single-row locks</text>

  <text x="557" y="310" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">e.g. transfers,</text>
  <text x="557" y="325" text-anchor="middle" font-size="11" fill="var(--text)" opacity="0.65">seat reservations</text>
</svg>
<figcaption>Decision flowchart: answer three questions to land on the right consistency guarantee.</figcaption>
</figure>

## Mixing Guarantees in One System

Real applications rarely pick one guarantee for everything. A common pattern is **tiered consistency**:

- Use **serializable transactions** for the checkout flow (money, inventory).
- Use **read-your-writes** for the user's own profile and order history.
- Use **eventual consistency** for product recommendations and review counts.

Most distributed databases let you dial this per operation. DynamoDB lets you choose between eventually consistent and strongly consistent reads per request. Cassandra exposes consistency levels (`ONE`, `QUORUM`, `ALL`) on each query. CockroachDB defaults to serializable but lets read-only transactions relax to follower reads.

The mistake to avoid is **defaulting to the strongest guarantee everywhere**. Serializable distributed transactions require consensus, which means network round-trips on every write. At scale, that latency compounds. Using eventual consistency where correctness genuinely allows it is not cutting corners — it is engineering.

Try exploring how isolation levels affect what concurrent transactions can see. This SQLite example simulates two transactions racing to update the same counter:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Consistency tradeoffs</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, balance INTEGER NOT NULL); INSERT INTO accounts VALUES (1, 'Alice', 1000); INSERT INTO accounts VALUES (2, 'Bob', 500); CREATE TABLE audit_log (ts TEXT, action TEXT, amount INTEGER, balance_after INTEGER); INSERT INTO audit_log VALUES ('09:00', 'deposit', 200, 1200); INSERT INTO audit_log VALUES ('09:01', 'withdraw', 300, 900); INSERT INTO audit_log VALUES ('09:02', 'transfer_out', 100, 800);">-- See both accounts and the full audit trail
SELECT a.owner, a.balance,
       COUNT(l.action)  AS log_entries,
       SUM(l.amount)    AS total_moved
FROM accounts a
LEFT JOIN audit_log l ON a.id = 1   -- all log rows tied to Alice for demo
WHERE a.id = 1
GROUP BY a.owner, a.balance;

-- Try: what happens if two writers both read balance=800
-- and each subtract 100 without coordination?
-- Both see 800, both write 700 — one update is lost.
-- Strong consistency (serializable) prevents this by
-- serializing the two reads-then-writes.</textarea>
  </div>
</div>

<details class="reveal"><summary>Reveal: Which guarantee prevents the lost-update shown above?</summary><div class="reveal-body">

**Serializable isolation** (or at minimum **repeatable read** with a compare-and-swap) prevents the lost update. Under serializability, the two concurrent transactions are ordered: the second one either waits for the first to commit and then reads the updated balance, or it detects the conflict and aborts. Under **read committed** or **eventual consistency**, both transactions can read the same stale balance and overwrite each other — one update disappears.

</div></details>

## Practical Checklist

Before choosing a consistency level, answer these:

- [ ] **What is the worst-case user impact of a stale read?** Annoying (show it stale) or catastrophic (double-spend)?
- [ ] **How often do concurrent writers touch the same data?** Low contention? Lighter guarantees are safer to use. High contention? Conflicts will happen; you need a strategy.
- [ ] **What is your read/write ratio?** Read-heavy workloads benefit most from eventual consistency and replica reads; write-heavy workloads pay the coordination cost either way.
- [ ] **Can you use application-level idempotency to compensate?** Retrying a payment is safer if the payment is idempotent (keyed on a client-generated ID). That lets you use at-least-once delivery with weaker guarantees without double-charging.

Picking the right guarantee is not a one-time decision. It is a recurring conversation between correctness requirements and performance constraints — one you will revisit as your system grows.
