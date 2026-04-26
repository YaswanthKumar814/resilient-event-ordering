const mongoose = require("mongoose");

const EventRawSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    order_id: { type: String, required: true, index: true },
    event_type: { type: String, required: true },
    service: { type: String, required: true },
    lamport_timestamp: { type: Number, required: true, index: true },
    vector_timestamp: { type: Map, of: Number, required: true },
    physical_timestamp: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    collection: "events_raw",
    timestamps: true
  }
);

EventRawSchema.index({ order_id: 1, createdAt: 1 });
EventRawSchema.index({ order_id: 1, lamport_timestamp: 1, service: 1, createdAt: 1 });

module.exports = mongoose.models.EventRaw || mongoose.model("EventRaw", EventRawSchema);
