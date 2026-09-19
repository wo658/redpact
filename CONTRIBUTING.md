# Contributing to Redpact

Redpact is still early. Bug reports, ideas, documentation fixes, and pull requests
are welcome.

## Getting started

Open an [issue](https://github.com/wo658/redpact/issues) to report a bug or suggest
an improvement. For bugs, include reproduction steps and what you expected to
happen. Small fixes can go straight to a PR; for larger changes, start a discussion
in an issue first.

To work on the code, fork the repository and create a branch. See the
[development guide](docs/development.md) for setup and commands. Use Node.js 24+ and pnpm.

## Sending a pull request

Keep the change focused and briefly explain what changed and why. Run the checks
relevant to your change and mention what you tested. Draft PRs are welcome if you
want feedback along the way.

For more context, see the [repository guidelines](AGENTS.md) and
[architecture](docs/architecture.md).

## Documentation

Behavior, defaults, API/settings, navigation and command changes must update the
owning `docs/` page in English and Korean in the same PR. The website reads these
files directly; do not add a second manual or content copy. Contributors run
`pnpm docs:check`; access to the private `redpact-web` renderer is not required.
Before merge, maintainers run `pnpm docs:build` against the proposed documentation
and record the result in the PR. Renderer or navigation changes also require
maintainer preview and actual-browser checks. If no documentation is affected,
explain why in the PR.
See [documentation maintenance](docs/development.md) for the complete policy.

## License

Contributions are made under [Apache-2.0](LICENSE). You retain your copyright;
no separate CLA or copyright assignment is required. Only submit work you are
allowed to contribute, and preserve existing third-party notices.

The project follows [founder-led governance](GOVERNANCE.md).
