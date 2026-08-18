# Sandora Third-Party Baselines

Bootstrap date: 2026-08-18
Host: Windows native (`win32`, case-insensitive filesystem)

## Upstream repositories

| Repository | Local path | Remote | Branch | Baseline commit | License |
|---|---|---|---|---|---|
| Hermes Agent | `upstream/hermes-agent` | `https://github.com/nousresearch/hermes-agent` | `main` | `c9ce66e25e55332b557b6af4471fbcdee3779022` | MIT (`LICENSE`) |
| n8n | `upstream/n8n` | `https://github.com/n8n-io/n8n` | `master` | `7ea9d542e3f7ae98edd14e0e36190950b4cb739b` | Sustainable Use License / n8n Enterprise License (`LICENSE.md`, `LICENSE_EE.md`) |
| OpenClaw | `upstream/openclaw` | `https://github.com/openclaw/openclaw` | `main` | `aa8be5acf90edb2b5d670e8c7702d99552a973a7` | MIT (`LICENSE`) |
| First Mate | `tools/firstmate` | `https://github.com/kunchenguid/firstmate` | `main` | `64d61aed84373e02b1a28c4e6b262908ed8128d5` | MIT (`LICENSE`) |

n8n and OpenClaw were fetched with Git blob filtering to preserve repository history and source-tree inspection while reducing transfer overhead. Their checked-out source trees and `HEAD` commits are present locally.

## Sandora base

`sandora/` is a local Git fork created from the Hermes baseline commit above. It retains Hermes history and has an `upstream` remote pointing to the Hermes repository. It has no Sandora product customization yet.

The Windows checkout reports one upstream filename collision:

- `contributors/emails/agent@Agents-Mac-mini.local`
- `contributors/emails/agent@agents-Mac-mini.local`

Windows cannot materialize both case-distinct paths. The Git index retains both entries, but the working tree content for the case-colliding path is not a faithful representation of both files. A case-sensitive filesystem (WSL2/Linux/macOS) is required for a byte-faithful Hermes/Sandora checkout.

## Source inspection / reuse map

- **Hermes**: Python package (`pyproject.toml`), core agent loop in `run_agent.py`, CLI/TUI entry points in `cli.py` and `hermes_cli/`, provider/session/tool/persistence code in the repository packages. Candidate foundation for Sandora fork/customization.
- **n8n**: pnpm monorepo (`package.json`, version `2.35.0`, Node >=24, pnpm >=10.22), Turbo build, workflow and integration packages under `packages/`. Candidate automation engine to wrap; no n8n code is imported into Sandora in this bootstrap.
- **OpenClaw**: pnpm workspace (`package.json`, version `2026.8.1`), `openclaw.mjs` CLI and gateway/runtime packages under `src/` and `packages/`, with extensions under `extensions/`. Candidate source for selective gateway/tool/permission/sandbox patterns only; no parallel OpenClaw runtime is enabled.
- **First Mate**: agent distro, not an npm application or MCP server. Local source is kept under `tools/firstmate`; its npm companion CLIs are installed globally. Internal skills require a First Mate home and supported harness/runtime, so they are not copied into Sandora or Command Code skills.

## Tooling installed

Installed globally through npm registry:

- `tasks-axi@0.2.5`
- `quota-axi@0.1.28`
- `gh-axi@0.1.30`
- `lavish-axi@0.1.52`
- `chrome-devtools-axi@0.1.29`
- `no-mistakes@0.43.3`

Not installed on this Windows host:

- `herdr`: First Mate's pinned installer supports Linux/macOS assets only.
- `treehouse`: First Mate's pinned installer supports Linux/macOS assets only.
- `tmux`: POSIX runtime; not available natively here.

Use WSL2/Linux for the verified First Mate Herdr/Treehouse backend. The npm CLI installs above are platform-independent command-line prerequisites, but First Mate still requires a supported primary harness and GitHub authentication (`gh auth login`) before dispatching workers.

## Hermes verification

Upstream contributor instructions specify:

```text
uv pip install -e ".[all,dev]"
scripts/run_tests.sh
hermes doctor
hermes chat -q "Hello"
```

Verification on this host:

- `uv` installed at `%USERPROFILE%\\.local\\bin\\uv.exe`.
- Managed Python `3.13.15` installed and Hermes venv created outside the source tree at `%USERPROFILE%\\.hermes\\venvs\\hermes-dev`.
- Editable install with `.[all,dev]` completed; `hermes_cli` import passed.
- `hermes doctor` ran successfully and validated the Python environment, SQLite, required packages, configuration paths, and built-in tools. It reports no provider credentials, which is expected because no secrets were supplied.
- `hermes chat -q "Hello"` started and exited cleanly, but correctly reported that no inference provider is configured. A real model response cannot be claimed until a provider is configured.
- The official `scripts/run_tests.sh` is POSIX shell and cannot be used directly from PowerShell. Direct `pytest tests/verify -q --maxfail=1` ran 14 tests successfully before failing on an upstream test that starts `python3`; native Windows exposes `python.exe` instead. A compatibility-shim rerun exceeded the bounded test window without producing a result and was stopped. No upstream test code was modified.

The remaining verification limitation is the Windows case-insensitive checkout collision documented above. Use WSL2/Linux for a byte-faithful checkout and the complete official test runner. No API credentials were requested or written.

## Provenance rule

Keep these upstream checkouts and license notices intact. Before copying or porting code into Sandora, verify the applicable upstream license terms and record the source commit/module. n8n's Sustainable Use and Enterprise terms require separate review before commercial distribution.
