const { spawn } = require("child_process");
const path = require("path");

const services = [
  { name: "collector", file: "event-collector/collector.js", startupDelayMs: 0 },
  { name: "order-service", file: "services/order-service/index.js", startupDelayMs: 800 },
  { name: "payment-service", file: "services/payment-service/index.js", startupDelayMs: 1200 },
  { name: "restaurant-service", file: "services/restaurant-service/index.js", startupDelayMs: 1600 },
  { name: "delivery-service", file: "services/delivery-service/index.js", startupDelayMs: 2000 }
];

const children = [];
let shuttingDown = false;

function log(message) {
  console.log(`[start:all] ${message}`);
}

function startProcess(service) {
  log(`Starting ${service.name} from ${service.file}`);

  const child = spawn(process.execPath, [path.join(__dirname, "..", service.file)], {
    stdio: "inherit",
    env: process.env
  });

  children.push({ service, child });

  child.on("spawn", () => {
    log(`${service.name} process spawned`);
  });

  child.on("error", (error) => {
    log(`${service.name} failed to start: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    log(`${service.name} stopped with ${reason}`);

    if (!shuttingDown && code && code !== 0) {
      log(`${service.name} exited unexpectedly. Check the logs above for the failure reason.`);
    }
  });
}

function scheduleStartup() {
  log("Bootstrapping collector and services");
  log("Make sure Redis and MongoDB are already running before using this command.");

  for (const service of services) {
    setTimeout(() => startProcess(service), service.startupDelayMs);
  }
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log("Shutting down all spawned services");

  for (const entry of children) {
    if (!entry.child.killed) {
      entry.child.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(0), 250);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

scheduleStartup();
