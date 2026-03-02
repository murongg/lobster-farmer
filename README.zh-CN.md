# Lobster Farmer

## 在 OpenClaw 中使用

1. 在项目目录启动游戏服务：

```bash
npm i -g lobster-farmer-cli
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
3. 喂食命令：lobster-farmer feed --model "<本次实际模型名>" --input-tokens <本次input> --output-tokens <本次output>。
4. token 使用真实统计值；若拿不到单次精确值，则用“本次累计差值”作为近似，并标注“approx”。
5. 失败时自动重试一次（含端口修正）；仍失败再简短报错。
6. 每次喂完都附一行：🦞 已喂养 | model=... | in=... | out=... | total=... | size=...。
7. 若我指定端口，后续固定使用该 --port。
```

4. 正常和 AI 对话即可，每回合会自动执行一次喂养。

5. 你也可以在提问里指定喂养参数：

```text
帮我喂养龙虾：model=gpt-4.1, input_tokens=1200, output_tokens=300
```

## 游戏静态资源来源

- 龙虾精灵
  - `public/game-assets/lobster/spr_lobster_walk_strip6.png`
  - `public/game-assets/lobster/spr_lobster_searching_bubble_strip10.png`
  - 来源：OpenGameArt - A Lobster Sprite
  - 链接：https://opengameart.org/content/a-lobster-sprite
  - 许可：CC-BY 3.0 或 CC-BY-SA 3.0

- 海底背景
  - `public/game-assets/background/underwater-tileable.png`
  - 来源：OpenGameArt - Underwater Scene (loopable)
  - 链接：https://opengameart.org/content/underwater-scene-loopable
  - 许可：CC0
