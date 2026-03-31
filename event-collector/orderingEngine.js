const VectorClock = require("../shared/vectorClock");
const logger = require("../shared/logger");

function sortByLamport(events) {
  return [...events].sort((left, right) => {
    if (left.lamport_timestamp !== right.lamport_timestamp) {
      return left.lamport_timestamp - right.lamport_timestamp;
    }

    return left.service.localeCompare(right.service);
  });
}

function buildOrderedRecords(events) {
  const sortedEvents = sortByLamport(events);
  const ordered = sortedEvents.map((event, index) => {
    const previous = sortedEvents[index - 1];
    const relation = previous
      ? VectorClock.compare(previous.vector_timestamp, event.vector_timestamp)
      : "equal";

    if (relation === "concurrent") {
      logger.warn("Concurrent events detected", {
        previous_event_id: previous.event_id,
        current_event_id: event.event_id
      });
    }

    logger.info("Ordering decision applied", {
      event_id: event.event_id,
      order_index: index,
      lamport_timestamp: event.lamport_timestamp,
      relation
    });

    return {
      ...event,
      order_index: index,
      ordering_basis: "lamport_timestamp_then_service",
      vector_relation_to_previous: relation
    };
  });

  return ordered;
}

module.exports = {
  sortByLamport,
  buildOrderedRecords
};
