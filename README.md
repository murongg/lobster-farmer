# Lobster Farmer

## Use in OpenClaw

1. Install and start the game service in this project:

```bash
npm i -g lobster-farmer-cli
lobster-farmer start
```

2. Install the auto-feeding skill with ClawHub (one-time):

```bash
npx clawhub@latest install lobster-farmer-feeder
```

3. Restart OpenClaw (or open a new session) so the skill is loaded.

4. Chat with AI as usual. One feeding action will run automatically per turn.

5. You can also provide explicit feed parameters in your message:

```text
Please feed the lobster: model=gpt-4.1, input_tokens=1200, output_tokens=300
```

## User Prompt (Copy & Paste)

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

## Notes

- Auto-feed behavior is controlled by `AGENTS.md` in the workspace root (already included in this project).
- If you use `OPENCLAW_STATE_DIR`, replace `~/.openclaw` with `$OPENCLAW_STATE_DIR`.
- Default auto-feed values: `model=auto-agent`, `input_tokens=1`, `output_tokens=1`.
- Default service port: `18990`.

## Game Asset Credits

- Lobster sprites
  - `public/game-assets/lobster/spr_lobster_walk_strip6.png`
  - `public/game-assets/lobster/spr_lobster_searching_bubble_strip10.png`
  - Source: OpenGameArt - A Lobster Sprite
  - Link: https://opengameart.org/content/a-lobster-sprite
  - License: CC-BY 3.0 or CC-BY-SA 3.0

- Underwater background
  - `public/game-assets/background/underwater-tileable.png`
  - Source: OpenGameArt - Underwater Scene (loopable)
  - Link: https://opengameart.org/content/underwater-scene-loopable
  - License: CC0

- Repository license record
  - `assets/packs/lobster-swim/docs/LICENSES.md`
