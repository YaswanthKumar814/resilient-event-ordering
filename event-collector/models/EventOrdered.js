const mongoose = require("mongoose");

const EventOrderedSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    order_id: { type: String, required: true, index: true },
    event_type: { type: String, required: true },
    service: { type: String, required: true },
    lamport_timestamp: { type: Number, required: true, index: true },
    vector_timestamp: { type: Map, of: Number, required: true },
    physical_timestamp: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    order_index: { type: Number, required: true },
    ordering_basis: { type: String, required: true },
    vector_relation_to_previous: { type: String, default: "equal" }
  },
  {
    collection: "events_ordered",
    timestamps: true
  }
);

EventOrderedSchema.index({ order_id: 1, order_index: 1 });
EventOrderedSchema.index({ order_id: 1, createdAt: 1 });
EventOrderedSchema.index({ lamport_timestamp: 1, service: 1, createdAt: 1 });

module.exports = mongoose.models.EventOrdered || mongoose.model("EventOrdered", EventOrderedSchema);
