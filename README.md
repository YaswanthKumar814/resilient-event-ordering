# Distributed Event Ordering System

A Node.js academic project that demonstrates how to reconstruct logical event order in a distributed workflow when events are generated and delivered asynchronously.

## Problem Statement

In distributed systems, events often do not arrive in the same order in which they were logically produced. Network delay, asynchronous processing, retries, and clock skew can cause events from different services to appear out of sequence. This makes it difficult to determine what happened first, which events are causally related, and which events are concurrent.

This project addresses the problem of **reconstructing logical event order in distributed systems when events arrive out of order**. Instead of relying on physical timestamps alone, the system uses logical clock techniques to rebuild a meaningful timeline for each order workflow.

The project models a food-ordering flow across four services:

- `OrderService`
- `PaymentService`
- `RestaurantService`
- `DeliveryService`

## Computing Strategy Used

This project combines core distributed systems ideas with lightweight infrastructure:

- **Lamport clocks** provide deterministic logical ordering.
- **Vector clocks** capture causality and detect concurrency.
- **Redis Pub/Sub** transports emitted events to the collector.
- **MongoDB** stores both raw events and reconstructed ordered events.
- **A static dashboard** visualizes grouped per-order timelines for demonstration and viva.

### Why this strategy fits the project

- Lamport clocks are simple and effective for reconstructing total order within the chosen workflow context.
- Vector clocks provide additional causality information that Lamport clocks alone cannot express.
- Redis Pub/Sub keeps the prototype lightweight and easy to run in a classroom or lab environment.
- MongoDB is flexible for storing clock metadata and event payloads.
- The dashboard makes abstract distributed ordering concepts easier to explain during evaluation.

## System Architecture

The current implementation follows this chained service flow exactly:

```text
Client
  |
  v
OrderService (3001)
  |
  v
PaymentService (3002)
  |
  v
RestaurantService (3003)
  |
  v
DeliveryService (3004)

Each service publishes its generated event to Redis Pub/Sub ("events")
                                   |
                                   v
                         Event Collector (4000)
                                   |
                                   v
                                MongoDB
```

### Real implementation flow

1. `OrderService` receives `POST /order` and emits `ORDER_PLACED`
2. `OrderService` triggers `PaymentService`
3. `PaymentService` merges the received causal clock state, emits `PAYMENT_SUCCESS`, and triggers `RestaurantService`
4. `RestaurantService` merges the received causal clock state, emits `FOOD_PREPARING`, and triggers `DeliveryService`
5. `DeliveryService` merges the received causal clock state and emits:
   - `OUT_FOR_DELIVERY`
   - `DELIVERED`
6. The collector subscribes to Redis, stores raw events, and reconstructs grouped per-order logical timelines

This is **not** a parallel triggering design. The current flow is:

`OrderService -> PaymentService -> RestaurantService -> DeliveryService`

## Features

- Four independent services running on separate ports
- Lamport-clock based logical ordering
- Vector-clock based causality and concurrency detection
- Redis Pub/Sub event transport to the collector
- MongoDB persistence for raw and ordered event streams
- Duplicate-event protection at the collector level
- Validation of incoming event payloads
- Collector APIs for raw events, grouped ordered events, and order-specific timelines
- Static dashboard for grouped per-order visualization
- Random delay and physical clock skew for distributed-system simulation

## Detailed Survey / Related Work

Distributed event ordering has been studied through multiple clock and messaging approaches:

### Lamport clocks

Lamport clocks provide a scalar logical timestamp that preserves the rule:

If event A happened before event B, then `Lamport(A) < Lamport(B)`.

They are useful for deterministic ordering, but they do not fully represent concurrency on their own.

### Vector clocks

Vector clocks track one logical counter per service. They can distinguish:

- one event causally before another
- one event causally after another
- two events being concurrent

They are more expressive than Lamport clocks, but they require more metadata.

### Kafka-style durable event systems

Kafka and similar log-based platforms provide durable storage, replay, partitioning, and stronger support for large-scale event streaming. They are better suited to production event pipelines, but they add more setup and operational complexity than needed for this prototype.

### RabbitMQ and broker-based messaging

RabbitMQ and similar brokers provide queues, acknowledgements, routing, and more reliable delivery semantics than simple pub/sub systems. They are useful when delivery guarantees and consumer coordination matter.

### Why Redis Pub/Sub was used here

This project uses Redis Pub/Sub because it is:

- simple to set up
- easy to demonstrate in a lab setting
- lightweight enough for a focused academic prototype

It is used here for **prototype simplicity**, not as a claim of production-grade durability.

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
  "payload": {
    "triggered_by": "OrderService",
    "previous_event_id": "uuid",
    "previous_event_type": "ORDER_PLACED",
    "previous_service": "OrderService",
    "source_endpoint": "/pay"
  }
}
```

Newly created events use bounded payload metadata. Recursive payload nesting is intentionally avoided.

## Ordering Logic

### Lamport ordering

The collector reconstructs logical order within each order timeline using:

1. `lamport_timestamp` ascending
2. `service` name as a deterministic tie-breaker

### Vector relation analysis

For each per-order ordered timeline, the collector compares each event with the previous event and labels the relationship as:

- `causal_before`
- `causal_after`
- `concurrent`
- `equal`

## Known Limitations

This project is intentionally honest about its current scope:

- **Redis Pub/Sub is non-durable**. Events may be lost if the collector is unavailable during publication.
- **The system is partially event-driven**. Downstream service progression still uses direct HTTP calls.
- **Ordering is reconstructed per order**. The system does not claim a single global total order across unrelated customer orders.
- **This is not production-grade resilience**. The focus is academic demonstration, not HA deployment or durable recovery guarantees.

## Setup

### 1. Start infrastructure

Run Redis and MongoDB:

```bash
docker compose up -d
```

The Compose file now includes healthchecks for both services to improve local startup reliability.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment if needed

Optional defaults are documented in:

```text
.env.example
```

You can copy those values into a local `.env` file if you want explicit configuration.

### 4. Start the application

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

Documented defaults:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/distributed_event_ordering
REDIS_URL=redis://127.0.0.1:6379
COLLECTOR_PORT=4000
ORDER_SERVICE_PORT=3001
PAYMENT_SERVICE_PORT=3002
RESTAURANT_SERVICE_PORT=3003
DELIVERY_SERVICE_PORT=3004
```

