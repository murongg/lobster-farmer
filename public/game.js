const { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Texture, TilingSprite } = PIXI;

const BG_IMAGE = "/game-assets/background/underwater-tileable.png";
const WALK_STRIP = "/game-assets/lobster/spr_lobster_walk_strip6.png";
const BUBBLE_STRIP = "/game-assets/lobster/spr_lobster_searching_bubble_strip10.png";

const BASE_RED = 0xff3b30;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snap(value, grid = 2) {
  return Math.round(value / grid) * grid;
}

function splitStrip(texture, frames, frameWidth, frameHeight) {
  const result = [];
  for (let index = 0; index < frames; index += 1) {
    result.push(new Texture(texture.baseTexture, new Rectangle(index * frameWidth, 0, frameWidth, frameHeight)));
  }
  return result;
}

async function loadAssets() {
  const [bgTexture, walkTexture, bubbleTexture] = await Promise.all([
    Assets.load(BG_IMAGE),
    Assets.load(WALK_STRIP),
    Assets.load(BUBBLE_STRIP)
  ]);

  return {
    bgTexture,
    walkFrames: splitStrip(walkTexture, 6, 60, 29),
    bubbleFrames: splitStrip(bubbleTexture, 10, 16, 16)
  };
}

function createBubble(width, height) {
  const size = 2 + Math.floor(Math.random() * 3) * 2;
  const node = new Graphics();
  node.beginFill(0x9ad9ff, 0.72);
  node.drawRect(-size / 2, -size / 2, size, size);
  node.endFill();
  node.x = snap(Math.random() * width);
  node.y = snap(Math.random() * height);

  return {
    node,
    speed: 0.7 + Math.random() * 1.8,
    phase: Math.random() * Math.PI * 2,
    drift: 0.14 + Math.random() * 0.34
  };
}

function resetBubble(bubble, width, height) {
  bubble.node.x = snap(Math.random() * width);
  bubble.node.y = snap(height + 10 + Math.random() * 60);
}

function drawBackground(scene) {
  const texWidth = scene.assets.bgTexture.width;
  const texHeight = scene.assets.bgTexture.height;
  const scale = scene.height / texHeight;
  const tileWidth = texWidth * scale;
  const offsetX = snap((scene.width - tileWidth) * 0.5);

  scene.bgSprite.width = scene.width;
  scene.bgSprite.height = scene.height;
  scene.bgSprite.tileScale.set(scale, scale);
  scene.bgSprite.tilePosition.x = offsetX;
  scene.bgSprite.tilePosition.y = 0;
}

function createModelLobster(scene, model) {
  const container = new Container();

  const sprite = new AnimatedSprite(scene.assets.walkFrames);
  sprite.anchor.set(0.5, 0.5);
  sprite.animationSpeed = 0.11 + Math.random() * 0.05;
  sprite.roundPixels = true;
  sprite.tint = BASE_RED;
  sprite.play();

  const bubble = new AnimatedSprite(scene.assets.bubbleFrames);
  bubble.anchor.set(0.5, 0.5);
  bubble.animationSpeed = 0.18;
  bubble.scale.set(1.6, 1.6);
  bubble.position.set(0, -24);
  bubble.alpha = 0.5;
  bubble.roundPixels = true;
  bubble.play();

  container.addChild(sprite);
  container.addChild(bubble);

  scene.modelLayer.addChild(container);

  return {
    model,
    container,
    sprite,
    bubble,
    baseX: scene.width * 0.5,
    baseY: scene.height * 0.5,
    driftX: 18 + Math.random() * 22,
    driftY: 8 + Math.random() * 16,
    phase: Math.random() * Math.PI * 2,
    scale: 1.8,
    direction: Math.random() > 0.5 ? 1 : -1
  };
}

function destroyModelLobster(entity) {
  entity.container.destroy({ children: true });
}

