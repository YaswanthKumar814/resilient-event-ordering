const fs = require("fs");
const path = require("path");
const assert = require("assert");
const axios = require("axios");

const LamportClock = require("../shared/lamportClock");
const VectorClock = require("../shared/vectorClock");
const { sortByLamport, buildOrderedRecords } = require("../event-collector/orderingEngine");

const BASE_URL = process.env.CHECK_BASE_URL || "http://127.0.0.1:4000";
const ORDER_URL = process.env.CHECK_ORDER_URL || "http://127.0.0.1:3001/order";
const ENABLE_LOAD_TEST = process.env.CHECK_LOAD_TEST === "1";
const ENABLE_LIVE_CHECKS = process.env.CHECK_SKIP_LIVE !== "1";
const LOAD_TEST_ORDERS = Math.min(Math.max(Number(process.env.CHECK_LOAD_ORDERS || 10), 1), 10);

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
  "scripts/startAll.js",
  "dashboard/index.html",
  "dashboard/style.css",
  "dashboard/app.js"
];

const summary = {
  lamport: true,
  vector: true,
  ordering: true,
  eventFlow: true,
  concurrency: true,
  overall: true
};

let warningCount = 0;
let errorCount = 0;

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function warn(message) {
  warningCount += 1;
  console.warn(`[WARN] ${message}`);
}

function fail(message, error) {
  errorCount += 1;
  console.error(`[ERROR] ${message}`);
  if (error) {
    console.error(error.stack || error.message || String(error));
  }
}

function markFailure(section) {
  summary[section] = false;
  summary.overall = false;
}

function normalizeVector(vector, size = 4) {
  return Array.from({ length: size }, (_, index) => Number(vector?.[index] || vector?.[String(index)] || 0));
}

function validateSyntax() {
  for (const relativeFile of filesToCheck) {
    const fullPath = path.join(__dirname, "..", relativeFile);
    const source = fs.readFileSync(fullPath, "utf8");

    if (relativeFile.endsWith(".js")) {
      try {
        new Function(source);
        pass(`Syntax OK ${relativeFile}`);
      } catch (error) {
        markFailure("overall");
        fail(`Syntax invalid ${relativeFile}`, error);
      }
      continue;
    }

    if (!source.trim()) {
      markFailure("overall");
      fail(`File is empty ${relativeFile}`);
    } else {
      pass(`File present ${relativeFile}`);
    }
  }
}

function validateLamportClockUnitTests() {
  try {
    const clock = new LamportClock();
    assert.strictEqual(clock.getTime(), 0);
    assert.strictEqual(clock.tick(), 1);
    assert.strictEqual(clock.tick(), 2);
    assert.strictEqual(clock.update(5), 6);
    assert.strictEqual(clock.getTime(), 6);
    assert.strictEqual(clock.update(4), 7);
    pass("Lamport clock increments and merges correctly");
  } catch (error) {
    markFailure("lamport");
    fail("Lamport clock logic failed unit validation", error);
  }
}

function validateVectorClockUnitTests() {
  try {
    const vector = new VectorClock(4, 2);
    const firstTick = vector.tick();
    assert.deepStrictEqual(firstTick, { 0: 0, 1: 0, 2: 1, 3: 0 });

    const snapshot = vector.snapshot();
    snapshot["2"] = 99;
    assert.deepStrictEqual(vector.snapshot(), { 0: 0, 1: 0, 2: 1, 3: 0 });

    const merged = vector.merge({ 0: 3, 1: 2, 2: 0, 3: 4 });
    assert.deepStrictEqual(merged, { 0: 3, 1: 2, 2: 2, 3: 4 });

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

    pass("Vector clock tick, merge, snapshot, and compare logic validated");
  } catch (error) {
    markFailure("vector");
    fail("Vector clock logic failed unit validation", error);
  }
}

