const SERVICES = {
  OrderService: {
    name: "OrderService",
    shortName: "order",
    port: 3001,
    index: 0
  },
  PaymentService: {
    name: "PaymentService",
    shortName: "payment",
    port: 3002,
    index: 1
  },
  RestaurantService: {
    name: "RestaurantService",
    shortName: "restaurant",
    port: 3003,
    index: 2
  },
  DeliveryService: {
    name: "DeliveryService",
    shortName: "delivery",
    port: 3004,
    index: 3
  }
};

const SERVICE_ORDER = Object.keys(SERVICES);

const EVENT_TYPES = [
  "ORDER_PLACED",
  "PAYMENT_SUCCESS",
  "FOOD_PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const EVENT_CHANNEL = "events";

module.exports = {
  SERVICES,
  SERVICE_ORDER,
  EVENT_TYPES,
  EVENT_CHANNEL
};
