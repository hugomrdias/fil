# foc-cli-repo

The `foc` command-line interface, organized as a pnpm monorepo managed with Turborepo. All packages are private workspaces.

## Workspace

| Directory | Package | Documentation |
| --- | --- | --- |
| `packages/foc-cli` | `foc-cli` | [CLI usage](packages/foc-cli/README.md) |

## Guides

- [Development](docs/development.md): requirements, installation, and validation.
- [CLI guidelines for agents](docs/agent-cli-guidelines.md): generic output, error, exit-code, discovery, and startup-performance conventions for agent-facing Node.js CLIs.
- [CLI framework design](docs/cli-framework-design.md): draft design for a small framework that implements the agent CLI guidelines.
- [FOC CLI interface research](docs/foc-cli-interface-research.md): FOC command surface, resources, operations, CLI state, and artifact delivery design.
