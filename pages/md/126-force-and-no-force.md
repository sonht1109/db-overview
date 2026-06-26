When a transaction commits, the database faces an immediate decision: must it flush every dirty page to disk *right now*, or can it leave those pages in the buffer pool and write them later? That single choice — **force** vs **no-force** — has enormous consequences for performance and for how much recovery work is required after a crash. It is the counterpart to the steal/no-steal decision (which governs *when* dirty pages of uncommitted transactions can be evicted), and together the two policies define the shape of the entire recovery system.

## Force vs No-Force: The Core Trade-off

**Force** means: before returning "COMMIT OK" to the client, the database synchronously writes every page modified by the committing transaction to disk. After the write, recovery needs no redo at all — anything committed is guaranteed to be on disk.

**No-force** means: commit is acknowledged once the log record is durable, but the dirty data pages may remain in the buffer pool indefinitely. Pages drift to disk later — when the buffer pool needs space, during a checkpoint, or at the scheduler's convenience.

| Policy | Dirty pages flushed at commit? | Effect on commits | Effect on recovery |
|---|---|---|---|
| **Force** | Yes — synchronously | Slow (random I/O per page) | No redo needed |
| **No-force** | No — whenever convenient | Fast (commit = log flush only) | Redo required for committed pages not yet on disk |

> **Note:** The WAL (write-ahead log) always has its *log records* flushed to disk at commit under both policies. The difference is whether the *data pages* themselves are also flushed. The log is sequential and cheap; random page flushes are expensive.

### Why No-Force Wins in Practice

Almost every production database — PostgreSQL, MySQL/InnoDB, SQL Server, Oracle — uses **no-force**. The reason is I/O efficiency. A single page may be modified by dozens of transactions in the buffer pool before it is ever written to disk. Under force, each of those commits triggers a separate random write to the same disk location. Under no-force, the buffer pool absorbs all those updates and the page is written once — a massive reduction in write amplification.

The trade-off is redo work at recovery. But redo is fast and deterministic: the engine replays the log sequentially from the last checkpoint. For most workloads this is far cheaper than slowing every commit with synchronous page flushes.

## Visualising the Difference

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Side-by-side comparison of force versus no-force commit paths showing buffer pool, log, and disk">
  <!-- Background -->
  <rect x="0" y="0" width="640" height="310" fill="var(--surface-2)" rx="8"/>

  <!-- Title -->
  <text x="320" y="26" font-size="13" fill="var(--text)" font-weight="bold" text-anchor="middle">Commit under FORCE vs NO-FORCE</text>

  <!-- ── FORCE side (left) ── -->
  <text x="160" y="52" font-size="13" fill="var(--accent)" font-weight="bold" text-anchor="middle">FORCE</text>

  <!-- Buffer Pool box -->
  <rect x="60" y="68" width="200" height="46" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="160" y="86" font-size="12" fill="var(--text)" text-anchor="middle">Buffer Pool</text>
  <text x="160" y="103" font-size="11" fill="var(--text)" text-anchor="middle">dirty pages: P3, P7, P12</text>

  <!-- Log box -->
  <rect x="60" y="140" width="200" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="160" y="163" font-size="12" fill="var(--text)" text-anchor="middle">WAL — COMMIT record flushed</text>

  <!-- Disk box -->
  <rect x="60" y="204" width="200" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="160" y="227" font-size="12" fill="var(--text)" text-anchor="middle">Disk — P3, P7, P12 written now</text>

  <!-- Arrows force side -->
  <!-- log flush arrow -->
  <line x1="160" y1="114" x2="160" y2="138" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,2"/>
  <polygon points="155,135 160,141 165,135" fill="var(--accent)"/>
  <!-- page flush arrow -->
  <line x1="160" y1="176" x2="160" y2="202" stroke="var(--accent)" stroke-width="1.5"/>
  <polygon points="155,199 160,205 165,199" fill="var(--accent)"/>
  <!-- Label page flush -->
  <text x="185" y="194" font-size="11" fill="var(--accent)">sync flush</text>

  <!-- Recovery note -->
  <rect x="72" y="252" width="176" height="36" rx="5" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="160" y="267" font-size="11" fill="var(--text)" text-anchor="middle">Recovery: no redo needed</text>
  <text x="160" y="281" font-size="11" fill="var(--accent)" text-anchor="middle">Committed = on disk</text>

  <!-- ── NO-FORCE side (right) ── -->
  <text x="480" y="52" font-size="13" fill="var(--accent)" font-weight="bold" text-anchor="middle">NO-FORCE</text>

  <!-- Buffer Pool box -->
  <rect x="380" y="68" width="200" height="46" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="480" y="86" font-size="12" fill="var(--text)" text-anchor="middle">Buffer Pool</text>
  <text x="480" y="103" font-size="11" fill="var(--text)" text-anchor="middle">dirty pages: P3, P7, P12 (stay)</text>

  <!-- Log box -->
  <rect x="380" y="140" width="200" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="480" y="163" font-size="12" fill="var(--text)" text-anchor="middle">WAL — COMMIT record flushed</text>

  <!-- Disk box -->
  <rect x="380" y="204" width="200" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="480" y="221" font-size="12" fill="var(--text)" text-anchor="middle">Disk — pages written lazily</text>
  <text x="480" y="235" font-size="11" fill="var(--text)" text-anchor="middle">(checkpoint / eviction)</text>

  <!-- Arrows no-force side -->
  <!-- log flush arrow -->
  <line x1="480" y1="114" x2="480" y2="138" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,2"/>
  <polygon points="475,135 480,141 485,135" fill="var(--accent)"/>
  <!-- No sync page flush — dashed lighter arrow -->
  <line x1="480" y1="176" x2="480" y2="202" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="6,4"/>
  <polygon points="475,199 480,205 485,199" fill="var(--border)"/>
  <text x="505" y="194" font-size="11" fill="var(--text)">async</text>

  <!-- Recovery note -->
  <rect x="392" y="252" width="176" height="36" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="480" y="267" font-size="11" fill="var(--text)" text-anchor="middle">Recovery: redo required</text>
  <text x="480" y="281" font-size="11" fill="var(--text)" text-anchor="middle">Log replays missing pages</text>

  <!-- Divider -->
  <line x1="325" y1="44" x2="325" y2="298" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,3"/>
