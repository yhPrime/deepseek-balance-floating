# DeepSeek Balance Floating Widget (dsh-balance-floating)

> A floating widget pinned at the bottom-left of the DeepSeek Harness web GUI:
> **red balance bar (account balance)**, **blue remaining-token ring (estimated)**, and a
> **today's usage bar**.
> Data is **powered by [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)**:
> balance comes from the official DeepSeek `/user/balance` API, and token/cost data comes
> from the ledger it builds by intercepting `llm/stream`.

## Layout

Bottom-left of the sidebar (`sidebar.footer.action`, first cell — it pushes the
"Cordis plugin" button and the settings button to the right):

```
┌────────────┐
│  🔴 余额   │  ← red ring: account balance, full = ¥100, click to refresh
│  🔵 剩余   │  ← blue ring: estimated remaining tokens, full = ¥100 worth of tokens
└────────────┘
  今日 5820万   ← today's usage bar; label above the bar, color auto-inverted
  ▮▮▮▮▮▮▮▮    ← blue fill = today's tokens ÷ ¥100 token quota
```

- Hover any ring/bar for details (total/granted/topped-up, estimate basis, input/output/cache
  breakdown, call count).
- Auto-refresh every 60 s; follows light/dark/system themes (reads theme semantic tokens);
  the "today" label uses `mix-blend-mode: difference` for per-pixel auto-inversion.
- Auto-hides in the narrow sidebar (rail) mode.

## Dependency

**Required:** this plugin performs no networking and no bookkeeping — it only displays.
All data comes from **[dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) v1.3.1+**
(official balance endpoint, token/cost ledger, official price table).

Install and enable dsh-cost-meter first, then this plugin.

## Install

Prerequisites: DeepSeek Harness ≥ 0.1.0-rc.5 and dsh-cost-meter installed.

```bash
# Option 1: add from a local directory
dsh plugin --profile web add /path/to/dsh-balance-floating

# Option 2: clone and add
git clone <repo-url>
dsh plugin --profile web add <cloned-dir>

# Option 3: copy into the profile's node_modules, then add
cp -r dsh-balance-floating ~/.dsh/profiles/web/node_modules/
dsh plugin --profile web add dsh-balance-floating
```

Restart (or refresh) DeepSeek Harness afterwards.

## Configuration

No settings page yet. The two scales are constants in `lib/client.js`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `BALANCE_CAP` | `100` | Full balance-bar amount (¥) |
| `BLEND_INPUT` / `BLEND_OUTPUT` | `0.7` / `0.3` | Blended unit-price weights for the remaining-token estimate (input cache-miss / output) |
| today bar quota | ¥100 worth of tokens | same baseline as the blue ring |

## How it works

1. **Data**: the client calls `remote.costMeter.getState()` / `refreshBalance()` over Typert RPC —
   the same channel dsh-cost-meter's own UI uses.
2. **Balance bar**: `balance.totalBalance`, fill = `balance / 100`.
3. **Remaining tokens**: `balance ÷ exchangeRate ÷ blended price` (blended = `0.7 × input
   cache-miss + 0.3 × output` of the current model's price table, USD/1M tokens); full blue =
   tokens worth ¥100.
4. **Today's bar**: `today(input+output+cacheRead+cacheWrite) ÷ full-blue tokens`.
5. **Theming**: resolved `--dsw-alias-*` semantic colors read via `getComputedStyle` are applied
   inline; the "today" label auto-inverts via `mix-blend-mode: difference`.

## Credits / License

- Data layer: **[dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)** (MIT) — this
  plugin's balance and usage data is entirely based on it.
- UI layer: independently implemented (rings/bars), built on DeepSeek Harness's `--dsw-*` theme
  tokens and the Slot system.

MIT License — see [LICENSE](./LICENSE).
