# Lobster Farmer

[中文文档 (Simplified Chinese)](./README.zh-CN.md)

## Screenshot

![Lobster Farmer Gameplay](https://github.com/murongg/lobster-farmer/blob/main/screenshots/1.png?raw=true)

## Use in OpenClaw

1. On the machine where OpenClaw is installed, run:

```bash
npm i -g lobster-farmer-cli@latest
lobster-farmer start
```

2. Install the auto-feeding skill with ClawHub (one-time):

```bash
npx clawhub@latest install lobster-farmer-feeder
```

3. Startup prompt
```text
From now on, enable "Auto Lobster Farming Mode" and keep it enabled until I explicitly say "Disable auto lobster farming mode".

Rules:

1. After every formal reply you send, automatically run one feeding action.
2. Before feeding, check service status with: lobster-farmer status; if not running, start with lobster-farmer start.
3. Feeding command: lobster-farmer feed --model "<actual model name used in this turn>" --input-tokens <current input> --output-tokens <current output>.
4. Use real token stats when available; if exact per-turn values are unavailable, use an approximate delta and mark it as "approx".
5. If feeding fails, retry once automatically (including port correction if needed). If it still fails, report a short error.
6. After each feed, append one line: 🦞 Fed | model=... | in=... | out=... | total=... | size=....
7. If I specify a port, always use that --port for later feed actions.
```

4. Chat with AI as usual. One feeding action will run automatically per turn.

5. You can also provide explicit feed parameters in your message:

```text
Please feed the lobster: model=gpt-4.1, input_tokens=1200, output_tokens=300
```

## Notes

- Auto-feed behavior is controlled by `AGENTS.md` in the workspace root (already included in this project).
- If you use `OPENCLAW_STATE_DIR`, replace `~/.openclaw` with `$OPENCLAW_STATE_DIR`.
- Default auto-feed values: `model=auto-agent`, `input_tokens=1`, `output_tokens=1`.
- Default service port: `18990`.

## Size Rule

- The lobster size is calculated from cumulative `totalTokens` per model:
`size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * (1 - exp(-GROWTH_K * totalTokens))`
- Current parameters:
`SIZE_MIN = 0.1`, `SIZE_MAX = 20`, `GROWTH_K = 0.00000000106`
- Feed token input range (per request):
`input_tokens >= 0`, `output_tokens >= 0`, and `input_tokens + output_tokens > 0`
- Effective total token range for size:
`totalTokens` starts at `0` and has no hard upper cap in storage.
- Practical min/max checkpoints:
`totalTokens = 0` -> `size = 0.1` (min);
first visible increase at about `23,704` tokens (`size = 0.101`);
size rounds to `20` (max) at about `9,992,096,407` tokens, and stays at `20` beyond that.
- Practical behavior:
growth is fast at the beginning and gradually saturates near the max size.

## Game Asset Credits

- Lobster animation frames currently used in game
  - `public/game-assets/lobster/crayfish_pixel_1.png`
  - `public/game-assets/lobster/crayfish_pixel_2.png`
  - `public/game-assets/lobster/crayfish_pixel_3.png`
  - `public/game-assets/lobster/crayfish_pixel_4.png`
  - Source: local imported asset (`crayfish_pixel_*`)

- Primary ocean background currently used in game
  - `public/game-assets/background/ocean_pixel_background.gif`
  - Source: local imported asset (`ocean_pixel_background.gif`)

- Fallback underwater background
  - `public/game-assets/background/underwater-tileable.png`
  - Source: OpenGameArt - Underwater Scene (loopable)
  - Link: https://opengameart.org/content/underwater-scene-loopable
  - License: CC0