</svg>
<figcaption>Force flushes dirty pages synchronously at commit (safe, slow); no-force leaves them in the buffer pool and pays with redo work at recovery (fast commits, cheap writes).</figcaption>
</figure>

## How No-Force Interacts with Redo

Under no-force, the log is the only guarantee that committed work survives. When the database restarts after a crash, the recovery manager scans the log from the last checkpoint and redoes every update belonging to a committed transaction whose page was not yet on disk. This is exactly the redo phase described in the previous section.

The key insight is that this is cheap in the common case: checkpoints run periodically (every few seconds in most systems), so the redo window is typically short. Recovery is bounded by checkpoint frequency, not by how many transactions have committed overall.

### The WAL Requirement under No-Force

No-force only works because the log record for a change is always on disk *before* the commit acknowledgment goes out. If the log were also deferred, a crash could lose committed work with no way to reconstruct it. This is why the WAL rule ("log before data") is absolute: the sequence is always:

1. Log record written and flushed — durable.
2. Commit acknowledgment returned to client.
3. Dirty data page written to disk — whenever convenient.

Step 3 can happen before, during, or long after step 2 — the log in step 1 covers it.

## Combine Force/No-Force with Steal/No-Steal

Force and no-force pair with the steal/no-steal policy (can uncommitted pages be evicted to disk?) to determine which parts of the recovery machinery you need:

| Buffer policy | Force | No-force |
|---|---|---|
| **No-steal** | No undo, no redo — simplest possible recovery | No undo, redo needed |
| **Steal** | Undo needed, no redo — used by some embedded DBs | Undo + redo — the ARIES approach; what most systems use |

The bottom-right cell — steal + no-force — is the most flexible (no constraints on the buffer manager) and the most common. It demands a full redo/undo recovery protocol, which is exactly what ARIES provides.

<details class="reveal"><summary>Reveal: Why not just use force + no-steal to eliminate recovery entirely?</summary><div class="reveal-body">Force + no-steal means every committed page is on disk immediately and no uncommitted page ever reaches disk — so there is nothing to redo or undo after a crash. It sounds ideal, but there are two serious costs. First, force requires one synchronous random write per dirty page at every commit, which is extremely slow under high write throughput. Second, no-steal means the buffer pool can never evict a page belonging to a long-running transaction, which can cause the buffer pool to fill up and stall other work. Real systems accept the recovery complexity in exchange for these performance freedoms.</div></details>
