import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

export interface ModelLobster {
  model: string;
  feeds: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  size: number;
  updatedAt: string;
}

export interface LobsterState {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalFeeds: number;
  modelCount: number;
  lastModel: string | null;
  lastFedAt: string | null;
  updatedAt: string;
  lobsters: Record<string, ModelLobster>;
}

export interface FeedResult {
  state: LobsterState;
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  lobster: ModelLobster;
}

interface StateRow {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalFeeds: number;
  modelCount: number;
  lastModel: string | null;
  lastFedAt: string | null;
  updatedAt: string;
}

interface LobsterRow {
  model: string;
  feeds: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  size: number;
  updatedAt: string;
}

const SIZE_MIN = 1;
const SIZE_MAX = 4.8;
const GROWTH_K = 0.0002;
const MAX_TOKENS_PER_FEED = 50_000;

interface NormalizedFeedTokens {
  inputTokens: number;
  outputTokens: number;
  tokens: number;
}

interface TableInfoRow {
  name: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function round(value: number, digits = 3): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function normalizeModel(input: string): string {
  const model = input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}_\-./ ]/gu, "")
    .slice(0, 40);

  if (!model) {
    throw new Error("model 不能为空");
  }

  return model;
}

function parseTokenField(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`${fieldName} 必须是数字`);
  }

  const intValue = Math.floor(numericValue);
  if (intValue < 0) {
    throw new Error(`${fieldName} 不能小于 0`);
  }

  return intValue;
}

function normalizeFeedTokens(
  inputTokensInput: unknown,
  outputTokensInput: unknown,
  tokensFallbackInput?: unknown
): NormalizedFeedTokens {
  let inputTokens = parseTokenField(inputTokensInput, "input_tokens");
  let outputTokens = parseTokenField(outputTokensInput, "output_tokens");

  if (inputTokens === null && outputTokens === null) {
    const fallbackTokens = parseTokenField(tokensFallbackInput, "tokens");
    if (fallbackTokens === null) {
      throw new Error("input_tokens 和 output_tokens 不能同时为空");
    }
    if (fallbackTokens <= 0) {
      throw new Error("tokens 必须大于 0");
    }
    inputTokens = fallbackTokens;
    outputTokens = 0;
  } else {
    inputTokens ??= 0;
    outputTokens ??= 0;
  }

  let totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 0) {
    throw new Error("input_tokens + output_tokens 必须大于 0");
  }

  if (totalTokens > MAX_TOKENS_PER_FEED) {
    const ratio = MAX_TOKENS_PER_FEED / totalTokens;
    const scaledInputTokens = Math.floor(inputTokens * ratio);
    const scaledOutputTokens = MAX_TOKENS_PER_FEED - scaledInputTokens;

    inputTokens = scaledInputTokens;
    outputTokens = scaledOutputTokens;
    totalTokens = MAX_TOKENS_PER_FEED;
  }

  return {
    inputTokens,
    outputTokens,
    tokens: totalTokens
  };
}

function calculateSize(tokens: number): number {
  const ratio = 1 - Math.exp(-GROWTH_K * Math.max(tokens, 0));
  return round(SIZE_MIN + (SIZE_MAX - SIZE_MIN) * ratio);
}