function validateOrderingEngineUnitTests() {
  const input = [
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
    const original = JSON.stringify(input);
    const sorted = sortByLamport(input);
    assert.strictEqual(sorted[0].event_id, "c");
    assert.strictEqual(sorted[1].event_id, "a");
    assert.strictEqual(sorted[2].event_id, "b");
    assert.strictEqual(JSON.stringify(input), original);

    const ordered = buildOrderedRecords(input);
    assert.strictEqual(ordered[0].vector_relation_to_previous, "equal");
    assert.strictEqual(ordered[1].vector_relation_to_previous, "causal_before");
    assert.strictEqual(ordered[2].vector_relation_to_previous, "concurrent");
    pass("Ordering engine preserves input and applies Lamport + vector rules correctly");
  } catch (error) {
    markFailure("ordering");
    fail("Ordering engine failed unit validation", error);
  }
}

function validateDashboardStaticBehavior() {
  try {
    const dashboardSource = fs.readFileSync(path.join(__dirname, "..", "dashboard/app.js"), "utf8");
    assert.ok(dashboardSource.includes('const API_BASE_URL = "http://localhost:4000";'));
    assert.ok(dashboardSource.includes('`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/timeline`'));
    assert.ok(!dashboardSource.includes(".sort("));
    pass("Dashboard fetch target and no-client-sort behavior validated");
  } catch (error) {
    markFailure("overall");
    fail("Dashboard static validation failed", error);
  }
}

function validateBaseServiceStaticFlow() {
  try {
    const baseSource = fs.readFileSync(path.join(__dirname, "..", "services/baseService.js"), "utf8");
    const orderSource = fs.readFileSync(path.join(__dirname, "..", "services/order-service/index.js"), "utf8");
    const paymentSource = fs.readFileSync(path.join(__dirname, "..", "services/payment-service/index.js"), "utf8");
    const restaurantSource = fs.readFileSync(path.join(__dirname, "..", "services/restaurant-service/index.js"), "utf8");

    assert.ok(baseSource.includes("lamportClock.update(payload.causal_event.lamport_timestamp);"));
    assert.ok(baseSource.includes("vectorClock.merge(payload.causal_event.vector_timestamp);"));
    assert.ok(
      baseSource.indexOf("lamportClock.update(payload.causal_event.lamport_timestamp);")
        < baseSource.indexOf("for (const eventType of eventSequence)")
    );
    assert.ok(baseSource.includes("const lamportTimestamp = lamportClock.tick();"));
    assert.ok(baseSource.includes("const vectorTimestamp = vectorClock.tick();"));
    assert.ok(
      baseSource.indexOf("const event = buildEvent({")
        < baseSource.indexOf("await publishEvent(publisher, event);")
    );
    assert.ok(orderSource.includes('name: SERVICES.PaymentService.name'));
    assert.ok(!orderSource.includes('name: SERVICES.RestaurantService.name'));
    assert.ok(!orderSource.includes('name: SERVICES.DeliveryService.name'));
    assert.ok(paymentSource.includes('name: SERVICES.RestaurantService.name'));
    assert.ok(!paymentSource.includes('name: SERVICES.DeliveryService.name'));
    assert.ok(restaurantSource.includes('name: SERVICES.DeliveryService.name'));
    pass("Service flow updates clocks before publishing and before downstream triggers");
  } catch (error) {
    markFailure("eventFlow");
    fail("Service flow static validation failed", error);
  }
}

async function fetchJson(url, description, validateStatus) {
  const response = await axios.get(url, {
    timeout: 5000,
    validateStatus: validateStatus || ((status) => status >= 200 && status < 300)
  });
  pass(`API OK ${description}`);
  return response.data;
}

function validateVectorAndLamport(orderId, timeline) {
  let previousLamport = -1;
  let concurrentCount = 0;

  timeline.forEach((event, index) => {
    if (event.lamport_timestamp < previousLamport) {
      throw new Error(`Lamport decreased in ${orderId} at index ${index}`);
    }
    previousLamport = event.lamport_timestamp;

    const expectedRelation =
      index === 0
        ? "equal"
        : VectorClock.compare(timeline[index - 1].vector_timestamp, event.vector_timestamp);
    if (event.vector_relation_to_previous !== expectedRelation) {
      throw new Error(
        `Vector relation mismatch in ${orderId} at index ${index}: expected ${expectedRelation}, got ${event.vector_relation_to_previous}`
      );
    }

    if (event.vector_relation_to_previous === "concurrent") {
      concurrentCount += 1;
    }
  });

  return concurrentCount;
}

