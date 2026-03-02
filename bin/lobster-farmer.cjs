#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, openSync } = require("node:fs");
const { homedir, networkInterfaces } = require("node:os");
const { resolve } = require("node:path");

const entry = resolve(__dirname, "../dist/index.js");
const tscBin = resolve(__dirname, "../node_modules/typescript/bin/tsc");
const tsConfig = resolve(__dirname, "../tsconfig.json");
const dataDir = resolve(homedir(), ".lobster-farmer");
const dbBase = resolve(dataDir, "data.sqlite");
const pidFile = resolve(dataDir, "lobster-farmer.pid");
const logFile = resolve(dataDir, "lobster-farmer.log");
const portFile = resolve(dataDir, "lobster-farmer.port");
const defaultPort = "18990";

function printHelp() {
  console.log(`Lobster Farmer - Node single-service lobster game

Usage:
  lobster-farmer start [--port ${defaultPort}] [--foreground]
                                           Start game server (default: daemon)
  lobster-farmer feed --model <name> [--input-tokens <n>] [--output-tokens <n>] [--port ${defaultPort}]
                                           Feed a model lobster through API
  lobster-farmer stop                       Stop daemon server
  lobster-farmer status                     Show daemon status
  lobster-farmer reset                      Reset sqlite data files
  lobster-farmer --help                     Show help

Environment:
  PORT                                     Override server port (default: ${defaultPort})
`);
}

function parsePort(value) {
  const numericPort = Number(value);
  if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
    throw new Error("Invalid --port value");
  }
  return String(numericPort);
}

function parseNonNegativeInt(value, optionName) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Invalid ${optionName} value`);
  }
  const intValue = Math.floor(numberValue);
  if (intValue < 0) {
    throw new Error(`${optionName} must be >= 0`);
  }
  return intValue;
}

function parseArgs(argv) {
  const args = [...argv];
  let command = "start";
  let port;
  let foreground = false;
  let model;
  let inputTokens;
  let outputTokens;

  if (args.length > 0 && !args[0].startsWith("-")) {
    command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      command = "help";
      continue;
    }

    if (arg === "--foreground" || arg === "-f") {
      foreground = true;
      continue;
    }

    if (arg === "--port" || arg === "-p") {
      const value = args[index + 1];
      index += 1;
      if (!value) {
        throw new Error("Missing value for --port");
      }
      port = parsePort(value);
      continue;
    }

    if (arg.startsWith("--port=")) {
      const value = arg.split("=")[1];
      port = parsePort(value);
      continue;
    }

    if (arg === "--model" || arg === "-m") {
      const value = args[index + 1];
      index += 1;
      if (!value) {
        throw new Error("Missing value for --model");
      }
      model = String(value);
      continue;
    }

    if (arg.startsWith("--model=")) {
      model = String(arg.split("=")[1] ?? "");
      continue;
    }

    if (arg === "--input-tokens" || arg === "-i") {
      const value = args[index + 1];
      index += 1;
      if (value === undefined) {
        throw new Error("Missing value for --input-tokens");
      }
      inputTokens = parseNonNegativeInt(value, "--input-tokens");
      continue;
    }

    if (arg.startsWith("--input-tokens=")) {
      inputTokens = parseNonNegativeInt(arg.split("=")[1], "--input-tokens");
      continue;
    }

    if (arg === "--output-tokens" || arg === "-o") {
      const value = args[index + 1];
      index += 1;
      if (value === undefined) {
        throw new Error("Missing value for --output-tokens");
      }
      outputTokens = parseNonNegativeInt(value, "--output-tokens");
      continue;
    }

    if (arg.startsWith("--output-tokens=")) {
      outputTokens = parseNonNegativeInt(arg.split("=")[1], "--output-tokens");
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { command, port, foreground, model, inputTokens, outputTokens };
}

function removeIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

function resetData() {
  removeIfExists(dbBase);
  removeIfExists(`${dbBase}-shm`);
  removeIfExists(`${dbBase}-wal`);
  removeIfExists(pidFile);
  removeIfExists(logFile);
  removeIfExists(portFile);
  console.log("SQLite data reset complete.");
}

function ensureBuild() {
  if (!existsSync(entry)) {
    const build = spawnSync(process.execPath, [tscBin, "-p", tsConfig], { stdio: "inherit" });
    if (build.status !== 0) {
      process.exit(build.status || 1);
    }
  }
}

function readPid() {
  if (!existsSync(pidFile)) {
    return null;
  }

  const content = readFileSync(pidFile, "utf8").trim();
  const pid = Number(content);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  return pid;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === "EPERM") {
      return true;
    }
    return false;
  }
}

function getRunningPid() {
  const pid = readPid();
  if (!pid) {
    return null;
  }

  if (isProcessRunning(pid)) {
    return pid;
  }

  removeIfExists(pidFile);
  removeIfExists(portFile);
  return null;
}

function readActivePort() {
  if (!existsSync(portFile)) {
    return null;
  }

  const value = readFileSync(portFile, "utf8").trim();
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 65535) {
    return null;
  }
  return String(numeric);
}

function writeActivePort(port) {
  writeFileSync(portFile, `${port}\n`);
}

function accessUrl(port) {
  return `http://localhost:${port}`;
}

function isPrivateLanIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
}

function lanAccessUrls(port) {
  const nets = networkInterfaces();
  const urls = [];
  const seen = new Set();

  for (const interfaces of Object.values(nets)) {
    if (!Array.isArray(interfaces)) {
      continue;
    }

    for (const iface of interfaces) {
      if (!iface || iface.internal) {
        continue;
      }

      const family = typeof iface.family === "string" ? iface.family : iface.family === 4 ? "IPv4" : "";
      if (family !== "IPv4") {
        continue;
      }

      if (!iface.address || !isPrivateLanIpv4(iface.address)) {
        continue;
      }

      const url = `http://${iface.address}:${port}`;
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

function printAccessUrls(port) {
  console.log(`url: ${accessUrl(port)}`);

  const lanUrls = lanAccessUrls(port);
  if (lanUrls.length > 0) {
    console.log("lan:");
    for (const url of lanUrls) {
      console.log(`  - ${url}`);
    }
  }
}

function startServer(port, foreground) {
  ensureBuild();

  mkdirSync(dataDir, { recursive: true });
  const resolvedPort = resolvePort(port);

  const env = { ...process.env };
  env.PORT = resolvedPort;

  if (foreground) {
    writeActivePort(resolvedPort);
    printAccessUrls(resolvedPort);

    const child = spawn(process.execPath, [entry], {
      stdio: "inherit",
      env
    });

    child.on("error", (error) => {
      console.error(error.message || String(error));
      process.exit(1);
    });

    child.on("exit", (code, signal) => {
      removeIfExists(portFile);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code || 0);
    });

    return;
  }

  const existingPid = getRunningPid();
  if (existingPid) {
    const runningPort = readActivePort() || resolvedPort;
    console.log(`Lobster Farmer already running (pid: ${existingPid})`);
    printAccessUrls(runningPort);
    return;
  }

  const out = openSync(logFile, "a");
  const err = openSync(logFile, "a");
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ["ignore", out, err],
    env
  });
  child.unref();

  writeFileSync(pidFile, String(child.pid));
  writeActivePort(resolvedPort);
  console.log(`Lobster Farmer started in background.`);
  console.log(`pid: ${child.pid}`);
  printAccessUrls(resolvedPort);
  console.log(`log: ${logFile}`);
}

function stopServer() {
  const pid = getRunningPid();
  if (!pid) {
    console.log("Lobster Farmer is not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }

  removeIfExists(pidFile);
  removeIfExists(portFile);
  console.log(`Lobster Farmer stopped (pid: ${pid}).`);
}

function showStatus() {
  const pid = getRunningPid();
  if (!pid) {
    console.log("Lobster Farmer status: stopped");
    return;
  }

  console.log(`Lobster Farmer status: running (pid: ${pid})`);
  const runningPort = readActivePort() || defaultPort;
  printAccessUrls(runningPort);
  console.log(`log: ${logFile}`);
}

function resolvePort(portArg) {
  return parsePort(portArg || process.env.PORT || defaultPort);
}

async function feedThroughApi(parsed) {
  const model = typeof parsed.model === "string" ? parsed.model.trim() : "";
  if (!model) {
    throw new Error("feed command requires --model");
  }

  const inputTokens = parsed.inputTokens ?? 0;
  const outputTokens = parsed.outputTokens ?? 0;
  if (inputTokens + outputTokens <= 0) {
    throw new Error("feed command requires input/output tokens > 0");
  }

  const port = resolvePort(parsed.port);
  const url = `http://127.0.0.1:${port}/api/feed`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens
      })
    });
  } catch (error) {
    throw new Error(`feed request failed: ${error.message || String(error)}`);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    const apiError = payload && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`feed request failed: ${apiError}`);
  }

  const lobster = payload && typeof payload === "object" ? payload.lobster : null;
  const size = lobster && typeof lobster.size === "number" ? lobster.size : "n/a";
  const feeds = lobster && typeof lobster.feeds === "number" ? lobster.feeds : "n/a";
  const totalTokens = lobster && typeof lobster.tokens === "number" ? lobster.tokens : "n/a";

  console.log(`Fed lobster: ${model}`);
  console.log(`input_tokens: ${inputTokens}, output_tokens: ${outputTokens}`);
  console.log(`lobster tokens: ${totalTokens}, feeds: ${feeds}, size: ${size}`);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message || String(error));
    printHelp();
    process.exit(1);
  }

  if (parsed.command === "help") {
    printHelp();
    return;
  }

  if (parsed.command === "reset") {
    resetData();
    return;
  }

  if (parsed.command === "stop") {
    stopServer();
    return;
  }

  if (parsed.command === "status") {
    showStatus();
    return;
  }

  if (parsed.command === "start") {
    startServer(parsed.port, parsed.foreground);
    return;
  }

  if (parsed.command === "feed") {
    await feedThroughApi(parsed);
    return;
  }

  console.error(`Unknown command: ${parsed.command}`);
  printHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
