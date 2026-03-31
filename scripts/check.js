const fs = require("fs");
const path = require("path");

const filesToCheck = [
  "shared/constants.js",
  "shared/lamportClock.js",
  "shared/vectorClock.js",
  "shared/eventSchema.js",
  "shared/logger.js",
  "shared/db.js",
  "event-bus/redisClient.js",
  "services/baseService.js",
  "services/order-service/index.js",
  "services/payment-service/index.js",
  "services/restaurant-service/index.js",
  "services/delivery-service/index.js",
  "event-collector/models/EventRaw.js",
  "event-collector/models/EventOrdered.js",
  "event-collector/orderingEngine.js",
  "event-collector/collector.js",
  "scripts/startAll.js"
];

for (const relativeFile of filesToCheck) {
  const fullPath = path.join(__dirname, "..", relativeFile);
  const source = fs.readFileSync(fullPath, "utf8");
  try {
    new Function(source);
    console.log(`[check] OK ${relativeFile}`);
  } catch (error) {
    console.error(`[check] FAILED ${relativeFile}: ${error.message}`);
    process.exitCode = 1;
  }
}
