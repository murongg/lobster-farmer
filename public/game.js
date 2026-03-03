const { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Text, Texture, TilingSprite } = PIXI;

const BG_IMAGE = "/game-assets/background/ocean_pixel_background.gif";
const BG_FALLBACK_IMAGE = "/game-assets/background/underwater-tileable.png";
const WALK_FRAMES = [
  "/game-assets/lobster/crayfish_pixel_1.png",
  "/game-assets/lobster/crayfish_pixel_2.png",
  "/game-assets/lobster/crayfish_pixel_3.png",
  "/game-assets/lobster/crayfish_pixel_4.png"
];
const BASE_RED = 0xffffff;
const NAME_LABEL_STYLE = {
  fontFamily: "monospace",
  fontSize: 10,
  fontWeight: "700",
  fill: 0xf2f8ff,
  stroke: 0x073b5e,
  strokeThickness: 3
};
const POPUP_TEXT_STYLE = {
  fontFamily: "monospace",
  fontSize: 11,
  fontWeight: "700",
  fill: 0xe9f8ff,
  lineHeight: 14,
  stroke: 0x041d2f,
  strokeThickness: 3
};
const EMOTION_TEXT_STYLE = {
  fontFamily: "monospace",
  fontSize: 9,
  fontWeight: "700",
  fill: 0xebf8ff,
  stroke: 0x06253a,
  strokeThickness: 3
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snap(value, grid = 2) {
  return Math.round(value / grid) * grid;
}

function randomInRange(min, max) {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function normalizeAngle(angle) {
  let next = angle;
  const full = Math.PI * 2;
  while (next > Math.PI) {
    next -= full;
  }
  while (next < -Math.PI) {
    next += full;
  }
  return next;
}

function splitStrip(texture, frames, frameWidth, frameHeight) {
  const result = [];
  for (let index = 0; index < frames; index += 1) {
    result.push(new Texture(texture.baseTexture, new Rectangle(index * frameWidth, 0, frameWidth, frameHeight)));
  }
  return result;
}

function toTexture(candidate) {
  if (!candidate) {
    return null;
  }
  if (candidate instanceof Texture) {
    return candidate;
  }
  if (candidate.texture instanceof Texture) {
    return candidate.texture;
  }
  if (Array.isArray(candidate) && candidate[0] instanceof Texture) {
    return candidate[0];
  }
  if (Array.isArray(candidate?.textures) && candidate.textures[0] instanceof Texture) {
    return candidate.textures[0];
  }
  try {
    return Texture.from(candidate);
  } catch (_error) {
    return null;
  }
}

async function loadBackgroundTexture() {
  try {
    const loaded = await Assets.load(BG_IMAGE);
    const texture = toTexture(loaded) || toTexture(typeof Assets.get === "function" ? Assets.get(BG_IMAGE) : null) || toTexture(BG_IMAGE);
    if (texture) {
      return texture;
    }
  } catch (_error) {
    // Fallback to static texture below.
  }

  try {
    const fallback = await Assets.load(BG_FALLBACK_IMAGE);
    const texture = toTexture(fallback) || toTexture(typeof Assets.get === "function" ? Assets.get(BG_FALLBACK_IMAGE) : null) || toTexture(BG_FALLBACK_IMAGE);
    if (texture) {
      return texture;
    }
  } catch (_error) {
    // Use PIXI built-in white texture as last resort.
  }

  return Texture.WHITE;
}

function removeGreenScreenAndCrop(texture) {
  const source = texture?.baseTexture?.resource?.source;
  if (!source || typeof document === "undefined") {
    return texture;
  }

  const frame = texture.frame ?? new Rectangle(0, 0, texture.width, texture.height);
  const width = Math.max(1, Math.round(frame.width));
  const height = Math.max(1, Math.round(frame.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return texture;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, frame.x, frame.y, width, height, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];

      const isGreenScreen = g > 150 && g > r * 1.2 && g > b * 1.2;
      if (isGreenScreen) {
        pixels[offset + 3] = 0;
        continue;
      }

      if (pixels[offset + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    return Texture.from(canvas);
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) {
    return Texture.from(canvas);
  }

  cropCtx.imageSmoothingEnabled = false;
  cropCtx.clearRect(0, 0, cropW, cropH);
  cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return Texture.from(cropCanvas);
}

function formatModelLabel(model, limit = 18) {
  const clean = String(model || "").trim();
  if (clean.length <= limit) {
    return clean;
  }
  return `${clean.slice(0, Math.max(1, limit - 1))}…`;
}

function formatNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return Math.floor(number).toLocaleString("en-US");
}

function buildPopupText(model, lobster) {
  return [
    `Model: ${formatModelLabel(model, 24)}`,
    `Emotion: ${lobster?.emotion ? formatModelLabel(lobster.emotion, 24) : "?"}`,
    `Total: ${formatNumber(lobster?.tokens)}`,
    `Input: ${formatNumber(lobster?.inputTokens)}`,
    `Output: ${formatNumber(lobster?.outputTokens)}`
  ].join("\n");
}

function getEmotionMeta(lobster) {
  const rawEmotion = typeof lobster?.emotion === "string" ? lobster.emotion.trim() : "";
  if (!rawEmotion) {
    return { text: "?", accent: 0x9eb4c2 };
  }

  return {
    text: formatModelLabel(rawEmotion, 10),
    accent: 0x57f2a7
  };
}

function updateEmotionBadge(entity, lobster) {
  const { text, accent } = getEmotionMeta(lobster);
  entity.emotionText.text = text;

  const width = snap(Math.max(20, entity.emotionText.width + 12));
  const height = 14;

  entity.emotionBg.clear();
  entity.emotionBg.lineStyle(2, accent, 0.96);
  entity.emotionBg.beginFill(0x062238, 0.88);
  entity.emotionBg.drawRect(-width * 0.5, -height * 0.5, width, height);
  entity.emotionBg.endFill();

  entity.emotionText.position.set(0, 0);
  entity.emotionBadge.position.y = snap(-24 - entity.scale * 10);
}

function createInfoPopup(scene) {
  const container = new Container();
  container.visible = false;
  container.zIndex = 1_000_000;

  const panel = new Graphics();
  const text = new Text("", POPUP_TEXT_STYLE);
  text.position.set(10, 8);
  text.roundPixels = true;

  container.addChild(panel);
  container.addChild(text);
  scene.popupLayer.addChild(container);

  return {
    container,
    panel,
    text,
    model: null
  };
}

function hideInfoPopup(scene) {
  scene.infoPopup.model = null;
  scene.infoPopup.container.visible = false;
}

function updateInfoPopup(scene) {
  const infoPopup = scene.infoPopup;
  const model = infoPopup.model;
  if (!model) {
    infoPopup.container.visible = false;
    return;
  }

  const state = scene.stateRef();
  const lobster = state?.lobsters?.[model];
  const entity = scene.modelLobsters[model];

  if (!lobster || !entity) {
    hideInfoPopup(scene);
    return;
  }

  infoPopup.text.text = buildPopupText(model, lobster);
  const panelWidth = snap(infoPopup.text.width + 20);
  const panelHeight = snap(infoPopup.text.height + 16);

  infoPopup.panel.clear();
  infoPopup.panel.lineStyle(2, 0x8de7ff, 0.95);
  infoPopup.panel.beginFill(0x052438, 0.9);
  infoPopup.panel.drawRect(0, 0, panelWidth, panelHeight);
  infoPopup.panel.endFill();

  const targetX = entity.container.x - panelWidth * 0.5;
  const targetY = entity.container.y - panelHeight - snap(20 + entity.scale * 8);

  const x = clamp(snap(targetX), 8, scene.width - panelWidth - 8);
  const y = clamp(snap(targetY), 8, scene.height - panelHeight - 8);

  infoPopup.container.position.set(x, y);
  infoPopup.container.visible = true;
}

function showInfoPopup(scene, model) {
  if (scene.infoPopup.model === model && scene.infoPopup.container.visible) {
    hideInfoPopup(scene);
    return;
  }

  scene.infoPopup.model = model;
  updateInfoPopup(scene);
}

async function loadAssets() {
  const [bgTexture, ...rawWalkFrames] = await Promise.all([loadBackgroundTexture(), ...WALK_FRAMES.map((frame) => Assets.load(frame))]);
  const walkFrames = rawWalkFrames.map((frame) => removeGreenScreenAndCrop(frame));

  return {
    bgTexture,
    walkFrames
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
  const texture = toTexture(scene.assets.bgTexture) || toTexture(scene.bgSprite?.texture) || Texture.WHITE;
  const texWidth = Math.max(1, Number(texture.width) || Number(texture.baseTexture?.realWidth) || 1);
  const texHeight = Math.max(1, Number(texture.height) || Number(texture.baseTexture?.realHeight) || 1);
  const scale = scene.height / texHeight;
  const tileWidth = texWidth * scale;
  const offsetX = snap((scene.width - tileWidth) * 0.5);

  scene.bgSprite.texture = texture;
  scene.bgSprite.width = scene.width;
  scene.bgSprite.height = scene.height;
  scene.bgSprite.tileScale.set(scale, scale);
  scene.bgSprite.tilePosition.x = offsetX;
  scene.bgSprite.tilePosition.y = 0;
}

function createModelLobster(scene, model) {
  const minSwimX = scene.swimBounds.left + 12;
  const maxSwimX = scene.swimBounds.right - 12;
  const minSwimY = scene.swimBounds.top + 20;
  const maxSwimY = scene.swimBounds.bottom - 20;
  const spawnX = snap(randomInRange(minSwimX, maxSwimX));
  const spawnY = snap(randomInRange(minSwimY, maxSwimY));
  const heading = randomInRange(-Math.PI, Math.PI);

  const container = new Container();

  const sprite = new AnimatedSprite(scene.assets.walkFrames);
  sprite.anchor.set(0.5, 0.5);
  sprite.animationSpeed = 0.11 + Math.random() * 0.05;
  sprite.roundPixels = true;
  sprite.tint = BASE_RED;
  sprite.play();
  const frameWidth = Number(scene.assets.walkFrames?.[0]?.width ?? 32);
  const frameHeight = Number(scene.assets.walkFrames?.[0]?.height ?? 32);
  const spriteUnitScale = 32 / Math.max(1, frameWidth, frameHeight);

  const emotionBadge = new Container();
  emotionBadge.position.set(0, -36);
  emotionBadge.roundPixels = true;

  const emotionBg = new Graphics();
  const emotionText = new Text("?", EMOTION_TEXT_STYLE);
  emotionText.anchor.set(0.5, 0.5);
  emotionText.roundPixels = true;
  emotionText.position.set(0, 0);

  emotionBadge.addChild(emotionBg);
  emotionBadge.addChild(emotionText);

  const nameLabel = new Text(formatModelLabel(model), NAME_LABEL_STYLE);
  nameLabel.anchor.set(0.5, 0);
  nameLabel.position.set(0, 26);
  nameLabel.roundPixels = true;

  container.addChild(sprite);
  container.addChild(emotionBadge);
  container.addChild(nameLabel);

  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointertap", (event) => {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    showInfoPopup(scene, model);
  });

  scene.modelLayer.addChild(container);

  return {
    model,
    container,
    sprite,
    spriteUnitScale,
    emotionBadge,
    emotionBg,
    emotionText,
    nameLabel,
    x: spawnX,
    y: spawnY,
    heading,
    targetHeading: heading,
    wanderCooldown: randomInRange(45, 140),
    turnRate: randomInRange(0.03, 0.05),
    swimSpeed: 0.42 + Math.random() * 0.32,
    phase: Math.random() * Math.PI * 2,
    scale: 1.2,
    direction: Math.cos(heading) >= 0 ? 1 : -1
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

  Object.entries(nextMap).forEach(([model, lobster]) => {
    const entity = scene.modelLobsters[model];
    const minSwimX = scene.swimBounds.left + 16;
    const maxSwimX = scene.swimBounds.right - 16;
    const minSwimY = scene.swimBounds.top + 20;
    const maxSwimY = scene.swimBounds.bottom - 20;

    if (!Number.isFinite(entity.x)) {
      entity.x = snap(randomInRange(minSwimX, maxSwimX));
    }
    if (!Number.isFinite(entity.y)) {
      entity.y = snap(randomInRange(minSwimY, maxSwimY));
    }
    entity.x = snap(clamp(entity.x, minSwimX, maxSwimX));
    entity.y = snap(clamp(entity.y, minSwimY, maxSwimY));

    if (!Number.isFinite(entity.heading)) {
      entity.heading = randomInRange(-Math.PI, Math.PI);
    }
    if (!Number.isFinite(entity.targetHeading)) {
      entity.targetHeading = entity.heading;
    }
    if (!Number.isFinite(entity.wanderCooldown) || entity.wanderCooldown <= 0) {
      entity.wanderCooldown = randomInRange(45, 140);
    }
    if (!Number.isFinite(entity.turnRate)) {
      entity.turnRate = randomInRange(0.03, 0.05);
    }

    const targetScale = clamp(typeof lobster.size === "number" ? lobster.size : 1.2, 1.2, 4.8);
    entity.scale = targetScale;
    entity.direction = Math.cos(entity.heading) >= 0 ? 1 : -1;

    entity.sprite.tint = BASE_RED;
    const displayScale = targetScale * entity.spriteUnitScale;
    entity.sprite.scale.set(entity.direction > 0 ? displayScale : -displayScale, displayScale);
    entity.nameLabel.position.y = snap(14 + targetScale * 12);
    updateEmotionBadge(entity, lobster);
    entity.container.position.set(entity.x, entity.y);

    entity.container.zIndex = lobster.tokens;
  });

  scene.modelLayer.sortableChildren = true;
  updateInfoPopup(scene);
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

  scene.swimBounds.left = 20;
  scene.swimBounds.right = width - 20;
  scene.swimBounds.top = 20;
  scene.swimBounds.bottom = height - 20;

  scene.app.stage.hitArea = new Rectangle(0, 0, width, height);

  syncModelLobsters(scene, scene.stateRef());
}

function updateScene(scene, deltaTime) {
  const delta = deltaTime;
  scene.elapsed += delta;
  scene.bgSprite.tilePosition.x -= 0.12 * delta;

  const entities = Object.values(scene.modelLobsters);

  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    const xPad = 18 + entity.scale * 18;
    const yPad = 18 + entity.scale * 12;
    const minX = scene.swimBounds.left + xPad;
    const maxX = scene.swimBounds.right - xPad;
    const minY = scene.swimBounds.top + yPad;
    const maxY = scene.swimBounds.bottom - yPad;

    entity.wanderCooldown -= delta;
    if (entity.wanderCooldown <= 0) {
      entity.targetHeading = normalizeAngle(entity.heading + randomInRange(-0.95, 0.95));
      entity.wanderCooldown = randomInRange(70, 170);
    }

    let steerX = Math.cos(entity.targetHeading);
    let steerY = Math.sin(entity.targetHeading);

    const edgeRange = clamp(86 + entity.scale * 16, 82, 160);
    const leftPush = clamp((minX + edgeRange - entity.x) / edgeRange, 0, 1);
    const rightPush = clamp((entity.x - (maxX - edgeRange)) / edgeRange, 0, 1);
    const topPush = clamp((minY + edgeRange - entity.y) / edgeRange, 0, 1);
    const bottomPush = clamp((entity.y - (maxY - edgeRange)) / edgeRange, 0, 1);

    steerX += (leftPush * leftPush - rightPush * rightPush) * 2.2;
    steerY += (topPush * topPush - bottomPush * bottomPush) * 2;

    let separationX = 0;
    let separationY = 0;
    const separationRadius = 56 + entity.scale * 18;
    const separationRadiusSq = separationRadius * separationRadius;
    for (let otherIndex = 0; otherIndex < entities.length; otherIndex += 1) {
      if (otherIndex === index) {
        continue;
      }
      const other = entities[otherIndex];
      const dx = entity.x - other.x;
      const dy = entity.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 1 || distSq >= separationRadiusSq) {
        continue;
      }
      const distance = Math.sqrt(distSq);
      const intensity = (separationRadius - distance) / separationRadius;
      separationX += (dx / distance) * intensity;
      separationY += (dy / distance) * intensity;
    }

    steerX += separationX * 2.8;
    steerY += separationY * 2.2;

    if (Math.abs(steerX) < 0.0001 && Math.abs(steerY) < 0.0001) {
      steerX = Math.cos(entity.heading);
      steerY = Math.sin(entity.heading);
    }

    const desiredHeading = Math.atan2(steerY, steerX);
    const headingDelta = normalizeAngle(desiredHeading - entity.heading);
    const maxTurn = entity.turnRate * delta;
    entity.heading = normalizeAngle(entity.heading + clamp(headingDelta, -maxTurn, maxTurn));

    const speedPulse = 1 + Math.sin(scene.elapsed * 0.018 + entity.phase) * 0.08;
    const moveSpeed = entity.swimSpeed * speedPulse;
    entity.x += Math.cos(entity.heading) * moveSpeed * delta * 1.8;
    entity.y += Math.sin(entity.heading) * moveSpeed * delta * 1.4;

    if (entity.x < minX) {
      entity.x = minX;
      entity.heading = normalizeAngle(Math.PI - entity.heading);
    } else if (entity.x > maxX) {
      entity.x = maxX;
      entity.heading = normalizeAngle(Math.PI - entity.heading);
    }

    if (entity.y < minY) {
      entity.y = minY;
      entity.heading = normalizeAngle(-entity.heading);
    } else if (entity.y > maxY) {
      entity.y = maxY;
      entity.heading = normalizeAngle(-entity.heading);
    }

    const facingX = Math.cos(entity.heading);
    if (facingX > 0.06) {
      entity.direction = 1;
    } else if (facingX < -0.06) {
      entity.direction = -1;
    }

    entity.container.x = snap(entity.x);
    entity.container.y = snap(entity.y);
    const displayScale = entity.scale * entity.spriteUnitScale;
    entity.sprite.scale.set(entity.direction > 0 ? displayScale : -displayScale, displayScale);
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

  updateInfoPopup(scene);
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
  updateInfoPopup(sceneRef);
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
  const popupLayer = new Container();

  rootLayer.addChild(bgLayer);
  rootLayer.addChild(bubbleLayer);
  rootLayer.addChild(modelLayer);
  rootLayer.addChild(foodLayer);
  rootLayer.addChild(popupLayer);

  app.stage.addChild(rootLayer);
  host.appendChild(app.view);

  const scene = {
    app,
    assets,
    bgSprite,
    bubbleLayer,
    modelLayer,
    foodLayer,
    popupLayer,
    bubbles: [],
    foods: [],
    modelLobsters: {},
    infoPopup: null,
    elapsed: 0,
    width: host.clientWidth,
    height: host.clientHeight,
    swimBounds: {
      left: 20,
      right: host.clientWidth - 20,
      top: 20,
      bottom: host.clientHeight - 20
    },
    stateRef: () => gameState.lobster
  };

  scene.infoPopup = createInfoPopup(scene);

  app.stage.eventMode = "static";
  app.stage.on("pointertap", () => {
    if (!sceneRef) {
      return;
    }
    hideInfoPopup(sceneRef);
  });

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
