const logger = require("./logger");

class LamportClock {
  constructor(initialValue = 0) {
    this.time = Number.isInteger(initialValue) ? initialValue : 0;
  }

  tick() {
    this.time += 1;
    return this.time;
  }

  update(receivedTimestamp) {
    const previous = this.time;
    const received = Number.isFinite(receivedTimestamp) ? receivedTimestamp : 0;
    this.time = Math.max(this.time, received) + 1;
    logger.debug("Lamport clock updated", {
      previous_time: previous,
      received_time: received,
      new_time: this.time
    });
    return this.time;
  }

  getTime() {
    return this.time;
  }
}

module.exports = LamportClock;
