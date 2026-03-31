class LamportClock {
  constructor(initialValue = 0) {
    this.time = Number.isInteger(initialValue) ? initialValue : 0;
  }

  tick() {
    this.time += 1;
    return this.time;
  }

  update(receivedTimestamp) {
    const received = Number.isFinite(receivedTimestamp) ? receivedTimestamp : 0;
    this.time = Math.max(this.time, received) + 1;
    return this.time;
  }

  getTime() {
    return this.time;
  }
}

module.exports = LamportClock;
