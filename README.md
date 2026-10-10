# Nuspad

**A live Solana token radar.** One calm board for the busiest names on the chain.

[![Live site](https://img.shields.io/badge/live-nuspad.fun-0adcbd?style=for-the-badge)](https://nuspad.fun)
![Chain](https://img.shields.io/badge/chain-Solana-36ec88?style=for-the-badge)

**Contract address:** pending

## Overview

Nuspad gathers the most promoted tokens on Solana, pairs each one with its pools, and ranks the ten with the heaviest 24h flow on a single page. It refreshes every minute while the tab is visible, stops when the tab is hidden, and keeps the last good numbers if the feed stumbles.

Anything that has not been confirmed is shown as `pending`. There are no placeholder links and no invented figures.

## Features

- Ranked board of ten tokens with logo, price, 24h change, turnover, pooled liquidity and a copy-address button
- Scrolling ticker fed by the same live data
- Sort tabs (flow, gainers, decliners, depth, valuation), quote filter, search, card and row layouts
- Skeleton loading, staggered entrance, count-up numbers with a flash on change
- Reduced-motion support: every animation has an instant fallback
- Contract slot at the top of the page that stays inert until an address is confirmed
- Static output in `dist/`, ready to upload to any static host

## Links

- Website: <https://nuspad.fun>
- X: pending
- GitHub: pending
- Network: Solana
- Market data: DexScreener public API

## Build

```bash
npm install
npm run build   # writes dist/
npm run gates   # builds, then checks dist/ against the project rules
```

## License

MIT. See [LICENSE](LICENSE).
