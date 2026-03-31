const { createService } = require("../baseService");
const { SERVICES } = require("../../shared/constants");

const service = createService({
  serviceName: SERVICES.PaymentService.name,
  port: SERVICES.PaymentService.port,
  endpoint: "/pay",
  eventSequence: ["PAYMENT_SUCCESS"]
});

service.start();
