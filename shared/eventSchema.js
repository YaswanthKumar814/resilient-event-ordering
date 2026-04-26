const Joi = require("joi");
const { EVENT_TYPES, SERVICE_ORDER, SERVICE_VECTOR_KEYS } = require("./constants");

const vectorTimestampShape = Object.fromEntries(
  SERVICE_VECTOR_KEYS.map((key) => [key, Joi.number().integer().min(0).required()])
);

const vectorTimestampSchema = Joi.object(vectorTimestampShape).unknown(false).required();

function rejectRecursiveCausalKeys(value, helpers) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();

    for (const [key, entryValue] of Object.entries(current)) {
      if (key === "causal_event" || key === "causal_context") {
        return helpers.error("any.invalid");
      }

      if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
        stack.push(entryValue);
      }
    }
  }

  return value;
}

const payloadSchema = Joi.object({
  triggered_by: Joi.string().valid(...SERVICE_ORDER),
  previous_event_id: Joi.string().guid({ version: ["uuidv4", "uuidv5", "uuidv7"] }),
  previous_event_type: Joi.string().valid(...EVENT_TYPES),
  previous_service: Joi.string().valid(...SERVICE_ORDER),
  source_endpoint: Joi.string().trim().min(1)
})
  .unknown(true)
  .custom(rejectRecursiveCausalKeys, "recursive causal payload guard")
  .messages({
    "any.invalid": "payload must not contain causal_event or causal_context fields"
  });

const causalContextSchema = Joi.object({
  event_id: Joi.string().guid({ version: ["uuidv4", "uuidv5", "uuidv7"] }).required(),
  order_id: Joi.string().trim().min(1).required(),
  event_type: Joi.string().valid(...EVENT_TYPES).required(),
  service: Joi.string().valid(...SERVICE_ORDER).required(),
  lamport_timestamp: Joi.number().integer().min(0).required(),
  vector_timestamp: vectorTimestampSchema
}).required();

const eventSchema = Joi.object({
  event_id: Joi.string().guid({ version: ["uuidv4", "uuidv5", "uuidv7"] }).required(),
  order_id: Joi.string().trim().min(1).required(),
  event_type: Joi.string().valid(...EVENT_TYPES).required(),
  service: Joi.string().valid(...SERVICE_ORDER).required(),
  lamport_timestamp: Joi.number().integer().min(0).required(),
  vector_timestamp: vectorTimestampSchema,
  physical_timestamp: Joi.string().isoDate().required(),
  payload: payloadSchema.required()
}).required();

const requestSchema = Joi.object({
  order_id: Joi.string().trim().min(1).required(),
  payload: payloadSchema.default({}),
  causal_context: causalContextSchema.optional()
});

module.exports = {
  eventSchema,
  causalContextSchema,
  requestSchema
};
