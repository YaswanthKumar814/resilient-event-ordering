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

module.exports = mongoose.models.EventOrdered || mongoose.model("EventOrdered", EventOrderedSchema);
