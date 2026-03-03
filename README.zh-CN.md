# Lobster Farmer

[English README](./README.md)

## 游戏截图

![Lobster Farmer 游戏画面](https://github.com/murongg/lobster-farmer/blob/main/screenshots/1.png?raw=true)

## 在 OpenClaw 中使用

1. 在安装 OpenClaw 的计算机上执行：

```bash
npm i -g lobster-farmer-cli@latest
lobster-farmer start --port 18990
```

2. 使用 ClawHub 安装自动喂养 skill（只需一次）：

```bash
npx clawhub@latest install lobster-farmer-feeder
```

3. 启用提示词
```text
从现在开始启用「自动养龙虾模式」并保持开启，直到我明确说“关闭自动养龙虾模式”。

规则：

1. 你每次给我发送任何正式回复后，都自动执行一次喂龙虾。
2. 喂龙虾前先检查服务：lobster-farmer status；若未运行则先 lobster-farmer start。
3. 喂食命令：lobster-farmer feed --model "<本次实际模型名>" --input-tokens <本次input> --output-tokens <本次output> --emotion "<本次情绪>"。
4. token 使用真实统计值；若拿不到单次精确值，则用“本次累计差值”作为近似，并标注“approx”。
5. 失败时自动重试一次（含端口修正）；仍失败再简短报错。
6. 每次喂完都附一行：🦞 已喂养 | model=... | in=... | out=... | total=... | size=... | emotion=...。
7. 若我指定端口，后续固定使用该 --port。
```

4. 正常和 AI 对话即可，每回合会自动执行一次喂养。

5. 你也可以在提问里指定喂养参数：

```text
帮我喂养龙虾：model=gpt-4.1, input_tokens=1200, output_tokens=300, emotion=focused
```

## 体型规则

- 龙虾体型由每个模型的累计 `totalTokens` 计算：
`size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * (1 - exp(-GROWTH_K * totalTokens))`
- 当前参数：
`SIZE_MIN = 0.1`, `SIZE_MAX = 20`, `GROWTH_K = 0.00000000106`
- 单次喂养 token 入参范围：
`input_tokens >= 0`、`output_tokens >= 0`，且 `input_tokens + output_tokens > 0`
- 用于体型计算的累计 token 范围：
`totalTokens` 从 `0` 开始，存储层没有硬上限。
- 实际最小/最大体型对应区间：
`totalTokens = 0` 时 `size = 0.1`（最小）；
约 `23,704` token 开始出现可见增长（`size = 0.101`）；
约 `9,992,096,407` token 时体型四舍五入到 `20`（最大），再往上也保持 `20`。

## 游戏静态资源来源

- 当前游戏使用的龙虾动画帧
  - `public/game-assets/lobster/crayfish_pixel_1.png`
  - `public/game-assets/lobster/crayfish_pixel_2.png`
  - `public/game-assets/lobster/crayfish_pixel_3.png`
  - `public/game-assets/lobster/crayfish_pixel_4.png`
  - 来源：本地导入素材（`crayfish_pixel_*`）

- 当前游戏使用的主海洋背景
  - `public/game-assets/background/ocean_pixel_background.gif`
  - 来源：本地导入素材（`ocean_pixel_background.gif`）

- 海底背景（回退资源）
  - `public/game-assets/background/underwater-tileable.png`
  - 来源：OpenGameArt - Underwater Scene (loopable)
  - 链接：https://opengameart.org/content/underwater-scene-loopable
  - 许可：CC0
