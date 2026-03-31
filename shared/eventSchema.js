const Joi = require("joi");
const { EVENT_TYPES, SERVICE_ORDER } = require("./constants");

const eventSchema = Joi.object({
  event_id: Joi.string().guid({ version: ["uuidv4", "uuidv5", "uuidv7"] }).required(),
  order_id: Joi.string().trim().min(1).required(),
  event_type: Joi.string().valid(...EVENT_TYPES).required(),
  service: Joi.string().valid(...SERVICE_ORDER).required(),
  lamport_timestamp: Joi.number().integer().min(0).required(),
  vector_timestamp: Joi.object()
    .pattern(Joi.string(), Joi.number().integer().min(0))
    .required(),
  physical_timestamp: Joi.string().isoDate().required(),
  payload: Joi.object().required()
}).required();

const requestSchema = Joi.object({
  order_id: Joi.string().trim().min(1).required(),
  payload: Joi.object().default({})
});

module.exports = {
  eventSchema,
  requestSchema
};
