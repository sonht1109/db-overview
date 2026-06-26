When a transaction touches data on a single node, committing is straightforward — the node writes to its WAL and confirms. But what happens when one transaction updates rows on *multiple* nodes? If node A commits and node B crashes before it can, you end up with half a transaction: money deducted but not deposited, or an order created but inventory never decremented. **Two-phase commit (2PC)** is the classic protocol for making a distributed transaction atomic — all nodes commit, or none do.

## The Two Phases

2PC introduces a **coordinator** (usually the node that received the original query, or a dedicated transaction manager) that orchestrates all the **participant** nodes.

**Phase 1 — Prepare (Vote)**

The coordinator sends a `PREPARE` message to every participant. Each participant:
1. Flushes the transaction's changes to its local WAL (but does not commit yet).
2. Acquires all locks it will need.
3. Replies **YES** ("I am ready and can commit") or **NO** ("I cannot — abort").

Once a participant votes YES, it is making a promise: it *will* commit if asked, even if it crashes and restarts.

**Phase 2 — Commit or Abort**

- If **all** participants voted YES, the coordinator writes a commit record to its own WAL and sends `COMMIT` to everyone.
- If **any** participant voted NO (or timed out), the coordinator writes an abort record and sends `ROLLBACK` to everyone.

Each participant then applies the decision and releases its locks.

<figure class="diagram">
<svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two-phase commit timeline: coordinator sends PREPARE to two participants, both reply YES, coordinator sends COMMIT, both acknowledge">
  <defs>
    <marker id="arr2pc" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr2pc-b" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Column headers -->
  <text x="100" y="22" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text)">Coordinator</text>
  <text x="340" y="22" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text)">Participant A</text>
  <text x="560" y="22" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text)">Participant B</text>

  <!-- Vertical lifelines -->
  <line x1="100" y1="30" x2="100" y2="330" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,4"/>
  <line x1="340" y1="30" x2="340" y2="330" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,4"/>
  <line x1="560" y1="30" x2="560" y2="330" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,4"/>

  <!-- Phase 1 label -->
  <rect x="4" y="44" width="82" height="22" rx="4" fill="var(--accent)" opacity="0.18"/>
  <text x="45" y="59" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--accent)">Phase 1</text>

  <!-- PREPARE → A -->
  <line x1="104" y1="70" x2="332" y2="90" stroke="var(--accent)" stroke-width="1.8" marker-end="url(#arr2pc)"/>
  <text x="218" y="74" text-anchor="middle" font-size="12" fill="var(--accent)">PREPARE</text>

  <!-- PREPARE → B -->
  <line x1="104" y1="70" x2="552" y2="90" stroke="var(--accent)" stroke-width="1.8" marker-end="url(#arr2pc)"/>
  <text x="432" y="74" text-anchor="middle" font-size="12" fill="var(--accent)">PREPARE</text>

  <!-- Participant A: flush WAL box -->
  <rect x="272" y="96" width="136" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="340" y="112" text-anchor="middle" font-size="11" fill="var(--text)">flush WAL,</text>
  <text x="340" y="126" text-anchor="middle" font-size="11" fill="var(--text)">acquire locks</text>

  <!-- Participant B: flush WAL box -->
  <rect x="492" y="96" width="136" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="560" y="112" text-anchor="middle" font-size="11" fill="var(--text)">flush WAL,</text>
  <text x="560" y="126" text-anchor="middle" font-size="11" fill="var(--text)">acquire locks</text>

  <!-- YES ← A -->
  <line x1="336" y1="146" x2="108" y2="164" stroke="var(--border)" stroke-width="1.8" marker-end="url(#arr2pc-b)"/>
  <text x="218" y="150" text-anchor="middle" font-size="12" fill="var(--text)">YES (vote)</text>

  <!-- YES ← B -->
  <line x1="556" y1="146" x2="108" y2="164" stroke="var(--border)" stroke-width="1.8" marker-end="url(#arr2pc-b)"/>
  <text x="430" y="148" text-anchor="middle" font-size="12" fill="var(--text)">YES (vote)</text>

  <!-- Coordinator: write commit record -->
  <rect x="34" y="170" width="132" height="30" rx="5" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="100" y="190" text-anchor="middle" font-size="11" fill="var(--text)">write COMMIT to WAL</text>

  <!-- Phase 2 label -->
  <rect x="4" y="210" width="82" height="22" rx="4" fill="var(--accent)" opacity="0.18"/>
  <text x="45" y="225" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--accent)">Phase 2</text>

  <!-- COMMIT → A -->
  <line x1="104" y1="238" x2="332" y2="256" stroke="var(--accent)" stroke-width="1.8" marker-end="url(#arr2pc)"/>
  <text x="218" y="242" text-anchor="middle" font-size="12" fill="var(--accent)">COMMIT</text>

  <!-- COMMIT → B -->
  <line x1="104" y1="238" x2="552" y2="256" stroke="var(--accent)" stroke-width="1.8" marker-end="url(#arr2pc)"/>
  <text x="432" y="242" text-anchor="middle" font-size="12" fill="var(--accent)">COMMIT</text>

  <!-- ACK ← A -->
  <line x1="336" y1="276" x2="108" y2="294" stroke="var(--border)" stroke-width="1.8" marker-end="url(#arr2pc-b)"/>
  <text x="218" y="278" text-anchor="middle" font-size="12" fill="var(--text)">ACK</text>

  <!-- ACK ← B -->
  <line x1="556" y1="276" x2="108" y2="294" stroke="var(--border)" stroke-width="1.8" marker-end="url(#arr2pc-b)"/>
  <text x="432" y="278" text-anchor="middle" font-size="12" fill="var(--text)">ACK</text>

  <!-- Done box -->
  <rect x="34" y="300" width="132" height="26" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
  <text x="100" y="317" text-anchor="middle" font-size="11" fill="var(--text)">transaction complete</text>