function syncModelLobsters(scene, lobsterState) {
  const nextMap = lobsterState?.lobsters ?? {};
  const nextModels = new Set(Object.keys(nextMap));

  for (const [model, entity] of Object.entries(scene.modelLobsters)) {
    if (!nextModels.has(model)) {
      destroyModelLobster(entity);
      delete scene.modelLobsters[model];
    }
  }

  for (const model of nextModels) {
    if (!scene.modelLobsters[model]) {
      scene.modelLobsters[model] = createModelLobster(scene, model);
    }
  }

  const entries = Object.entries(nextMap).sort((a, b) => b[1].tokens - a[1].tokens);
  const count = entries.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  const swimWidth = Math.max(220, scene.swimBounds.right - scene.swimBounds.left);
  const swimHeight = Math.max(180, scene.swimBounds.bottom - scene.swimBounds.top);
  const cellW = swimWidth / cols;
  const cellH = swimHeight / rows;

  entries.forEach(([model, lobster], index) => {
    const entity = scene.modelLobsters[model];
    const col = index % cols;
    const row = Math.floor(index / cols);

    entity.baseX = snap(scene.swimBounds.left + col * cellW + cellW * 0.5 + (col % 2 === 0 ? -10 : 10));
    entity.baseY = snap(scene.swimBounds.top + row * cellH + cellH * 0.5 + (row % 2 === 0 ? -6 : 8));

    const targetScale = clamp(typeof lobster.size === "number" ? lobster.size : 1.7, 1.7, 4.8);
    entity.scale = targetScale;

    entity.sprite.tint = BASE_RED;
    entity.sprite.scale.set(entity.direction > 0 ? targetScale : -targetScale, targetScale);

    entity.container.zIndex = lobster.tokens;
  });

  scene.modelLayer.sortableChildren = true;
}

function spawnFood(scene, tokens, model) {
  const amount = clamp(Math.round(Math.log2(tokens + 2) * 4), 4, 24);
  const target = scene.modelLobsters[model];
  const targetX = target ? target.container.x : scene.width * 0.5;
  const targetY = target ? target.container.y : scene.height * 0.5;

  for (let index = 0; index < amount; index += 1) {
    const size = 4 + Math.floor(Math.random() * 3) * 2;
    const node = new Graphics();
    const color = index % 2 === 0 ? 0x77d5ff : 0x53f2cf;

    node.beginFill(color, 0.96);
    node.drawRect(-size / 2, -size / 2, size, size);
    node.endFill();
    node.x = snap(40 + Math.random() * (scene.width - 80));
    node.y = snap(-30 - Math.random() * 120);

    scene.foodLayer.addChild(node);

    scene.foods.push({
      node,
      vx: (Math.random() - 0.5) * 2,
      vy: 1.2 + Math.random() * 1.8,
      life: 0,
      targetX: targetX + (Math.random() - 0.5) * 24,
      targetY: targetY + (Math.random() - 0.5) * 16
    });
  }
}

function layout(scene, width, height) {
  scene.width = width;
  scene.height = height;
  drawBackground(scene);

  scene.swimBounds.left = 26;
  scene.swimBounds.right = width - 26;
  scene.swimBounds.top = 34;
  scene.swimBounds.bottom = height - 120;

  syncModelLobsters(scene, scene.stateRef());
}

function updateScene(scene, deltaTime) {
  const delta = deltaTime;
  scene.elapsed += delta;
  scene.bgSprite.tilePosition.x -= 0.12 * delta;

  for (const entity of Object.values(scene.modelLobsters)) {
    entity.container.x = snap(entity.baseX + Math.sin(scene.elapsed * 0.035 + entity.phase) * entity.driftX);
    entity.container.y = snap(entity.baseY + Math.sin(scene.elapsed * 0.05 + entity.phase * 1.3) * entity.driftY);
    entity.bubble.alpha = 0.42 + Math.sin(scene.elapsed * 0.07 + entity.phase) * 0.2;
  }

  for (const bubble of scene.bubbles) {
    bubble.node.y -= bubble.speed * delta;
    bubble.node.x += Math.sin(scene.elapsed * bubble.drift + bubble.phase) * 0.45 * delta;

    if (bubble.node.y < -18) {
      resetBubble(bubble, scene.width, scene.height);
    }
  }

  for (let index = scene.foods.length - 1; index >= 0; index -= 1) {
    const orb = scene.foods[index];
    orb.life += delta;

    const dx = orb.targetX - orb.node.x;
    const dy = orb.targetY - orb.node.y;

    orb.vx += dx * 0.0032 * delta;
    orb.vy += dy * 0.0032 * delta;
    orb.vx *= 0.965;
    orb.vy *= 0.965;

    orb.node.x = snap(orb.node.x + orb.vx * delta * 2.2);
    orb.node.y = snap(orb.node.y + orb.vy * delta * 2.2);
    orb.node.alpha = clamp(1 - orb.life / 100, 0.2, 1);

    if ((dx * dx + dy * dy < 180 || orb.life > 110) && orb.node.parent) {
      orb.node.parent.removeChild(orb.node);
      orb.node.destroy();
      scene.foods.splice(index, 1);
    }
  }
}

