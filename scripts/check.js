const fs = require("fs");
const path = require("path");
const assert = require("assert");
const axios = require("axios");

const LamportClock = require("../shared/lamportClock");
const VectorClock = require("../shared/vectorClock");
const { eventSchema } = require("../shared/eventSchema");
const { sortByLamport, buildOrderedRecords } = require("../event-collector/orderingEngine");

const MODE = process.argv[2] || "static";
const BASE_URL = process.env.CHECK_BASE_URL || "http://127.0.0.1:4000";
const SERVICE_HEALTH_URLS = [
  { name: "collector", url: `${BASE_URL}/health` },
  { name: "order-service", url: "http://127.0.0.1:3001/health" },
  { name: "payment-service", url: "http://127.0.0.1:3002/health" },
  { name: "restaurant-service", url: "http://127.0.0.1:3003/health" },
  { name: "delivery-service", url: "http://127.0.0.1:3004/health" }
];

const AUTHORED_FILES = [
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
  "scripts/startAll.js",
  "dashboard/index.html",
  "dashboard/style.css",
  "dashboard/app.js"
];

const results = {
  errors: 0,
  warnings: 0
};

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function warn(message) {
  results.warnings += 1;
  console.warn(`[WARN] ${message}`);
}

function fail(message, error) {
  results.errors += 1;
  console.error(`[FAIL] ${message}`);
  if (error) {
    console.error(error.stack || error.message || String(error));
  }
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function ensureSyntax() {
  for (const relativePath of AUTHORED_FILES) {
    const source = readFile(relativePath);

    if (relativePath.endsWith(".js")) {
      try {
        new Function(source);
        pass(`Syntax valid: ${relativePath}`);
      } catch (error) {
        fail(`Syntax invalid: ${relativePath}`, error);
      }
      continue;
    }

    if (source.trim()) {
      pass(`File present: ${relativePath}`);
    } else {
      fail(`File is empty: ${relativePath}`);
    }
  }
}

function testLamportClock() {
  try {
    const clock = new LamportClock();
    assert.strictEqual(clock.getTime(), 0);
    assert.strictEqual(clock.tick(), 1);
    assert.strictEqual(clock.tick(), 2);
    assert.strictEqual(clock.update(5), 6);
    assert.strictEqual(clock.update(4), 7);
    pass("Lamport clock increment and merge logic is correct");
  } catch (error) {
    fail("Lamport clock validation failed", error);
  }
}

function testVectorClock() {
  try {
    const vector = new VectorClock(undefined, 2);
    assert.deepStrictEqual(vector.tick(), { 0: 0, 1: 0, 2: 1, 3: 0 });
    assert.deepStrictEqual(vector.merge({ 0: 3, 1: 2, 2: 0, 3: 4 }), {
      0: 3,
      1: 2,
      2: 2,
      3: 4
    });
    assert.strictEqual(
      VectorClock.compare({ 0: 1, 1: 0, 2: 0, 3: 0 }, { 0: 1, 1: 0, 2: 0, 3: 0 }),
      "equal"
    );
    assert.strictEqual(
      VectorClock.compare({ 0: 1, 1: 0, 2: 0, 3: 0 }, { 0: 1, 1: 1, 2: 0, 3: 0 }),
      "causal_before"
    );
    assert.strictEqual(
      VectorClock.compare({ 0: 2, 1: 1, 2: 0, 3: 0 }, { 0: 1, 1: 1, 2: 0, 3: 0 }),
      "causal_after"
    );
    assert.strictEqual(
      VectorClock.compare({ 0: 2, 1: 0, 2: 0, 3: 0 }, { 0: 1, 1: 1, 2: 0, 3: 0 }),
      "concurrent"
    );
    pass("Vector clock merge and causal comparison are correct");
  } catch (error) {
    fail("Vector clock validation failed", error);
  }
}

function testOrderingEngine() {
  const events = [
    {
      event_id: "b",
      service: "RestaurantService",
      lamport_timestamp: 3,
      vector_timestamp: { 0: 1, 1: 0, 2: 2, 3: 0 }
    },
    {
      event_id: "a",
      service: "PaymentService",
      lamport_timestamp: 3,
      vector_timestamp: { 0: 1, 1: 2, 2: 0, 3: 0 }
    },
    {
      event_id: "c",
      service: "OrderService",
      lamport_timestamp: 1,
      vector_timestamp: { 0: 1, 1: 0, 2: 0, 3: 0 }
    }
  ];

  try {
    const sorted = sortByLamport(events);
    assert.deepStrictEqual(
      sorted.map((event) => event.event_id),
      ["c", "a", "b"]
    );

    const ordered = buildOrderedRecords(events);
    assert.strictEqual(ordered[0].vector_relation_to_previous, "equal");
    assert.strictEqual(ordered[1].vector_relation_to_previous, "causal_before");
    assert.strictEqual(ordered[2].vector_relation_to_previous, "concurrent");
    pass("Ordering engine applies Lamport ordering and relation labels correctly");
  } catch (error) {
    fail("Ordering engine validation failed", error);
  }
}

function testEventSchema() {
  const validEvent = {
    event_id: "9d85fd67-dca7-4ed4-b4bf-54c7c7e0ef49",
    order_id: "order-1001",
    event_type: "PAYMENT_SUCCESS",
    service: "PaymentService",
    lamport_timestamp: 3,
    vector_timestamp: { 0: 1, 1: 2, 2: 0, 3: 0 },
    physical_timestamp: "2026-04-26T00:00:00.000Z",
    payload: {
      triggered_by: "OrderService",
      previous_event_id: "3c31d661-81f5-4545-80c4-b5cfb1f0bf6b",
      previous_event_type: "ORDER_PLACED",
      previous_service: "OrderService",
      source_endpoint: "/pay"
    }
  };

  const invalidRecursiveEvent = {
    ...validEvent,
    payload: {
      triggered_by: "OrderService",
      previous_event_id: "3c31d661-81f5-4545-80c4-b5cfb1f0bf6b",
      causal_event: {
        event_id: "nested"
      }
    }
  };

  try {
    assert.strictEqual(eventSchema.validate(validEvent).error, undefined);
    assert.ok(eventSchema.validate(invalidRecursiveEvent).error);
    pass("Event schema accepts bounded payloads and rejects recursive payload nesting");
  } catch (error) {
    fail("Event schema validation failed", error);
  }
}

function testDashboardAssumptions() {
  try {
    const dashboardSource = readFile("dashboard/app.js");
    assert.ok(!dashboardSource.includes(".sort("));
    assert.ok(dashboardSource.includes('const AUTO_REFRESH_INTERVAL_MS = 3000;'));
    assert.ok(dashboardSource.includes('const API_BASE_URL = "http://localhost:4000";'));
    pass("Dashboard stays aligned with no-client-sort validation assumptions");
  } catch (error) {
    fail("Dashboard validation failed", error);
  }
}

function runStaticChecks() {
  console.log("Running offline static validation");
  ensureSyntax();
  testLamportClock();
  testVectorClock();
  testOrderingEngine();
  testEventSchema();
  testDashboardAssumptions();
}

async function fetchJson(url, description, validateStatus) {
  const response = await axios.get(url, {
    timeout: 4000,
    validateStatus: validateStatus || ((status) => status >= 200 && status < 300)
  });
  pass(`Live endpoint reachable: ${description}`);
  return response.data;
}

function validateGroupedOrderedResponse(payload) {
  assert.ok(payload && typeof payload === "object");
  assert.ok(Array.isArray(payload.orders), "orders must be an array");

  for (const order of payload.orders) {
    assert.ok(typeof order.order_id === "string" && order.order_id.length > 0);
    assert.ok(Array.isArray(order.events), "order.events must be an array");

    for (let index = 0; index < order.events.length; index += 1) {
      const event = order.events[index];
      assert.ok(event.event_id);
      assert.strictEqual(event.order_id, order.order_id);
      assert.ok(event.event_type);
      assert.ok(Number.isInteger(event.lamport_timestamp));
      assert.ok(event.vector_timestamp && typeof event.vector_timestamp === "object");
      assert.ok(typeof event.order_index === "number");
      assert.ok(typeof event.ordering_basis === "string");
      assert.ok(typeof event.vector_relation_to_previous === "string");

      if (index > 0) {
        const previous = order.events[index - 1];
        assert.ok(
          event.lamport_timestamp > previous.lamport_timestamp ||
            (event.lamport_timestamp === previous.lamport_timestamp &&
              event.service.localeCompare(previous.service) >= 0),
          "events inside each order must follow Lamport ordering with service tie-breaker"
        );
      }
    }
  }
}

async function runLiveChecks() {
  console.log("Running live validation against the active system");

  try {
    await fetchJson(`${BASE_URL}/health`, "collector /health");
  } catch (error) {
    fail("Collector is not reachable for live validation", error);
    return;
  }

  try {
    const ordered = await fetchJson(`${BASE_URL}/events/ordered`, "collector /events/ordered");
    validateGroupedOrderedResponse(ordered);
    pass("Grouped ordered response structure is correct");
  } catch (error) {
    fail("Grouped /events/ordered validation failed", error);
  }

  try {
    const timeline = await fetchJson(
      `${BASE_URL}/orders/__validation_missing__/timeline`,
      "collector missing-order timeline"
    );
    assert.ok(timeline && typeof timeline === "object");
    assert.ok(Array.isArray(timeline.timeline));
    assert.ok(typeof timeline.total_events === "number");
    pass("Timeline endpoint handles missing orders cleanly");
  } catch (error) {
    fail("Timeline endpoint validation failed", error);
  }

  for (const service of SERVICE_HEALTH_URLS.slice(1)) {
    try {
      await fetchJson(service.url, `${service.name} /health`);
    } catch (error) {
      warn(`Service not reachable during live validation: ${service.name}`);
    }
  }
}

async function main() {
  if (MODE === "static" || MODE === "test") {
    runStaticChecks();
  } else if (MODE === "live") {
    await runLiveChecks();
  } else {
    fail(`Unknown validation mode: ${MODE}`);
  }

  console.log("");
  console.log(`Validation finished with ${results.errors} failure(s) and ${results.warnings} warning(s)`);

  if (results.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("Validation runner crashed unexpectedly", error);
  process.exitCode = 1;
});