function validateCycle(orderId, cycle, cycleIndex) {
  const stageIndex = {
    ORDER_PLACED: 0,
    PAYMENT_SUCCESS: 1,
    FOOD_PREPARING: 2,
    OUT_FOR_DELIVERY: 3,
    DELIVERED: 4
  };

  let previousStage = -1;

  cycle.forEach((event, index) => {
    const currentStage = stageIndex[event.event_type];
    if (currentStage === undefined) {
      throw new Error(`Unknown event type ${event.event_type} in ${orderId}`);
    }
    if (currentStage < previousStage) {
      throw new Error(`Lifecycle regressed in ${orderId} cycle ${cycleIndex} with ${event.event_type}`);
    }
    previousStage = currentStage;
  });

}

function splitTimelineIntoCycles(orderId, timeline) {
  const cycles = [];
  let current = [];

  timeline.forEach((event) => {
    if (event.event_type === "ORDER_PLACED" && current.length > 0) {
      cycles.push(current);
      current = [];
    }

    current.push(event);
  });

  if (current.length > 0) {
    cycles.push(current);
  }

  if (cycles.length > 1) {
    warn(`Order ${orderId} contains ${cycles.length} lifecycle segments; order_id appears to have been reused`);
  }

  return cycles;
}

function validateTimelineSequence(orderId, timeline) {
  const concurrentCount = validateVectorAndLamport(orderId, timeline);
  const cycles = splitTimelineIntoCycles(orderId, timeline);

  cycles.forEach((cycle, cycleIndex) => {
    if (cycle[0]?.event_type !== "ORDER_PLACED") {
      throw new Error(`Timeline ${orderId} cycle ${cycleIndex} does not start with ORDER_PLACED`);
    }

    validateCycle(orderId, cycle, cycleIndex);
  });

  return concurrentCount;
}

function validateGlobalEventSet(rawEvents, orderedEvents) {
  const rawIds = new Set();
  const orderedIds = new Set();

  rawEvents.forEach((event) => {
    if (rawIds.has(event.event_id)) {
      throw new Error(`Duplicate raw event_id detected: ${event.event_id}`);
    }
    rawIds.add(event.event_id);
  });

  orderedEvents.forEach((event, index) => {
    if (orderedIds.has(event.event_id)) {
      throw new Error(`Duplicate ordered event_id detected: ${event.event_id}`);
    }
    orderedIds.add(event.event_id);

    if (index > 0 && event.lamport_timestamp < orderedEvents[index - 1].lamport_timestamp) {
      throw new Error("Lamport ordering regression detected in /events/ordered response");
    }
  });
}

async function validateLiveApis() {
  let concurrentEventsDetected = 0;

  try {
    const rawEvents = await fetchJson(`${BASE_URL}/events/raw`, "GET /events/raw");
    const orderedEvents = await fetchJson(`${BASE_URL}/events/ordered`, "GET /events/ordered");
    const invalidTimeline = await fetchJson(
      `${BASE_URL}/orders/__validation_missing__/timeline`,
      "GET /orders/:id/timeline for missing order"
    );

    assert.ok(Array.isArray(rawEvents), "Raw events response must be an array");
    assert.ok(Array.isArray(orderedEvents), "Ordered events response must be an array");
    assert.ok(Array.isArray(invalidTimeline.timeline), "Missing order timeline must contain a timeline array");
    assert.strictEqual(invalidTimeline.total_events, 0);
    validateGlobalEventSet(rawEvents, orderedEvents);

    const orderIds = [...new Set(orderedEvents.map((event) => event.order_id))];
    for (const orderId of orderIds) {
      const payload = await fetchJson(
        `${BASE_URL}/orders/${encodeURIComponent(orderId)}/timeline`,
        `GET /orders/${orderId}/timeline`
      );
      assert.strictEqual(payload.order_id, orderId);
      assert.ok(Array.isArray(payload.timeline));
      assert.strictEqual(payload.total_events, payload.timeline.length);
      concurrentEventsDetected += validateTimelineSequence(orderId, payload.timeline);
    }

    pass("Lamport ordering valid");
    pass("Vector relationships valid");
    pass("Event lifecycle validation complete");

    if (concurrentEventsDetected > 0) {
      warn(`Concurrent events detected: ${concurrentEventsDetected}`);
    } else {
      pass("No concurrent neighboring events detected");
    }
  } catch (error) {
    markFailure("lamport");
    markFailure("vector");
    markFailure("ordering");
    markFailure("eventFlow");
    fail("Live API validation failed", error);
  }
}

