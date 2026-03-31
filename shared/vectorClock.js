class VectorClock {
  constructor(size, ownIndex) {
    this.clock = Array.from({ length: size }, () => 0);
    this.ownIndex = ownIndex;
  }

  tick() {
    this.clock[this.ownIndex] += 1;
    return this.toObject();
  }

  merge(receivedVector = {}) {
    const normalized = this.toArray(receivedVector);
    this.clock = this.clock.map((value, index) => Math.max(value, normalized[index] || 0));
    this.clock[this.ownIndex] += 1;
    return this.toObject();
  }

  snapshot() {
    return this.toObject();
  }

  toObject() {
    return Object.fromEntries(this.clock.map((value, index) => [String(index), value]));
  }

  toArray(vector = {}) {
    if (Array.isArray(vector)) {
      return this.clock.map((_, index) => Number(vector[index] || 0));
    }

    return this.clock.map((_, index) => Number(vector[index] || vector[String(index)] || 0));
  }

  static compare(a = {}, b = {}, size = 4) {
    const left = Array.from({ length: size }, (_, index) => Number(a[index] || a[String(index)] || 0));
    const right = Array.from({ length: size }, (_, index) => Number(b[index] || b[String(index)] || 0));

    let leftLess = false;
    let rightLess = false;

    for (let index = 0; index < size; index += 1) {
      if (left[index] < right[index]) {
        leftLess = true;
      } else if (left[index] > right[index]) {
        rightLess = true;
      }
    }

    if (!leftLess && !rightLess) {
      return "equal";
    }

    if (leftLess && !rightLess) {
      return "causal_before";
    }

    if (!leftLess && rightLess) {
      return "causal_after";
    }

    return "concurrent";
  }
}

module.exports = VectorClock;