const dataDir = resolve(homedir(), ".lobster-farmer");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "data.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_input_tokens INTEGER NOT NULL DEFAULT 0,
    total_output_tokens INTEGER NOT NULL DEFAULT 0,
    total_feeds INTEGER NOT NULL DEFAULT 0,
    model_count INTEGER NOT NULL DEFAULT 0,
    last_model TEXT,
    last_fed_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_lobsters (
    model TEXT PRIMARY KEY,
    feeds INTEGER NOT NULL,
    tokens INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    size REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function hasColumn(tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

ensureColumn("game_state", "total_input_tokens", "total_input_tokens INTEGER NOT NULL DEFAULT 0");
ensureColumn("game_state", "total_output_tokens", "total_output_tokens INTEGER NOT NULL DEFAULT 0");
ensureColumn("model_lobsters", "input_tokens", "input_tokens INTEGER NOT NULL DEFAULT 0");
ensureColumn("model_lobsters", "output_tokens", "output_tokens INTEGER NOT NULL DEFAULT 0");

db.exec(`
  UPDATE game_state
  SET total_input_tokens = total_tokens
  WHERE total_input_tokens = 0 AND total_output_tokens = 0 AND total_tokens > 0;

  UPDATE model_lobsters
  SET input_tokens = tokens
  WHERE input_tokens = 0 AND output_tokens = 0 AND tokens > 0;
`);

const ensureStateStmt = db.prepare(
  "INSERT OR IGNORE INTO game_state (id, total_tokens, total_input_tokens, total_output_tokens, total_feeds, model_count, last_model, last_fed_at, updated_at) VALUES (1, 0, 0, 0, 0, 0, NULL, NULL, ?)"
);
ensureStateStmt.run(nowIso());

const selectStateStmt = db.prepare(`
  SELECT
    total_tokens AS totalTokens,
    total_input_tokens AS totalInputTokens,
    total_output_tokens AS totalOutputTokens,
    total_feeds AS totalFeeds,
    model_count AS modelCount,
    last_model AS lastModel,
    last_fed_at AS lastFedAt,
    updated_at AS updatedAt
  FROM game_state
  WHERE id = 1
`);

const selectAllLobstersStmt = db.prepare(`
  SELECT
    model,
    feeds,
    tokens,
    input_tokens AS inputTokens,
    output_tokens AS outputTokens,
    size,
    updated_at AS updatedAt
  FROM model_lobsters
`);

const selectLobsterByModelStmt = db.prepare(`
  SELECT
    model,
    feeds,
    tokens,
    input_tokens AS inputTokens,
    output_tokens AS outputTokens,
    size,
    updated_at AS updatedAt
  FROM model_lobsters
  WHERE model = ?
`);

const insertLobsterStmt = db.prepare(`
  INSERT INTO model_lobsters (model, feeds, tokens, input_tokens, output_tokens, size, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateLobsterStmt = db.prepare(`
  UPDATE model_lobsters
  SET feeds = ?, tokens = ?, input_tokens = ?, output_tokens = ?, size = ?, updated_at = ?
  WHERE model = ?
`);

const updateGameStateStmt = db.prepare(`
  UPDATE game_state
  SET
    total_tokens = total_tokens + ?,
    total_input_tokens = total_input_tokens + ?,
    total_output_tokens = total_output_tokens + ?,
    total_feeds = total_feeds + 1,
    model_count = model_count + ?,
    last_model = ?,
    last_fed_at = ?,
    updated_at = ?
  WHERE id = 1
`);

function lobsterRowToModelLobster(row: LobsterRow): ModelLobster {
  return {
    model: row.model,
    feeds: row.feeds,
    tokens: row.tokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    size: calculateSize(row.tokens),
    updatedAt: row.updatedAt
  };
}

function buildState(): LobsterState {
  const stateRow = selectStateStmt.get() as StateRow | undefined;
  if (!stateRow) {
    throw new Error("state 初始化失败");
  }

  const rows = selectAllLobstersStmt.all() as LobsterRow[];
  const lobsters: Record<string, ModelLobster> = {};

  for (const row of rows) {
    lobsters[row.model] = lobsterRowToModelLobster(row);
  }

  return {
    totalTokens: stateRow.totalTokens,
    totalInputTokens: stateRow.totalInputTokens,
    totalOutputTokens: stateRow.totalOutputTokens,
    totalFeeds: stateRow.totalFeeds,
    modelCount: stateRow.modelCount,
    lastModel: stateRow.lastModel,
    lastFedAt: stateRow.lastFedAt,
    updatedAt: stateRow.updatedAt,
    lobsters
  };
}

const feedTransaction = db.transaction(
  (model: string, inputTokens: number, outputTokens: number, tokens: number): ModelLobster => {
  const timestamp = nowIso();
  const current = selectLobsterByModelStmt.get(model) as LobsterRow | undefined;

  let nextFeeds = 1;
  let nextInputTokens = inputTokens;
  let nextOutputTokens = outputTokens;
  let nextTokens = tokens;
  let createdModelCountDelta = 1;

  if (current) {
    nextFeeds = current.feeds + 1;
    nextInputTokens = current.inputTokens + inputTokens;
    nextOutputTokens = current.outputTokens + outputTokens;
    nextTokens = current.tokens + tokens;
    createdModelCountDelta = 0;
  }

  const nextSize = calculateSize(nextTokens);

  if (current) {
    updateLobsterStmt.run(nextFeeds, nextTokens, nextInputTokens, nextOutputTokens, nextSize, timestamp, model);
  } else {
    insertLobsterStmt.run(model, nextFeeds, nextTokens, nextInputTokens, nextOutputTokens, nextSize, timestamp);
  }

  updateGameStateStmt.run(tokens, inputTokens, outputTokens, createdModelCountDelta, model, timestamp, timestamp);

  return {
    model,
    feeds: nextFeeds,
    inputTokens: nextInputTokens,
    outputTokens: nextOutputTokens,
    tokens: nextTokens,
    size: nextSize,
    updatedAt: timestamp
  };
});

export function feedLobster(
  modelInput: string,
  inputTokensInput: unknown,
  outputTokensInput: unknown,
  tokensFallbackInput?: unknown
): FeedResult {
  const model = normalizeModel(modelInput);
  const feedTokens = normalizeFeedTokens(inputTokensInput, outputTokensInput, tokensFallbackInput);
  const lobster = feedTransaction(model, feedTokens.inputTokens, feedTokens.outputTokens, feedTokens.tokens);

  return {
    state: getState(),
    model,
    tokens: feedTokens.tokens,
    inputTokens: feedTokens.inputTokens,
    outputTokens: feedTokens.outputTokens,
    lobster
  };
}

export function getState(): LobsterState {
  return buildState();
}
