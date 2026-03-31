const { spawn } = require("child_process");
const path = require("path");

const services = [
  { name: "collector", file: "event-collector/collector.js" },
  { name: "order-service", file: "services/order-service/index.js" },
  { name: "payment-service", file: "services/payment-service/index.js" },
  { name: "restaurant-service", file: "services/restaurant-service/index.js" },
  { name: "delivery-service", file: "services/delivery-service/index.js" }
];

const children = [];

function startProcess(service) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", service.file)], {
    stdio: "inherit",
    env: process.env
  });

  children.push(child);
  child.on("exit", (code) => {
    console.log(`[orchestrator] ${service.name} exited with code ${code}`);
  });
}

for (const service of services) {
  startProcess(service);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
