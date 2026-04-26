const cors = require('cors');
const express = require("express");
const { createRedisClients } = require("../event-bus/redisClient");
const { connectToDatabase } = require("../shared/db");
const { eventSchema } = require("../shared/eventSchema");
const logger = require("../shared/logger");
const { EVENT_CHANNEL } = require("../shared/constants");
const EventRaw = require("./models/EventRaw");
const EventOrdered = require("./models/EventOrdered");
const { buildOrderedRecords } = require("./orderingEngine");

function isDuplicateKeyError(error) {
  return Boolean(error && error.code === 11000);
}

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
app.options("*", cors());
app.use(express.json());

const collectorPort = Number(process.env.COLLECTOR_PORT || 4000);

async function persistOrderedTimeline(orderId) {
  const rawEvents = await EventRaw.find({ order_id: orderId }).lean();
  const ordered = buildOrderedRecords(
    rawEvents.map((event) => ({
      ...event,
      physical_timestamp: new Date(event.physical_timestamp).toISOString()
    }))
  );

  if (ordered.length) {
    await EventOrdered.bulkWrite(
      ordered.map((event) => ({
        replaceOne: {
          filter: { event_id: event.event_id },
          replacement: {
            ...event,
            physical_timestamp: new Date(event.physical_timestamp)
          },
          upsert: true
        }
      }))
    );
  }

  return ordered;
}

async function handleIncomingEvent(message) {
  let parsed;

  try {
    parsed = JSON.parse(message);
  } catch (error) {
    logger.error("Invalid JSON event received", { error: error.message });
    return;
  }

  const { error, value } = eventSchema.validate(parsed);
  if (error) {
    logger.warn("Rejected invalid event", { error: error.message });
    return;
  }

  try {
    await EventRaw.create({
      ...value,
      physical_timestamp: new Date(value.physical_timestamp)
    });

    logger.info("Stored raw event", {
      event_id: value.event_id,
      order_id: value.order_id,
      event_type: value.event_type
    });

    await persistOrderedTimeline(value.order_id);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      logger.warn("Duplicate event ignored", { event_id: value.event_id });
      return;
    }

    logger.error("Failed to persist event", {
      event_id: value.event_id,
      error: error.message
    });
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/events/raw", async (req, res) => {
  try {
    const events = await EventRaw.find({}).sort({ createdAt: 1 }).lean();
    return res.json(events);
  } catch (error) {
    logger.error("Failed to fetch raw events", { error: error.message });
    return res.status(500).json({ error: "Failed to fetch raw events" });
  }
});

app.get("/events/ordered", async (req, res) => {
  try {
    const events = await EventOrdered.find({})
      .sort({
        order_id: 1,
        lamport_timestamp: 1,
        service: 1,
        createdAt: 1,
        event_id: 1
      })
      .lean();

    const orders = [];
    let currentOrder = null;

    for (const event of events) {
      if (!currentOrder || currentOrder.order_id !== event.order_id) {
        currentOrder = {
          order_id: event.order_id,
          events: []
        };
        orders.push(currentOrder);
      }

      currentOrder.events.push(event);
    }

    return res.json({ orders });
  } catch (error) {
    logger.error("Failed to fetch ordered events", { error: error.message });
    return res.status(500).json({ error: "Failed to fetch ordered events" });
  }
});

app.get("/orders/:id/timeline", async (req, res) => {
  try {
    const events = await EventOrdered.find({ order_id: req.params.id }).sort({ order_index: 1 }).lean();
    return res.json({
      order_id: req.params.id,
      total_events: events.length,
      timeline: events
    });
  } catch (error) {
    logger.error("Failed to fetch order timeline", {
      order_id: req.params.id,
      error: error.message
    });
    return res.status(500).json({ error: "Failed to fetch order timeline" });
  }
});

async function start() {
  try {
    await connectToDatabase();
    const { subscriber } = await createRedisClients("EventCollector");
    await subscriber.subscribe(EVENT_CHANNEL, handleIncomingEvent);

    app.listen(collectorPort, () => {
      logger.info("Collector started", { port: collectorPort, channel: EVENT_CHANNEL });
    });
  } catch (error) {
    logger.error("Collector bootstrap failed", { error: error.message });
    process.exit(1);
  }
}

start();