</svg>
<figcaption>Happy-path two-phase commit: both participants vote YES, coordinator commits, all nodes apply and acknowledge.</figcaption>
</figure>

## Failure Scenarios

The protocol is designed so that a crash at any point leaves the system in a recoverable state — but with important caveats.

| Crash timing | Effect | Recovery |
|---|---|---|
| Participant crashes **before** voting | Coordinator times out, aborts | Safe — participant never promised anything |
| Participant crashes **after voting YES** | Coordinator still decides; participant reads the decision from the coordinator when it recovers | Participant is **blocked** until it can reach the coordinator |
| Coordinator crashes **after writing COMMIT** | Participants holding locks are stuck waiting | Coordinator replays its WAL on restart and resends COMMIT |
| Coordinator crashes **before writing any decision** | Coordinator aborts on restart; participants abort too | Safe — no decision was recorded |

The dangerous case is a **coordinator crash after some (but not all) participants were told to commit**. Participants who received COMMIT have already applied and released locks. Participants who haven't are stuck, holding locks and waiting. This is 2PC's well-known **blocking** problem: if the coordinator is down long enough, those participants cannot make progress unilaterally.

> **Note:** This is why 2PC is called a *blocking* protocol. Participants that have voted YES surrendered their autonomy — they must wait for the coordinator's final word. Three-phase commit (3PC) was designed to remove this blocking property, but it cannot tolerate network partitions and is rarely used in practice.

## What Databases Actually Do

Most relational databases support a variant of 2PC called **XA transactions** (from the X/Open DTP standard). A distributed transaction manager (the coordinator) drives multiple database connections through the prepare/commit cycle.

```sql
-- XA syntax (MySQL / PostgreSQL via JDBC):
XA START 'txn-42';
  UPDATE accounts SET balance = balance - 500 WHERE id = 1;
XA END 'txn-42';
XA PREPARE 'txn-42';   -- Phase 1: flush WAL, vote YES
-- ... coordinator checks all participants ...
XA COMMIT 'txn-42';    -- Phase 2: apply and release locks
```

PostgreSQL also supports a native `PREPARE TRANSACTION` / `COMMIT PREPARED` syntax for use by external transaction managers.

> **Note:** XA transactions carry significant overhead — extra WAL writes, prolonged lock holding, and extra network round-trips. For this reason, many modern distributed systems avoid 2PC in favour of **saga patterns** (break the transaction into compensatable steps) or **single-shard designs** (route related data to the same node so no cross-node coordination is needed).

## Tracking In-Doubt Transactions

When a coordinator failure leaves participants waiting, those transactions are called **in-doubt** (or "prepared but not committed"). Databases expose them so operators can intervene.

The widget below simulates querying a table that mimics PostgreSQL's `pg_prepared_xacts` view — real-world DBAs use this to spot stuck transactions and manually commit or roll them back after a coordinator outage.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · In-doubt transaction monitor</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE prepared_xacts (gid TEXT, prepared_at TEXT, owner TEXT, database TEXT, age_seconds INTEGER); INSERT INTO prepared_xacts VALUES ('txn-42', '2024-06-25 03:11:00', 'app_user', 'payments', 14400), ('txn-43', '2024-06-25 07:55:00', 'app_user', 'payments', 3), ('txn-99', '2024-06-24 22:00:00', 'etl_user', 'warehouse', 36000);">-- Find in-doubt (prepared but not committed) transactions
-- older than 60 seconds -- these likely need operator intervention.
SELECT
  gid,
  owner,
  database,
  age_seconds,
  CASE
    WHEN age_seconds > 3600 THEN 'CRITICAL - coordinator likely crashed'
    WHEN age_seconds > 60   THEN 'WARNING  - stale, investigate'
    ELSE                         'OK       - recently prepared'
  END AS status
FROM prepared_xacts
ORDER BY age_seconds DESC;</textarea>
  </div>
</div>
