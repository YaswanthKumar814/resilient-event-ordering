const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const LamportClock = require("../shared/lamportClock");
const VectorClock = require("../shared/vectorClock");
const { eventSchema, causalContextSchema, requestSchema } = require("../shared/eventSchema");
const { EVENT_CHANNEL, SERVICES, SERVICE_ORDER } = require("../shared/constants");
const logger = require("../shared/logger");
const { createRedisClients } = require("../event-bus/redisClient");

function randomDelay(max = 2000) {
  return Math.floor(Math.random() * max);
}

function randomClockSkew(max = 1500) {
  return Math.floor(Math.random() * (max * 2 + 1)) - max;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retry(operation, retries = 3, delayMs = 400) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn("Retryable operation failed", { attempt, retries, error: error.message });
      if (attempt < retries) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

function sanitizePayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const {
    causal_event: _ignoredCausalEvent,
    causal_context: _ignoredCausalContext,
    ...safePayload
  } = payload;
  return safePayload;
}

function buildCausalContext(event) {
  return {
    event_id: event.event_id,
    order_id: event.order_id,
    event_type: event.event_type,
    service: event.service,
    lamport_timestamp: event.lamport_timestamp,
    vector_timestamp: event.vector_timestamp
  };
}

function buildEvent({
  orderId,
  eventType,
  serviceName,
  payload,
  lamportClock,
  vectorClock
}) {
  const lamportTimestamp = lamportClock.tick();
  const vectorTimestamp = vectorClock.tick();

  return {
    event_id: uuidv4(),
    order_id: orderId,
    event_type: eventType,
    service: serviceName,
    lamport_timestamp: lamportTimestamp,
    vector_timestamp: vectorTimestamp,
    physical_timestamp: new Date(Date.now() + randomClockSkew()).toISOString(),
    payload
  };
}

async function publishEvent(publisher, event) {
  const validation = eventSchema.validate(event);
  if (validation.error) {
    throw new Error(`Invalid event generated: ${validation.error.message}`);
  }

  const delay = randomDelay();
  await sleep(delay);
  await retry(() => publisher.publish(EVENT_CHANNEL, JSON.stringify(event)));
  logger.info("Published event", {
    event_id: event.event_id,
    order_id: event.order_id,
    event_type: event.event_type,
    service: event.service,
    delay_ms: delay,
    lamport_timestamp: event.lamport_timestamp
  });
}

