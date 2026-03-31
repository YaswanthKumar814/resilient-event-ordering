# Resilient Distributed Event Ordering System (Simulation)

A Node.js simulation of a distributed event-driven workflow where independent services emit events asynchronously, Redis transports them out of order, and a collector reconstructs a consistent global timeline using Lamport clocks and vector clocks.

## Features

- Four microservices running independently on separate ports
- Redis Pub/Sub event transport on channel `events`
- MongoDB persistence for raw and ordered event streams
- Lamport clock ordering with service-name tie breaking
- Vector clock comparison for causal and concurrent relationship detection
- Artificial network delay and physical clock skew to simulate distributed-system behavior
- Duplicate-event protection and validation on all incoming data
- Collector APIs for raw events, ordered events, and order-specific timelines

## Architecture

```text
 Client
   |
   v
Order Service (3001) ----+
Payment Service (3002) --+--> Redis Pub/Sub ("events") --> Event Collector (4000) --> MongoDB
Restaurant Service (3003)+
Delivery Service (3004) -+
```

### Event Flow

1. `POST /order` on Order Service creates `ORDER_PLACED`
2. Order Service also triggers Payment, Restaurant, and Delivery services out of order
3. Each downstream service emits one or more events after an artificial random delay
4. Collector stores raw arrival order and rebuilds a Lamport-ordered timeline
5. Vector clocks classify neighboring ordered events as causal or concurrent

## Event Schema

```json
{
  "event_id": "uuid",
  "order_id": "string",
  "event_type": "ORDER_PLACED | PAYMENT_SUCCESS | FOOD_PREPARING | OUT_FOR_DELIVERY | DELIVERED",
  "service": "OrderService | PaymentService | RestaurantService | DeliveryService",
  "lamport_timestamp": 1,
  "vector_timestamp": {
    "0": 1,
    "1": 0,
    "2": 0,
    "3": 0
  },
  "physical_timestamp": "2026-03-18T00:00:00.000Z",
  "payload": {}
}
```

## Ordering Logic

### Lamport ordering

The collector sorts events by:

1. `lamport_timestamp`
2. `service` lexicographically when timestamps tie

This produces a deterministic total order even when events arrive out of order.

### Vector clock comparison

The collector compares each ordered event against the previous event:

- `causal_before`: previous event happened before current event
- `causal_after`: previous event happened after current event
- `concurrent`: neither event causally dominates the other
- `equal`: identical vector timestamps

## Setup

### 1. Start infrastructure

Use local Redis and MongoDB, or run them with Docker:

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the system

Run everything together:

```bash
npm run start:all
```

Or start each process separately:

```bash
npm run start:collector
npm run start:order
npm run start:payment
npm run start:restaurant
npm run start:delivery
```

## Environment Variables

Optional overrides:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/distributed_event_ordering
REDIS_URL=redis://127.0.0.1:6379
COLLECTOR_PORT=4000
```

## API Usage

### Trigger an order flow

```bash
curl -X POST http://127.0.0.1:3001/order \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":\"order-1001\",\"payload\":{\"customer\":\"Asha\",\"items\":[\"Pizza\"]}}"
```

### Trigger services individually

```bash
curl -X POST http://127.0.0.1:3002/pay -H "Content-Type: application/json" -d "{\"order_id\":\"order-1001\"}"
curl -X POST http://127.0.0.1:3003/prepare -H "Content-Type: application/json" -d "{\"order_id\":\"order-1001\"}"
curl -X POST http://127.0.0.1:3004/deliver -H "Content-Type: application/json" -d "{\"order_id\":\"order-1001\"}"
```

### Collector APIs

```bash
curl http://127.0.0.1:4000/events/raw
curl http://127.0.0.1:4000/events/ordered
curl http://127.0.0.1:4000/orders/order-1001/timeline
```

## Project Structure

```text
distributed-event-ordering/
├── services/
│   ├── order-service/
│   ├── payment-service/
│   ├── restaurant-service/
│   ├── delivery-service/
├── event-bus/
│   └── redisClient.js
├── event-collector/
│   ├── collector.js
│   ├── orderingEngine.js
│   └── models/
├── shared/
│   ├── constants.js
│   ├── lamportClock.js
│   ├── vectorClock.js
│   ├── eventSchema.js
│   ├── logger.js
│   └── db.js
├── scripts/
│   ├── startAll.js
│   └── check.js
├── docker-compose.yml
├── package.json
└── README.md
```

## Notes

- Event publication includes random delay to force out-of-order arrival.
- `physical_timestamp` includes random skew so wall clocks are not trustworthy.
- Collector uses event-id idempotency checks before inserting raw events.
- All APIs and event processing are wrapped in error handling to avoid crashes on bad input.

## Verification

Run a lightweight syntax validation:

```bash
npm run check
```