async function apiRequest(path, options) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `请求失败: ${response.status}`);
  }

  return response.json();
}

const root = document.getElementById("game");
if (!root) {
  throw new Error("缺少 #game 容器");
}

const host = document.createElement("div");
host.className = "game-canvas-host";
root.appendChild(host);

const gameState = {
  lobster: null,
  lastTokensByModel: {}
};

let sceneRef = null;
let resizeObserverRef = null;
let pollTimer = null;

function syncView() {
  if (!sceneRef) {
    return;
  }
  syncModelLobsters(sceneRef, gameState.lobster);
}

function applyServerState(nextState) {
  const previousTokens = gameState.lastTokensByModel;
  const nextTokens = {};

  if (sceneRef) {
    for (const [model, lobster] of Object.entries(nextState.lobsters ?? {})) {
      const prev = previousTokens[model] ?? 0;
      if (lobster.tokens > prev) {
        spawnFood(sceneRef, lobster.tokens - prev, model);
      }
      nextTokens[model] = lobster.tokens;
    }
  } else {
    for (const [model, lobster] of Object.entries(nextState.lobsters ?? {})) {
      nextTokens[model] = lobster.tokens;
    }
  }

  gameState.lobster = nextState;
  gameState.lastTokensByModel = nextTokens;
  syncView();
}

async function pullState() {
  try {
    const payload = await apiRequest("/api/state");
    applyServerState(payload.state);
  } catch (error) {
    console.error("同步状态失败", error);
  }
}

function cleanupScene() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (resizeObserverRef) {
    resizeObserverRef.disconnect();
    resizeObserverRef = null;
  }

  if (!sceneRef) {
    return;
  }

  sceneRef.foods.forEach((orb) => {
    orb.node.destroy();
  });
  sceneRef.bubbles.forEach((bubble) => {
    bubble.node.destroy();
  });
  Object.values(sceneRef.modelLobsters).forEach((entity) => {
    destroyModelLobster(entity);
  });
  sceneRef.app.destroy(true, { children: true, texture: true, baseTexture: true });
  sceneRef = null;
}

async function initGame() {
  const assets = await loadAssets();

  const app = new Application({
    antialias: false,
    autoDensity: true,
    resizeTo: host,
    backgroundAlpha: 0
  });

  const rootLayer = new Container();
  const bgLayer = new Container();
  const bgSprite = new TilingSprite(assets.bgTexture, host.clientWidth, host.clientHeight);
  bgLayer.addChild(bgSprite);

  const bubbleLayer = new Container();
  const modelLayer = new Container();
  const foodLayer = new Container();

  rootLayer.addChild(bgLayer);
  rootLayer.addChild(bubbleLayer);
  rootLayer.addChild(modelLayer);
  rootLayer.addChild(foodLayer);

  app.stage.addChild(rootLayer);
  host.appendChild(app.view);

  const scene = {
    app,
    assets,
    bgSprite,
    bubbleLayer,
    modelLayer,
    foodLayer,
    bubbles: [],
    foods: [],
    modelLobsters: {},
    elapsed: 0,
    width: host.clientWidth,
    height: host.clientHeight,
    swimBounds: {
      left: 26,
      right: host.clientWidth - 26,
      top: 34,
      bottom: host.clientHeight - 120
    },
    stateRef: () => gameState.lobster
  };

  for (let index = 0; index < 46; index += 1) {
    const bubble = createBubble(scene.width, scene.height);
    scene.bubbles.push(bubble);
    scene.bubbleLayer.addChild(bubble.node);
  }

  layout(scene, scene.width, scene.height);
  sceneRef = scene;

  resizeObserverRef = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry || !sceneRef) {
      return;
    }

    const width = Math.max(360, Math.round(entry.contentRect.width));
    const height = Math.max(500, Math.round(entry.contentRect.height));
    layout(sceneRef, width, height);
  });
  resizeObserverRef.observe(host);

  app.ticker.add((deltaTime) => {
    if (!sceneRef) {
      return;
    }
    updateScene(sceneRef, deltaTime);
  });

  await pullState();
  pollTimer = setInterval(() => {
    void pullState();
  }, 2000);
}

window.addEventListener("beforeunload", cleanupScene);

void initGame().catch((error) => {
  console.error("游戏初始化失败", error);
});