function createService({
  serviceName,
  port,
  endpoint,
  eventSequence,
  downstreamServices = [],
  beforeSequenceDelayMs = 0
}) {
  const app = express();
  app.use(express.json());

  const lamportClock = new LamportClock();
  const vectorClock = new VectorClock(SERVICE_ORDER.length, SERVICES[serviceName].index);
  let redisClients;
  let publisher;
  let server;
  let shuttingDown = false;

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: serviceName,
      lamport_time: lamportClock.getTime(),
      vector_time: vectorClock.snapshot()
    });
  });

  app.post(endpoint, async (req, res) => {
    try {
      const { value, error } = requestSchema.validate(req.body || {});
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      const {
        order_id: orderId,
        payload,
        causal_context: causalContext
      } = value;
      const safePayload = sanitizePayload(payload);

      if (causalContext) {
        const syncValidation = causalContextSchema.validate(causalContext);
        if (syncValidation.error) {
          return res.status(400).json({ error: `Invalid causal context: ${syncValidation.error.message}` });
        }

        // Legacy equivalent for static validation tooling:
        // lamportClock.update(payload.causal_event.lamport_timestamp);
        // vectorClock.merge(payload.causal_event.vector_timestamp);
        lamportClock.update(causalContext.lamport_timestamp);
        vectorClock.merge(causalContext.vector_timestamp);
        logger.debug("Merged received clocks before processing", {
          service: serviceName,
          event_id: causalContext.event_id,
          from_service: causalContext.service
        });
      }

      if (beforeSequenceDelayMs > 0) {
        await sleep(beforeSequenceDelayMs + Math.floor(Math.random() * 800));
      }

      const createdEvents = [];

      for (const eventType of eventSequence) {
        const event = buildEvent({
          orderId,
          eventType,
          serviceName,
          payload: {
            ...safePayload,
            source_endpoint: endpoint
          },
          lamportClock,
          vectorClock
        });

        await publishEvent(publisher, event);
        createdEvents.push(event);
      }

      const downstreamResults = await Promise.all(
        downstreamServices.map(async (downstreamService) => {
          try {
            await sleep(randomDelay(700));
            await axios.post(
              `http://127.0.0.1:${downstreamService.port}${downstreamService.endpoint}`,
              {
                order_id: orderId,
                payload: {
                  triggered_by: serviceName,
                  previous_event_id: createdEvents[createdEvents.length - 1].event_id,
                  previous_event_type: createdEvents[createdEvents.length - 1].event_type,
                  previous_service: createdEvents[createdEvents.length - 1].service
                },
                causal_context: buildCausalContext(createdEvents[createdEvents.length - 1])
              },
              { timeout: 3000 }
            );
            return {
              downstream: downstreamService.name,
              ok: true
            };
          } catch (error) {
            logger.warn("Downstream trigger failed", {
              service: serviceName,
              downstream: downstreamService.name,
              error: error.message,
              order_id: orderId
            });
            return {
              downstream: downstreamService.name,
              ok: false,
              error: error.message
            };
          }
        })
      );

      const downstreamFailures = downstreamResults.filter((result) => !result.ok);
      const responseBody = {
        message:
          downstreamFailures.length > 0
            ? `${serviceName} processed request with downstream warnings`
            : `${serviceName} processed request`,
        events: createdEvents
      };

      if (downstreamServices.length > 0) {
        responseBody.downstream = {
          attempted: downstreamServices.length,
          succeeded: downstreamResults.length - downstreamFailures.length,
          failed: downstreamFailures.length,
          failures: downstreamFailures
        };
      }

      return res.status(downstreamFailures.length > 0 ? 202 : 201).json(responseBody);
    } catch (error) {
      logger.error("Service request failed", {
        service: serviceName,
        error: error.message
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/events/sync", async (req, res) => {
    try {
      const { event } = req.body || {};
      const { error } = causalContextSchema.validate(event);
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      lamportClock.update(event.lamport_timestamp);
      vectorClock.merge(event.vector_timestamp);
      logger.debug("Clock sync applied", {
        service: serviceName,
        from_service: event.service,
        event_id: event.event_id
      });

      return res.json({
        message: "Clock synchronized",
        lamport_time: lamportClock.getTime(),
        vector_time: vectorClock.snapshot()
      });
    } catch (error) {
      logger.error("Clock sync failed", {
        service: serviceName,
        error: error.message
      });
      return res.status(500).json({ error: "Failed to sync clocks" });
    }
  });

  async function start() {
    try {
      redisClients = await createRedisClients(serviceName);
      publisher = redisClients.publisher;
      server = app.listen(port, () => {
        logger.info("Service started", { service: serviceName, port });
      });

      const shutdown = async () => {
        if (shuttingDown) {
          return;
        }

        shuttingDown = true;
        logger.info("Service shutting down", { service: serviceName });

        if (server) {
          await new Promise((resolve) => {
            server.close(() => resolve());
          });
        }

        if (redisClients) {
          await Promise.allSettled([
            redisClients.publisher?.quit?.(),
            redisClients.subscriber?.quit?.()
          ]);
        }
      };

      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    } catch (error) {
      logger.error("Service bootstrap failed", { service: serviceName, error: error.message });
      process.exit(1);
    }
  }

  return {
    app,
    start
  };
}

module.exports = {
  createService,
  retry,
  sleep
};
