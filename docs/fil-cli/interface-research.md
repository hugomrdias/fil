# Filecoin CLI interface research

Research date: 2026-09-28. Scope: agent-generated files and shareable artifacts. Status: design recommendation, not an implemented or benchmarked CLI. `fil` is a working executable name; every command below is proposed.

## Recommendation

Build an artifact publishing CLI over Synapse, with a stable machine contract and a portable Agent Skill. Add an MCP adapter around the same application operations when needed. Make the first successful workflow “publish this output and return a working link.”

Use familiar file operations for raw storage, and a higher-level publishing operation for named files, folders, and static artifacts. Keep provider selection, data sets, payment rails, and EIP-712 out of the ordinary publishing path. Make that information available through inspection and advanced commands.

Both resource groups use canonical `put`, `get`, and `delete` commands: `fil files` for raw bytes and `fil artifacts` for IPFS files and folders. `fil publish` is a convenience alias for `fil artifacts put`, with identical behavior and results.

For folder publishing, reuse [Filecoin Pin](https://github.com/filecoin-project/filecoin-pin)'s UnixFS/CAR approach and make Curio's native IPFS retrieval a first-class delivery path. It already provides an interoperable directory representation. Validate the library integration and browser gateway before committing to packaging details. Do not commit to a new proprietary file-tree format before testing this route.

Provide both a useful workflow and a dependable execution contract. A large command tree generated directly from contracts would expose too much machinery for the primary task.

This document covers the design specific to the Filecoin CLI. Generic conventions for agent-facing Node.js CLIs (output and error contract, exit codes, agent detection, schema discovery, non-interactive behavior, harness integration, evaluation, and startup performance) are in [CLI guidelines for agents](../agent-cli/guidelines.md); `fil` follows them.

## Proposed user interface

```sh
# One-time human setup; auth and funding are distinct operations
fil auth login
fil auth status --json
fil doctor --json
fil skills install --json

# Artifacts: publish, retrieve, inspect, and delete IPFS files or folders
fil artifacts put ./report.pdf --json --non-interactive
fil artifacts put ./dist --entry index.html --json --non-interactive
fil artifacts get <artifact-ref> --output ./downloaded-report
fil artifacts get ipfs://<root-cid>/images/chart.png --output ./chart.png
fil artifacts delete <artifact-ref> --json --non-interactive
fil artifacts inspect <artifact-ref> --json
fil artifacts ls --limit 20 --json
fil artifacts verify <artifact-ref> --json
fil artifacts put --help
fil schema artifacts put

# Convenience alias for artifacts put
fil publish ./dist --entry index.html --json --non-interactive
fil publish --help
fil schema publish

# Raw bytes remain independently useful
fil files put ./data.bin --json --non-interactive
fil files get <file-ref> --output ./data.bin
fil files delete <file-ref> --json --non-interactive
fil files inspect <file-ref> --json
fil files ls --limit 20 --json

# Find, inspect, and recover operations for files and artifacts
fil operations ls --incomplete --limit 20 --json
fil operations inspect <operation-id> --json
fil operations resume <operation-id> --json --non-interactive
```

`artifacts put` packages content, stores the requested copies, waits for the required commitment state, obtains a suitable browser/download URL, and checks that URL. Default copy count should follow the SDK's two-copy golden path. Publishing is explicitly a public workflow; it does not send the URL to anyone.

`publish` resolves to the same `artifacts put` operation. Both accept the same arguments and flags, return the same artifact reference, content URI, shareable URL, and result schema, and use the same authorization, exit codes, and retry semantics. Help identifies the alias, and `fil schema publish` returns the canonical `artifacts put` schema. Save the canonical action `artifacts.put` for either spelling; continue an existing job with `operations resume`.

`files put` stores exact bytes and returns a file reference and PieceCID. It does not manufacture folder semantics or promise browser rendering. Raw stored bytes should not be described as private merely because no share page was created.

The selected file verbs are `put`, `get`, and `delete`. `put` creates content-addressed storage; it does not overwrite bytes at an existing CID. `get` retrieves the original bytes. `delete` schedules removal of the managed copies identified by the file reference in the current account. The file's resource record identifies the managed upload and its copies; a bare PieceCID that matches multiple uploads requires an explicit scope. Report `removal_pending`, `deleted`, or `partial` based on observed removal state, rather than treating transaction submission as completed deletion. Deletion does not guarantee erasure of externally downloaded or cached copies.

The artifact verbs are also `put`, `get`, and `delete`. `artifacts get` restores the published file or directory, preserving its paths and verifying its content, rather than returning the underlying CAR by default. `artifacts delete` removes the managed publication and schedules removal of its storage copies in the current account. Preserve storage still referenced by another managed artifact; track those references before introducing cross-artifact deduplication. Use the same removal states as file deletion. A public IPFS CID or URL alone is not authority to delete another account's publication, and deleting managed storage does not revoke copies held elsewhere.

Start with immutable publications. Republishing changed content creates a new version. Named aliases, custom domains, replacement, expiration, and unpublishing need separate semantics and can follow later. Removing an alias or stopping storage does not guarantee erasure of already retrieved content.

Avoid filesystem-like `mv` and destructive `sync` in v1: content addressing and recurring storage obligations make their effects less obvious than local filesystem operations.

## Resources

A **resource** is a file or artifact we manage.

Keep the resource small: its reference, name, account scope, content identity, and managed storage copies. A file stores original bytes; an artifact stores a UnixFS CAR and adds an IPFS root CID.

```typescript
type Copy = {
  providerId: string
  dataSetId: string
  pieceId: string
}

type Resource = {
  ref: string
  name: string
  chainId: string
  payer: string
  pieceCid: string
  copies: Copy[]
  url?: string
} & (
  | { kind: 'file' }
  | { kind: 'artifact'; rootCid: string }
)
```

IDs use decimal strings where applicable. `pieceCid` identifies the original bytes for a file, or the CAR bytes for an artifact. `rootCid` identifies the artifact's UnixFS content. Each resource is one piece in v1. The optional URL is a delivery location, not a content identifier or availability guarantee; an artifact's `ipfs://` URI is derived from its root CID.

`copies` contains the known on-chain storage occurrences needed to retrieve or delete the resource. Provider endpoints can be resolved using provider IDs. Names are display labels; commands use `ref` to identify a managed resource. A CID identifies content and may match multiple managed resources.

Inspection can return fresh checks alongside the resource without expanding its stored shape.

`get` and `delete` resolve the resource directly, without requiring the original upload job. A new content version gets a new resource. Reads by PieceCID or IPFS URI can work without a local resource, but do not grant management rights. Local references require the originating database; cross-machine resource management can be added later.

## Operations

An **operation** is a saved `put` or `delete` job. It links to a resource and records enough progress to continue after an interruption. Files and artifacts share the same operation model; `publish` is saved as `artifacts.put`. Reads do not create operations.

The following interface represents the record saved in the database, including recovery state. Inspection returns this record; lists return a compact selection of its fields. Nested objects and arrays can be stored as JSON columns in SQLite.

```typescript
interface Operation {
  id: string // Stable ID for inspection and recovery.
  action: 'files.put' | 'files.delete' | 'artifacts.put' | 'artifacts.delete' // Canonical command.
  resourceRef: string // Resource being created or deleted.
  chainId: string // Network ID as a decimal string.
  payer: string // Root wallet managing the resource.
  executionStatus: 'pending' | 'running' | 'failed' | 'completed' // Job execution state.
  phase: 'queued' | 'packing' | 'storing' | 'committing' | 'publishing' | 'removing' | 'done' // Current step.
  sourcePath?: string // Put source path, or '-' for stdin; absent for deletes.
  requestedCopies?: number // Required committed copies for a put; absent for deletes.
  entry?: string // Selected artifact entry point, if any.
  checkpoints: {
    providerId: string // Provider selected for this copy.
    dataSetId?: string // Target data set, once known.
    pieceId?: string // On-chain piece occurrence, once known.
    transactionHash?: string // Outstanding commitment or removal transaction.
    confirmed: boolean // Whether this copy's commitment or removal is confirmed.
  }[] // One checkpoint per selected copy; keep confirmed work on failure.
  updatedAt: string // Last saved change in UTC ISO 8601 format.
  error?: string // Latest failure and what is needed to continue.
}
```

Keep v1 to the job identity, input, current step, and copy checkpoints. Database migrations manage the schema version. Packing always uses the same fixed UnixFS profile; it is not an operation setting. Staging paths are derived from the operation ID. The resource holds content CIDs, confirmed storage copies, and the selected delivery URL.

`executionStatus` describes execution; `phase` identifies the step. A failed job can retain successful copies. If a process exits while marked running, its released execution lock lets the next invocation recognize it as interrupted. Partial storage and pending publication are outcomes derived from the checkpoints and phase, without additional execution states.

Artifact puts follow `queued → packing → storing → committing → publishing → done`. File puts skip packing and publishing. Deletes follow `queued → removing → done`.

Each new put or delete invocation creates a new operation. Retries use `operations resume <id>` with the saved inputs and settings; repeating the original command does not deduplicate work. See [CLI state](#cli-state) for persistence and staging.

### Listing, inspecting, and resuming

```sh
# Recent jobs for the current network and payer
fil operations ls --limit 20 --json
fil operations ls --incomplete --json
fil operations ls --resource artifacts --action put --incomplete --json

# Read saved state, or reconcile it without submitting new work
fil operations inspect op_abc123 --json
fil operations inspect op_abc123 --refresh --json

# Continue the existing job
fil operations resume op_abc123 --json --non-interactive
```

`ls` reads local state, newest update first, with 20 results by default and `nextCursor` pagination. Summaries include ID, action, resource reference, phase, execution status, and last update. `--incomplete` includes every job that has not completed; it does not promise automatic recovery. `inspect --refresh` checks providers and the chain without submitting transactions or restarting work.

`resume` locks the record, checks input and authorization, reconciles outstanding requests, and continues the missing steps. For example, it checks a saved commitment transaction before submitting another. Completed jobs return their saved outcome. Missing inputs, authorization, or services produce specific errors. If a crash left a submission outcome uncertain and reconciliation cannot resolve it, stop rather than risk repeating a paid mutation. V1 restarts interrupted byte transfers rather than saving provider upload sessions; it checks whether the piece is already stored first. Confirmed commitments and removals remain checkpoints.

`put` and `delete` each run in one call: save the operation before external mutations, execute it, and return the result with its operation ID. The same flow applies to agents and interactive use.

```sh
fil artifacts put ./dist --json --non-interactive
```

Use `resume` only when continuing unfinished work. If a timeout or crash prevents the caller from receiving the operation ID, find the job with `operations ls --incomplete` and inspect its input or target before resuming. Do not automatically pick the newest job or repeat the original command.

There is no background worker. After the CLI exits, local work stops, although already submitted provider or chain work may continue. A later `resume` reconciles that progress and continues the job.

### Completion

All requested copies must be stored and committed before storage is complete. Use the SDK's [`UploadResult.complete`](https://github.com/FilOzone/synapse-sdk/blob/master/packages/synapse-sdk/src/types.ts); intermediate `failedAttempts` may have recovered and do not determine success. Artifact publication also requires indexing and a working delivery URL, including its entry point and required assets.

Return a working link with partial status if copies are incomplete, or pending publication if storage is complete but delivery is not ready. Delete completes only after every targeted removal is confirmed. Keep the operation ID in partial and pending results so a harness can continue the same job after a timeout.

## CLI state

Keep durable CLI state in the platform's application state directory. `FIL_STATE_DIR` overrides this location for CI and agent harnesses using a persistent volume. Keep the directory outside published input trees.

```text
<fil-state-directory>/
├── state.db
└── staging/
    ├── <file-operation-id>/
    │   └── input.bin
    └── <artifact-operation-id>/
        └── artifact.car
```

### SQLite

Use one database with two main tables, matching the TypeScript records above:

| Table | What it saves |
| --- | --- |
| `resources` | Managed file/artifact identity, network and payer, confirmed copies, and delivery URL. Keyed by `ref`. |
| `operations` | Job identity, resource reference, account scope, source path, copy target, entry point, progress, transaction checkpoints, last update, and latest error. Keyed by `id`. |

Store `copies` and `checkpoints` as JSON columns for v1. Index account scope (`chainId`, `payer`) and the operation status/update fields used by listing. Track the database schema version through SQLite migrations, rather than adding it to every record. File bytes and private keys do not belong in SQLite.

Save an operation before external mutations and persist selected copy targets before submitting their work. Save transaction hashes and other acknowledgments as they arrive. Update related resource and operation records in a database transaction. Hold an execution lock for the job, released when its process exits, and coordinate concurrent wallet submissions; do not hold a SQLite write transaction open during network calls.

A put reserves a resource reference before the resource row exists. Create that row once its content identity is known, then add confirmed copies. A delete snapshots its target copies into operation checkpoints, removes each resource copy only after confirmed removal, and removes the resource row when all targets are removed. Keep the operation as history. `resourceRef` is therefore a logical link that may outlive or precede its resource row.

### Staging

Stage exact file bytes as `input.bin`, or pack an artifact as `artifact.car` using the single fixed profile. Stdin is spooled locally too; artifact stdin may need a temporary input file before packing. Paths derive from the operation ID, so they need no additional database fields. Delete operations need no staging.

Write preparation output to a temporary file, finish it, then atomically rename it to its final staging name before recording its content identity and starting uploads. Resume verifies staged content against the resource's PieceCID and reuses those bytes. It does not reread a changed source. Missing or corrupt staged content returns a specific error. If preparation stopped before an identity was saved, it may restart from the source; interrupted stdin preparation requires the input again.

### Retention and recovery

Retain staging for unfinished jobs. Once an operation completes and recovery no longer needs its input, remove its staging directory while keeping the resource and operation records. Do not silently expire unfinished inputs. Removing local staging or the database does not delete provider copies or stop storage charges.

An ephemeral harness must retain the database and required staging together to recover after restart. Back up SQLite consistently, using its backup mechanism or with the CLI stopped, and preserve staging for unfinished jobs. Local state is not a background worker or a substitute for checking provider and chain state. Cross-machine recovery remains outside v1.

Account/network preferences belong in CLI configuration; private and session keys stay in credential storage. Neither is part of the resource or operation records. A state backup alone does not grant signing authority.

## The agent execution contract

`fil` applies the [CLI guidelines for agents](../agent-cli/guidelines.md): one JSON result object on stdout (success and error), human-readable diagnostics on stderr, exit codes `0` and `1` only, structured `retryable` and `next` fields, agent-aware help, no prompts in noninteractive mode, and offline `fil schema <command>` discovery. The Filecoin CLI adds these specifics:

| Concern | Filecoin CLI contract |
| --- | --- |
| Secrets | No wallet material, private keys, or session keys in any output, error, or log. |
| Authorization | Missing authorization, an expired session key, or insufficient funding returns an error with a `next` step for the user. Noninteractive execution is not itself spending authorization. |
| Compactness | Never put file bytes, full storage histories, or verbose transaction traces in ordinary results. |
| Pipes | A binary stdout download cannot also emit JSON to that stream; reject conflicting modes. Stdin publishing requires a name and a durable spool if restart recovery is promised. |
| Errors | Include the operation ID in every put/delete error. Avoid a single generic “upload failed.” |
| Retries | Put and delete errors are never `retryable`, because repeating the original command creates a new paid operation. Recovery is a `next` step running `fil operations resume <id>`. Reads can be `retryable`. |
| Numeric precision | Serialize chain IDs and amounts as decimal strings; represent monetary quantities with explicit token/unit fields. |
| Configuration | Named account/network profiles. Include the resolved network and payer in resource and operation inspection. |
| Raw output | `--output url` prints only a verified ready URL. JSON is the recommended agent mode. |

Illustrative compact successful result, with placeholder IDs and a reserved example hostname:

```json
{
  "data": {
    "operationId": "op_example",
    "state": "ready",
    "resource": {
      "ref": "artifact_example",
      "kind": "artifact",
      "name": "report",
      "chainId": "314",
      "payer": "<payer-address>",
      "pieceCid": "<car-piece-cid>",
      "rootCid": "<unixfs-root-cid>",
      "copies": [
        { "providerId": "12", "dataSetId": "345", "pieceId": "6" },
        { "providerId": "34", "dataSetId": "678", "pieceId": "9" }
      ],
      "url": "https://artifact.example/report/"
    },
    "storage": {
      "complete": true,
      "requestedCopies": 2,
      "confirmedCopies": 2
    },
    "retrieval": {
      "state": "ready",
      "checkedAt": "2026-09-28T12:00:00Z"
    }
  }
}
```

The resource is the small managed-content record. The surrounding state, storage summary, and retrieval check describe this operation's outcome at a point in time; they are not additional resource fields or a permanent availability guarantee. Use the resource reference for get/inspect/delete and the operation ID for job inspection or recovery.

Exit `0` only when the requested command contract is satisfied (the result has `data`); exit `1` otherwise. Partial copies, pending publication, and action-required outcomes exit `1`, and their stable error `code` (for example `storage_partial`, `publication_pending`, `insufficient_funds`) carries the diagnosis. A failed result carries no `data`, so a partial or pending put returns the operation ID, the resource reference, and its URL in `error.details`, and a harness can still share the link or resume. Operation inspection exits `0` while reporting a still-pending operation.

Illustrative pending result, following the guidelines' error shape:

```json
{
  "error": {
    "code": "publication_pending",
    "message": "Both copies are committed; the gateway has not served the entry point yet.",
    "retryable": false,
    "details": {
      "operationId": "op_example",
      "state": "pending",
      "resource": { "ref": "artifact_example", "url": "https://artifact.example/report/" }
    }
  },
  "next": [
    { "by": "agent", "command": "fil operations resume op_example --json", "description": "Continue publication checks for this operation" }
  ]
}
```

## Artifact representation and delivery

There are two viable paths to prototype:

| Path | Strength | Cost or uncertainty |
| --- | --- | --- |
| UnixFS directory → CAR → FOC/Curio → IPFS client or rendering gateway | Standard paths and content identities; reuse Filecoin Pin; native Curio retrieval | Gateway availability, indexing delay, browser headers, and rendering readiness need validation; does not require Beam IPFS support |
| Individual raw pieces + explicit artifact manifest + a rendering gateway | Direct piece/CDN delivery; per-file reuse and custom artifact metadata | New manifest protocol, routing service, more piece management, origin isolation, and metadata validation |

Prefer the first for the initial folder/static-site experiment. Keep raw pieces for exact-byte file storage. Only select the second as the default publishing format if measured delivery requirements justify owning that additional service.

[Filecoin Pin's packing documentation](https://github.com/filecoin-project/filecoin-pin/blob/master/documentation/behind-the-scenes-of-adding-a-file.md) describes UnixFS/CAR generation with a defined importer profile. Preserve that distinction: the IPFS root CID describes the content DAG; the PieceCID identifies the stored archive bytes. They are not interchangeable. Record both and use one fixed packing profile throughout v1 for reproducibility.

The current [FOC retrieval documentation](https://docs.filecoin.cloud/core-concepts/retrieval/) distinguishes direct piece, Beam piece, and IPFS retrieval. It says Beam currently serves pieces, while IPFS website support is tracked in [Beam issue 85](https://github.com/filbeam/roadmap/issues/85), which was open when checked. A CAR returned from a piece endpoint is an archive download, not a rendered website.

### Curio IPFS retrieval: verified in source

Inspected Curio commit `ee0c5b44d7747579723596cb2a8d56fb4473252e`, returned as the head of `main` during this research. This is source-level evidence; no deployed provider was probed.

- Curio documents both `/piece/{pieceCid}` and `/ipfs/{cid}` in its [retrieval guide](https://github.com/filecoin-project/curio/blob/ee0c5b44d7747579723596cb2a8d56fb4473252e/documentation/en/curio-market/retrievals.md).
- Its [retrieval server](https://github.com/filecoin-project/curio/blob/ee0c5b44d7747579723596cb2a8d56fb4473252e/market/retrieval/retrieval.go#L252) registers GET and HEAD for `/ipfs/*`, backed by Frisbii and a blockstore. This is existing support, independent of Beam's roadmap.
- Its [retrieval tests](https://github.com/filecoin-project/curio/blob/ee0c5b44d7747579723596cb2a8d56fb4473252e/market/retrieval/retrieval_test.go#L35) cover nested path routing and raw-block responses. [Integration tests](https://github.com/filecoin-project/curio/blob/ee0c5b44d7747579723596cb2a8d56fb4473252e/itests/retrievals_test.go#L532) exercise IPFS CAR retrieval. These tests were inspected, not run.
- Curio uses Frisbii v0.10.0 in the inspected [go.mod](https://github.com/filecoin-project/curio/blob/ee0c5b44d7747579723596cb2a8d56fb4473252e/go.mod#L69). [Frisbii](https://github.com/ipld/frisbii) documents trustless gateway support for `application/vnd.ipld.car` and `application/vnd.ipld.raw`. This supplies verifiable blocks/archives; it does not establish ordinary HTML/PDF rendering at the provider endpoint.

The recommended delivery architecture is therefore:

```text
Agent-generated file/folder
  → UnixFS DAG / CAR
  → Synapse multi-copy storage on Curio
  → Curio /ipfs/<rootCid>/<path> (verifiable retrieval)
  → IPFS-aware client OR browser rendering gateway
  → shareable artifact
```

Resolve provider endpoints from the resource's copy provider IDs for direct retrieval and failover. Discoverability through IPNI is a separate state from successful retrieval at a known provider. A direct Curio read need not wait for a global routing service to discover a provider whose URL is already known, but it still needs that provider's content indexing to be ready.

For browser links, evaluate a service-worker gateway or an operated rendering gateway. [Filecoin Pin's retrieval reference](https://github.com/filecoin-project/filecoin-pin/blob/master/documentation/retrieval.md) describes browser-side verified rendering and direct SP retrieval. Public gateway access can bootstrap an MVP, but should be labeled best-effort until operational guarantees are established. Beam remains an optional piece-delivery accelerator, and a future IPFS-delivery option, rather than a prerequisite for artifact publishing.

Derive a canonical `ipfs://<rootCid>/<path>` URI from the artifact and return a verified browser URL; artifact inspection can also resolve provider retrieval endpoints. This keeps identity separate from delivery location. Preserve both root CID and PieceCID(s); fetching a CAR reconstructed through `/ipfs` may change its serialized bytes, so verify its DAG blocks/root rather than comparing that reconstructed archive against the original stored PieceCID. Exact `/piece` downloads can be checked against the original PieceCID.

Browser publishing must verify file paths, entry-point behavior, MIME types, download names, relative and root-relative assets, and per-publication origin isolation. The [IPFS subdomain gateway specification](https://specs.ipfs.tech/http-gateways/subdomain-gateway/) provides an established origin-isolation model. Do not serve unrelated active HTML publications under one authenticated application origin.

Scope v1 to documents, images, downloadable bundles, and prebuilt static HTML. Publishing should never run a repository's build scripts implicitly. For a folder, define deterministic inclusion rules, a dedicated ignore file, symlink handling, and a read-only preview of the exact included paths. Reject path traversal during extraction. Private artifacts require an explicit encryption and key-delivery design; do not offer a cosmetic `--private` flag.

## Authentication and costs

The agent should normally use an expiring delegated session key. Authorize creation/addition only for the publishing profile; deletion and service termination should not be bundled into that profile. The local SDK supports narrowing construction requirements with `requiredPermissions`; these checks are not a substitute for the permissions actually granted on-chain. See [session key guide](https://github.com/FilOzone/synapse-sdk/blob/master/docs/src/content/docs/developer-guides/session-keys.mdx).

Keep the root wallet in a human-controlled signer/keystore. Never print private keys or accept them as ordinary command-line flags. Separate root-authorized funding from routine publishing. Headless environments need an explicit credential-file or signer integration, not an interactive login hidden inside `publish`.

A local budget flag is a client guardrail, not a cryptographic per-session spending cap. Distinguish local policy from contract/operator allowances. Strict aggregate limits across concurrent agents require a shared budget authority or appropriate account/contract enforcement.

Expose read-only `artifacts put <path> --dry-run --json` (also available through `publish`): content inventory, packing size, expected copies, current cost estimate, additional lockup, authorization gaps, and delivery prerequisites. It may query services and spool local content, but must not sign, upload, create data sets, or change allowances. Estimates must carry timestamps and clearly identify unknown future egress. Do not require a second approval command when existing user authorization and policy already permit the operation.

Store-and-serve has ongoing costs. Report current storage obligations and egress funding separately from upfront fees or lockup. Do not imply that an immutable URL has prepaid permanent storage.

## Harness integration

Start with one compact Agent Skill covering publishing, retrieval, inspection, and recovery; see [Agent Skills](../agent-cli/guidelines.md#agent-skills) for packaging and `fil skills install`. The skill should teach a few essential facts: use structured output; return the actual URL from the result; distinguish pending/partial/ready; resume an existing operation after interruption; never paste credentials.

For a local MCP adapter, expose a small set such as `put_artifact`, `inspect_artifact`, `list_artifacts`, `get_artifact`, `delete_artifact`, and `list_operations`/`inspect_operation`/`resume_operation`. `put_artifact` maps to the same operation as `artifacts put` and its `publish` alias; expose one creation tool rather than duplicate tools for the alias. Deletion requires separately authorized removal permissions. Resource links can point to published artifacts; client rendering support varies, so a resource link does not guarantee an inline preview.

A remote MCP server cannot read a file from the agent's sandbox; publishing through one needs an explicit upload capability or a harness-accessible artifact URI.

## Gaps in this repository

| Evidence in the inspected checkout | Implication |
| --- | --- |
| [Example command tree](https://github.com/FilOzone/synapse-sdk/blob/master/examples/cli/src/index.ts) centers on data sets, pieces, funding, and providers | Build a publish-first product surface over shared application code |
| [Example upload](https://github.com/FilOzone/synapse-sdk/blob/master/examples/cli/src/commands/upload.ts) uses a single context, prints progress, and catches errors without explicitly setting failure exit status | Use multi-copy orchestration and deterministic result/exit handling |
| [Example init](https://github.com/FilOzone/synapse-sdk/blob/master/examples/cli/src/commands/init.ts) prints private keys | Replace this onboarding behavior before harness use |
| [Piece URL helpers](https://github.com/FilOzone/synapse-sdk/blob/master/packages/synapse-core/src/utils/piece-url.ts) already encode chain-specific hosts | Reuse them; public examples differ in URL shape, so avoid hardcoded templates |
| [Piece size constants](https://github.com/FilOzone/synapse-sdk/blob/master/packages/synapse-core/src/utils/constants.ts) currently specify 127 through 1,065,353,216 bytes | Test empty/tiny files and archive boundaries; do not silently alter exact-byte uploads. Oversized bundles need an explicit rejection or a later sharding design |
| [Piece download](https://github.com/FilOzone/synapse-sdk/blob/master/packages/synapse-core/src/piece/download.ts) buffers data into a Uint8Array | Implement or reuse a verified streaming-to-file path for large CLI downloads |
| Metadata limits are small | Put artifact descriptors in content-addressed data and local resource records, not an arbitrarily large set of on-chain metadata keys |

These are read-only findings. No storage calls, transactions, account changes, or application code changes were performed during this research.

## First release and validation

Ship `files put/get/delete`, `artifacts put/get/delete`, the `publish` command alias, inspection, bounded listing, schemas, JSON output, delegated auth, readiness checks, and local operation recovery. Include a portable skill. Begin with immutable versions and explicit public sharing. Defer mutable publication URL aliases, custom domains, private sharing, remote MCP upload transport, and full administrative coverage.

Before settling the delivery architecture, prototype one PDF and one static folder through Filecoin Pin/UnixFS and through raw-piece delivery. Check whether the chosen gateway actually renders/downloads them correctly, including asset paths and origin separation. This is the main unresolved dependency.

Evaluate the resulting interface as described in [Evaluate with agents](../agent-cli/guidelines.md#evaluate-with-agents), additionally measuring duplicate paid mutations and correctness of the final share link.

Acceptance scenarios:

1. Publish a generated PDF and return a working download link with its filename.
2. Publish static HTML plus nested assets and load it from a fresh browser session.
3. Retrieve an artifact and verify the content without routing bytes through model context.
4. Restart after storage or chain submission and finish without duplicate mutations.
5. Handle one failed provider while accurately reporting achieved copies.
6. Return an expired-session or insufficient-funding action without hanging or exposing secrets.
7. Keep JSON parseable in a non-TTY process under success, pending, and error conditions.
8. Complete a put or delete in one call while saving its operation before external mutations; reuse and verify staged input on resume and prevent concurrent execution of the same operation.
9. Handle Unicode names, spaces, leading dashes, ignore rules, symlinks, tiny files, and bundle size limits predictably.
10. Resolve `publish` and `artifacts put` to identical schemas and canonical operation actions; recover either through `operations resume`.
11. Find an interrupted file or artifact job through `operations ls --incomplete`, inspect its saved checkpoints, and resume it with the original input and scope. Report missing staged inputs or ambiguous submission outcomes without silently creating a new job.
12. Inspect, retrieve, and delete managed content through its resource reference without requiring the original put operation. Keep confirmed partial copies on the resource when a job fails, and keep progress and recovery state on the operation.

The release criterion is an agent reliably completing “take this output and give me a working share link,” including after interruption. Command naming and parser-library selection are secondary to that result.
