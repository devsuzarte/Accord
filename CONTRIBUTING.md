# Contributing to Accord

Thanks for wanting to help. Accord is maintained by Benjamin Suzarte
([devsuzarte](https://github.com/devsuzarte)), who reviews every change and decides what gets
in. This guide explains how to propose a change and what to expect from review.

Issues and pull requests are welcome in English or Portuguese.

## Before you start

- **Small fix** (typo, obvious bug, translation): send the pull request directly.
- **Something bigger** (new feature, behavior change, new dependency, architecture change):
  open an **issue** first and wait for a "go ahead". That keeps you from spending time on a
  direction that won't be accepted.
- **Security issue**: never in a public issue or PR. See [SECURITY.md](SECURITY.md).
- Look for issues labeled `good first issue` if you want a place to start.

## Setting up

You need [Bun](https://bun.sh) 1.4.4. To test voice and screen sharing, follow "Testing a call
on your own" in [CLAUDE.md](CLAUDE.md) (the development voice server and two app instances).

```bash
bun install
bun run dev
```

## The pull request

1. Fork the repository and create a branch from `main` (`fix/mic-disappears`,
   `feat/quick-rooms`).
2. One change per PR. Small PRs get reviewed faster.
3. Before sending, run:
   ```bash
   bun run typecheck
   bun run lint
   bun run format
   ```
   GitHub runs the same checks (CI), and a PR only gets in when they pass.
4. Fill in the PR template: what changes, why, how you tested it, and screenshots if you
   touched the interface.
5. If the PR fixes an issue, write `Fixes #123` in the description.

### Project rules

They live in [CLAUDE.md](CLAUDE.md) and `docs/`. The ones people trip on most:

- **Interface text** always in both languages: `packages/shared/src/i18n/pt-BR.ts` and
  `en.ts`, with the same keys. No hard-coded text in components.
- **Colors** only through the tokens (`packages/ui`) or `color-mix`. No fixed hex colors.
- **Never** use Discord's brand, icons, fonts or sounds. Icons come from Lucide.
- The renderer imports nothing from Electron: system access goes through the `PlatformBridge`.
- A new IPC channel follows `shared/ipc.ts` → `PlatformBridge` → preload → `main/ipc.ts`, with
  the payload validated in main.
- Changed a decision? Update the document in `docs/` in the same PR. Documentation is written
  in English.
- Security-related changes (API, tokens, IPC, permissions) must explain the risk in the PR.

## How review works

Every PR is reviewed by the maintainer (GitHub requests the review automatically through
[CODEOWNERS](.github/CODEOWNERS)). The outcome is one of these:

| Response | What it means | What you do |
|---|---|---|
| **Approved** | It can go in as it is | Nothing: the maintainer merges it |
| **Changes requested** | The idea is good, but something needs to change | Update the same branch and reply to the comments; the PR is reviewed again |
| **Comment / question** | Something needs clarifying before a decision | Reply in the PR |
| **Closed** | It won't go in (out of the project's direction, duplicate, no reply) | The reason is written in the PR |

- Comments marked **"suggestion"** or **"optional"** don't block the merge; everything else does.
- A PR waiting on its author for 30 days may be closed (it can be reopened later).
- The maintainer does the merge, as a **squash** (one commit per PR).
- The final call on what gets in belongs to the maintainer. Don't take it personally:
  sometimes a good idea just doesn't fit the project right now.

## Licensing of contributions

Accord is licensed under the [Apache License 2.0](LICENSE). By submitting a pull request, you
agree that your contribution is licensed under the same license (section 5 of Apache 2.0) and
you state that you have the right to submit it: the code is yours, or comes from a source
compatible with Apache 2.0 with proper credit. Don't submit code copied from projects with an
incompatible license or from closed-source projects.

## Conduct

Everyone follows the [code of conduct](CODE_OF_CONDUCT.md).
