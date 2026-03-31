const { createService } = require("../baseService");
const { SERVICES } = require("../../shared/constants");

const service = createService({
  serviceName: SERVICES.RestaurantService.name,
  port: SERVICES.RestaurantService.port,
  endpoint: "/prepare",
  eventSequence: ["FOOD_PREPARING"],
  downstreamServices: [
    {
      name: SERVICES.DeliveryService.name,
      port: SERVICES.DeliveryService.port,
      endpoint: "/deliver"
    }
  ]
});

service.start();
