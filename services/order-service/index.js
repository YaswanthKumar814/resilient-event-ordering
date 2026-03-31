const { createService } = require("../baseService");
const { SERVICES } = require("../../shared/constants");

const service = createService({
  serviceName: SERVICES.OrderService.name,
  port: SERVICES.OrderService.port,
  endpoint: "/order",
  eventSequence: ["ORDER_PLACED"],
  downstreamServices: [
    {
      name: SERVICES.PaymentService.name,
      port: SERVICES.PaymentService.port,
      endpoint: "/pay"
    }
  ]
});

service.start();
