const { createService } = require("../baseService");
const { SERVICES } = require("../../shared/constants");

const service = createService({
  serviceName: SERVICES.DeliveryService.name,
  port: SERVICES.DeliveryService.port,
  endpoint: "/deliver",
  eventSequence: ["OUT_FOR_DELIVERY", "DELIVERED"],
  beforeSequenceDelayMs: 300
});

service.start();