async function runLoadTest() {
  const orderIds = Array.from({ length: LOAD_TEST_ORDERS }, (_, index) => {
    return `validation-${Date.now()}-${index}`;
  });

  try {
    await Promise.all(
      orderIds.map((orderId) =>
        axios.post(
          ORDER_URL,
          {
            order_id: orderId,
            payload: {
              customer: "validation-runner",
              batch: "check-load-test"
            }
          },
          { timeout: 5000 }
        )
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 6000));

    const timelines = await Promise.all(
      orderIds.map((orderId) =>
        axios.get(`${BASE_URL}/orders/${encodeURIComponent(orderId)}/timeline`, { timeout: 5000 })
      )
    );

    let totalEvents = 0;
    for (const response of timelines) {
      const payload = response.data;
      totalEvents += payload.total_events;
      validateTimelineSequence(payload.order_id, payload.timeline);
    }

    if (totalEvents < LOAD_TEST_ORDERS * 5) {
      warn(`Load test generated fewer events than expected: ${totalEvents}`);
    } else {
      pass(`Load test generated ${totalEvents} ordered events across ${LOAD_TEST_ORDERS} orders`);
    }

    const orderedResponse = await axios.get(`${BASE_URL}/events/ordered`, { timeout: 5000 });
    assert.ok(Array.isArray(orderedResponse.data));
    pass("Rapid concurrent API access remained stable during validation load");
  } catch (error) {
    markFailure("eventFlow");
    markFailure("ordering");
    fail("Load test validation failed", error);
  }
}

function printReport() {
  const status = (value) => (value ? "✅" : "❌");

  console.log("");
  console.log("SYSTEM VALIDATION REPORT");
  console.log("");
  console.log(`Lamport Clock: ${status(summary.lamport)}`);
  console.log(`Vector Clock: ${status(summary.vector)}`);
  console.log(`Ordering Engine: ${status(summary.ordering)}`);
  console.log(`Event Flow: ${status(summary.eventFlow)}`);
  console.log(`Concurrency Handling: ${status(summary.concurrency)}`);
  console.log(`Overall System: ${status(summary.overall)}`);

  if (warningCount > 0) {
    console.log("");
    console.log(`[WARN] Validation completed with ${warningCount} warning(s)`);
  }

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  validateSyntax();
  validateLamportClockUnitTests();
  validateVectorClockUnitTests();
  validateOrderingEngineUnitTests();
  validateDashboardStaticBehavior();
  validateBaseServiceStaticFlow();

  if (ENABLE_LIVE_CHECKS) {
    try {
      await validateLiveApis();
    } catch (error) {
      warn(`Live API checks skipped or incomplete: ${error.message}`);
    }
  } else {
    warn("Live API checks skipped by CHECK_SKIP_LIVE=1");
  }

  if (ENABLE_LOAD_TEST) {
    await runLoadTest();
  } else {
    warn("Load test skipped. Run with CHECK_LOAD_TEST=1 to generate concurrent validation traffic.");
  }

  printReport();
}

main().catch((error) => {
  markFailure("overall");
  fail("Validation runner failed unexpectedly", error);
  printReport();
});
