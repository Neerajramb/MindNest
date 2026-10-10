# Tooling Installation Register

Every tool, plugin or integration added to the development environment for MindNest.
Removal instructions are included so each change can be reversed.

## Claude Code plugins and marketplaces

| Field | Value |
|---|---|
| Name | `claude-plugins-official` marketplace |
| Type | Claude Code plugin marketplace |
| Version / commit | Cloned 2026-10-10 (latest at the time) |
| Source | https://github.com/anthropics/claude-plugins-official (Anthropic) |
| Installed | 2026-10-10 by `claude plugin marketplace add anthropics/claude-plugins-official` |
| Config change | Marketplace declared in the user-level Claude settings |
| Tests | `claude plugin marketplace list` shows it; plugin install from it succeeded |
| Limitations | None noted |
| Removal | `claude plugin marketplace remove claude-plugins-official` |

| Field | Value |
|---|---|
| Name | `expo` (Expo Skills) |
| Type | Claude Code plugin: skills, a PostToolUse/UserPromptExpansion telemetry hook, a remote MCP server config |
| Version / commit | 1.13.6 installed. The source reviewed before install was expo/skills @170589a (v1.12.5, 2026-09-08). |
| Source | https://github.com/expo/skills, `plugins/expo` (MIT; Expo Team); recommended by https://docs.expo.dev/agents/claude |
| Installed | 2026-10-10 by `claude plugin install expo@claude-plugins-official --scope project` |
| Config change | Root `.claude/settings.json` gets `enabledPlugins: {"expo@claude-plugins-official": true}`. The Expo template also ships `mobile/.claude/settings.json` with the same entry. |
| Security review | Hooks only run `skill-event.cjs`. Telemetry is opt-in (`DEFAULT_ON = false`), never runs in CI, and is disabled by `DO_NOT_TRACK=1` or `EXPO_SKILLS_TELEMETRY=0`. No `~/.expo-skills/opt-in` file exists. MCP points to `https://mcp.expo.dev/mcp` and needs Expo OAuth; it was **not** authenticated, because its tools include write actions (EAS builds, store reviews). |
| Tests | Install succeeded. **Plugin fails to load on Claude Code 2.1.86**: the hook file uses the `UserPromptExpansion` event, which this version does not recognise. |
| Workaround | The skill files (`SKILL.md`) are read directly from `~/.claude/plugins/cache/claude-plugins-official/expo/1.13.6/skills/` when building the mobile UI. |
| Limitations | Local simulator MCP tools are iOS/macOS-only. Docs search via MCP needs a paid EAS plan. |
| Removal | `claude plugin uninstall expo --scope project` |

## Project dependencies (not Claude tools)

| Name | Where | Version | Notes |
|---|---|---|---|
| Python packages | `backend/.venv` | see `backend/requirements*.txt` | Installed with pip into the project virtualenv only |
| npm packages | `mobile/node_modules` | see `mobile/package-lock.json` | Expo SDK 57; added `jest-expo`, `jest`, `@types/jest`, `@testing-library/react-native` |

## Evaluated and not installed

| Name | Type | Decision | Reason |
|---|---|---|---|
| typescript-lsp, pyright-lsp | Official LSP plugins | Deferred | `tsc` and `mypy` run in the CLI and in CI; VS Code diagnostics are already available |
| Security Guidance | Official hook plugin | Deferred | Its stop and commit reviews make extra model calls (rate limits); the built-in `/security-review` is used at P12 |
| context7 | Remote MCP (Upstash) | Deferred | Native web fetch is enough; avoids another external service |
| sentry | Plugin | Deferred | Sentry not adopted yet |
| react-native-best-practices | Third-party plugin | Rejected | Individual publisher, not vetted; overlaps Expo's official skills |
| playwright | MCP plugin | Rejected | Web testing, not mobile |
| github | MCP plugin | Rejected | git plus GitHub Desktop credentials are enough |
| feature-dev, pr-review-toolkit, commit-commands | Official plugins | Rejected | Overlap built-in `/code-review`, `/simplify` |
| frontend-design | Official plugin | Rejected | Aimed at web pages; Expo skills cover native UI |
