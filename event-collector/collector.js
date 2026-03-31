const express = require("express");
const { createRedisClients } = require("../event-bus/redisClient");
const { connectToDatabase } = require("../shared/db");
const { eventSchema } = require("../shared/eventSchema");
const logger = require("../shared/logger");
const { EVENT_CHANNEL } = require("../shared/constants");
const EventRaw = require("./models/EventRaw");
const EventOrdered = require("./models/EventOrdered");
const { buildOrderedRecords } = require("./orderingEngine");

const app = express();
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

  await EventOrdered.deleteMany({ order_id: orderId });

  if (ordered.length) {
    await EventOrdered.insertMany(
      ordered.map((event) => ({
        ...event,
        physical_timestamp: new Date(event.physical_timestamp)
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
    const existing = await EventRaw.findOne({ event_id: value.event_id }).lean();
    if (existing) {
      logger.warn("Duplicate event ignored", { event_id: value.event_id });
      return;
    }

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
    const events = await EventOrdered.find({}).sort({ order_index: 1, createdAt: 1 }).lean();
    return res.json(events);
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
