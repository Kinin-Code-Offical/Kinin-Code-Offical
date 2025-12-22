# Profile Customization Guide

Welcome! This repository powers the `Kinin-Code-Offical` GitHub profile page. Everything is configurable without extra secrets beyond `GITHUB_TOKEN`.

## 1) Update your story
- Edit `scripts/config.json` for display name, tagline, social links, and the "Now" list.
- Override featured repositories via `featuredOverrides` (use `owner/name`).
- Adjust theme colors under `theme`.

## 2) Regenerate assets locally
- Install Node.js 18+.
- `npm install`
- `npm run generate:metrics` — pulls GitHub activity and writes metrics + pacman SVGs.
- `npm run generate:cards` — builds the Impact + Focus SVG cards from metrics.
- `npm run generate:featured` — curates featured projects and writes the markdown snippet.
- `npm run validate:assets` — verifies JSON schema and SVG presence.
- `npm run format` — optional formatting pass.

## 3) Automation
- `.github/workflows/build-profile-assets.yml` runs daily and on changes to scripts/config to regenerate assets, then uses the composite action to commit if there are diffs.
- `.github/workflows/lint-readme.yml` checks markdown style and prettier formatting on push/PR.
- `.github/workflows/validate-assets.yml` ensures generated files stay valid.

## 4) Composite action
- `.github/actions/commit-if-changed` configures git as `github-actions[bot]`, commits with a meaningful message, and skips commit if there are no changes.

## 5) Featured projects logic
- Manual overrides always appear first.
- Remaining slots are filled by pinned items, then top-starred recent repositories.
- Output lives in `assets/generated/featured-projects.json` and `assets/generated/featured-projects.md`.

## 6) Metrics logic
- Uses GitHub GraphQL API to count commits, PRs, issues, and reviews for the last 30 days.
- Computes contribution streak from the contribution calendar.
- Aggregates top languages from recent repositories.
- Produces pacman-style light/dark SVGs plus Impact/Focus cards in `assets/cards/`.

## 7) README wiring
- The README consumes `assets/generated/featured-projects.md` and SVG cards from `assets/cards/`.
- Swap links (portfolio/resume/social) in `scripts/config.json` or directly in README if desired.

## 8) Lite mode
- A commented "Lite" block in `README.md` removes heavy images; uncomment to use when bandwidth matters.

## 9) Troubleshooting
- Missing token: ensure GitHub Actions uses the default `GITHUB_TOKEN` (no extra scopes needed).
- API limits: workflows are scheduled daily; rerun manually via `workflow_dispatch` if needed.
- Validation failures: run `npm run validate:assets` locally to see which schema check failed.