Current implementation notes:

- Redis default: `127.0.0.1:6379`
- MongoDB default: `127.0.0.1:27017`
- Collector default: `127.0.0.1:4000`
- Service ports are currently fixed in [`shared/constants.js`](./shared/constants.js):
  - `OrderService`: `3001`
  - `PaymentService`: `3002`
  - `RestaurantService`: `3003`
  - `DeliveryService`: `3004`
- Dashboard fallback collector base when opened directly: `http://localhost:4000`

## API Usage

### Trigger an order flow

```bash
curl -X POST http://127.0.0.1:3001/order \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":\"order-1001\",\"payload\":{\"customer\":\"Asha\",\"items\":[\"Pizza\"]}}"
```

### Trigger services individually

These endpoints remain available, but the intended workflow is to start from `OrderService`:

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

### Current meaning of `/events/ordered`

`/events/ordered` returns grouped per-order ordered timelines, not a global cross-order sequence:

```json
{
  "orders": [
    {
      "order_id": "order-1001",
      "events": []
    }
  ]
}
```

Each `events` array is logically reconstructed for that `order_id` only.

## Dashboard

Open the dashboard directly in a browser:

```text
dashboard/index.html
```

The dashboard now:

- uses the collector API base shown in the UI
- falls back to `http://localhost:4000` when opened from `file://`
- auto-detects the browser host with port `4000` when served over HTTP

It shows:

- total events collected
- total orders tracked
- latest processed event
- latest active order
- reconstruction status
- grouped per-order reconstructed timelines
- service flow and ordering explanation blocks
- Lamport timestamps
- vector timestamps
- vector relationship labels
- raw JSON for inspection

## Live Demo Flow

For faculty evaluation, the easiest demonstration flow is:

1. Start Redis and MongoDB
2. Start the collector and all services
3. Submit a new order through `OrderService`
4. Observe the chained execution:
   - `ORDER_PLACED`
   - `PAYMENT_SUCCESS`
   - `FOOD_PREPARING`
   - `OUT_FOR_DELIVERY`
   - `DELIVERED`
5. Observe that physical timestamps alone are not enough to explain logical sequence
6. Query the collector to view grouped ordered data and the order-specific timeline
7. Open the dashboard and show the reconstructed per-order logical workflow

During demo, evaluators should focus on:

- how logical clocks are propagated
- why physical time is not sufficient
- how the collector reconstructs order per `order_id`
- how causality and concurrency are interpreted

## Project Structure

```text
distributed-event-ordering/
├── dashboard/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── event-bus/
│   └── redisClient.js
├── event-collector/
│   ├── collector.js
│   ├── orderingEngine.js
│   └── models/
│       ├── EventRaw.js
│       └── EventOrdered.js
├── scripts/
│   ├── startAll.js
│   └── check.js
├── services/
│   ├── baseService.js
│   ├── order-service/
│   │   └── index.js
│   ├── payment-service/
│   │   └── index.js
│   ├── restaurant-service/
│   │   └── index.js
│   └── delivery-service/
│       └── index.js
├── shared/
│   ├── constants.js
│   ├── db.js
│   ├── eventSchema.js
│   ├── lamportClock.js
│   ├── logger.js
│   └── vectorClock.js
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## Verification

Run offline static validation:

```bash
npm run check:static
```

Run live validation when Redis, MongoDB, the collector, and the services are already running:

```bash
npm run check:live
```

Run deterministic offline tests:

```bash
npm test
```

## Possible Viva Questions

1. **Why are physical timestamps not sufficient in distributed systems?**  
   Because clock skew and network delay can make later-arriving events appear earlier in wall-clock time even when they are not logically earlier.

2. **Why use both Lamport clocks and vector clocks?**  
   Lamport clocks provide deterministic logical ordering, while vector clocks help detect causality and concurrency.

3. **Why use Redis Pub/Sub instead of Kafka or RabbitMQ?**  
   Redis Pub/Sub was chosen for simplicity and ease of demonstration, while Kafka and RabbitMQ provide stronger durability and broker features suited to production systems.

4. **Is this system fully event-driven?**  
   No. Event publication to the collector is event-driven, but downstream service progression is still coordinated through HTTP.

5. **Why is ordering presented per order instead of globally?**  
   Because the current reconstruction logic is designed to explain each workflow honestly rather than over-claiming a global cross-order total order.

## Conclusion

This project is best understood as an educational prototype for demonstrating distributed event ordering using logical clocks. Its strength lies in showing how Lamport clocks and vector clocks help reconstruct meaningful workflow order when event arrival is asynchronous and physical time is unreliable.

For final academic evaluation, the strongest presentation strategy is to:

- explain the distributed ordering problem clearly
- demonstrate the current chained service flow honestly
- highlight how logical clocks solve ordering and causality challenges
- acknowledge the implementation limitations openly

That makes the project easier to run, easier to explain, and more defensible during viva.
