# Distributed Event Ordering System

A Node.js academic project that demonstrates how to reconstruct logical event order in a distributed workflow even when events are generated and delivered asynchronously.

## Problem Statement

In distributed systems, events often do not arrive in the same order in which they were logically produced. Network delay, asynchronous processing, retries, and clock skew can cause events from different services to appear out of sequence. This makes it difficult to understand what actually happened first, what events are causally related, and which events occurred concurrently.

This project addresses the problem of **reconstructing logical event order in distributed systems when events arrive out of order**. Instead of relying on physical timestamps alone, the system uses logical clock techniques to rebuild a meaningful timeline for each order workflow.

The project models a food-ordering flow across multiple services:

- `OrderService`
- `PaymentService`
- `RestaurantService`
- `DeliveryService`

The goal is to observe how distributed events are created, transported, collected, persisted, and then logically reconstructed for analysis.

## Computing Strategy Used

This project uses a combination of distributed systems concepts and practical infrastructure components:

- **Lamport clocks** are used to assign a logical timestamp to each event so that a deterministic total order can be reconstructed.
- **Vector clocks** are used to capture causality information and identify whether neighboring events are causally related or concurrent.
- **Redis Pub/Sub** is used as a lightweight event transport from services to the collector.
- **MongoDB** is used to persist both raw received events and reconstructed ordered events.
- **A static dashboard** is used to visualize per-order timelines and inspect the reconstructed event stream.

### Why this strategy is appropriate

- Lamport clocks are simple and effective for building a total logical ordering across distributed events.
- Vector clocks complement Lamport clocks by capturing causality, which Lamport clocks alone cannot fully express.
- Redis Pub/Sub keeps the prototype lightweight and easy to run for academic demonstration.
- MongoDB allows flexible storage of event payloads and clock metadata.
- The dashboard makes abstract distributed systems concepts easier to explain during evaluation and viva.

## System Architecture

The current implementation follows this workflow exactly:

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
6. The collector subscribes to Redis, stores raw events, and reconstructs the ordered per-order timeline

This is **not** a parallel triggering design. The current implementation is a chained flow:

`OrderService -> PaymentService -> RestaurantService -> DeliveryService`

## Features

- Four independent services running on separate ports
- Lamport clock based logical ordering
- Vector clock based causality and concurrency detection
- Redis Pub/Sub event transport to the collector
- MongoDB persistence for raw and ordered event streams
- Duplicate-event protection at the collector level
- Validation of incoming event payloads
- Collector APIs for raw events, ordered events, and order-specific timelines
- Static dashboard for timeline visualization
- Random delay and physical clock skew for distributed-system simulation

## Detailed Survey / Related Work

Distributed event ordering has been studied through several clock and messaging models:

### Lamport clocks

Lamport clocks provide a scalar logical time that preserves the rule:

If event A happened before event B, then `Lamport(A) < Lamport(B)`.

They are useful for constructing a **deterministic total order**, but they do not fully capture concurrency by themselves.

### Vector clocks

Vector clocks extend logical time by tracking one counter per process or service. They can distinguish:

- one event causally before another
- one event causally after another
- two events being concurrent

They are more expressive than Lamport clocks, but also require more metadata.

### Kafka-style durable event systems

Kafka and similar log-based systems provide durable storage, replay, partitioning, and stronger support for large-scale event processing. They are a better fit for production-grade event streaming, auditing, and recovery, but they introduce more setup and operational complexity than needed for a classroom prototype.

### RabbitMQ and broker-based messaging

RabbitMQ and similar brokers provide queues, routing, acknowledgements, and more reliable delivery semantics than simple pub/sub systems. They are useful when message durability and consumer coordination are important.

### Why Redis Pub/Sub was used here

This project uses Redis Pub/Sub because it is:

- simple to set up
- easy to demonstrate in a lab environment
- lightweight enough for a focused prototype

However, Redis Pub/Sub is used here mainly for **prototype simplicity**, not as a claim of production-grade durability or resilience.

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

The collector reconstructs logical order using:

1. `lamport_timestamp` ascending
2. `service` name as a deterministic tie-breaker

This gives a stable logical order for stored events.

### Vector relation analysis

The collector compares each ordered event with the previous ordered event in the same timeline and labels the relationship as:

- `causal_before`
- `causal_after`
- `concurrent`
- `equal`

This helps explain whether neighboring events are causally linked or independent.

## Known Limitations

This section is intentionally explicit because it reflects the current implementation honestly:

- **Redis Pub/Sub is non-durable**. If the collector is unavailable while an event is published, that event may be lost.
- **The system is partially event-driven**. Events are published to Redis for collection, but downstream service coordination is still performed through direct HTTP calls.
- **Ordering is primarily per-order reconstruction**. The strongest ordering story in this project is the reconstructed timeline for a specific `order_id`.
- **This is not production-grade resilience**. The project is a prototype for academic demonstration, not a fault-tolerant deployment with durable messaging, retries with guarantees, or high-availability infrastructure.

These limitations should be stated clearly during evaluation rather than hidden.

## Setup

### 1. Start infrastructure

Run Redis and MongoDB:

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

Optional configuration:

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

These endpoints are available, but the normal intended workflow is to start from `OrderService`:

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

## Dashboard

Open the dashboard directly in a browser:

```text
dashboard/index.html
```

The dashboard fetches:

```text
http://localhost:4000/orders/:id/timeline
```

It shows:

- total event count
- ordered event cards
- service labels
- Lamport timestamps
- vector timestamps
- vector relation to previous event
- raw JSON for inspection

## Live Demo Flow

For evaluation, the easiest demonstration sequence is:

1. Start Redis and MongoDB
2. Start the collector and all services
3. Submit a new order through `OrderService`
4. Observe the chained execution:
   - `ORDER_PLACED`
   - `PAYMENT_SUCCESS`
   - `FOOD_PREPARING`
   - `OUT_FOR_DELIVERY`
   - `DELIVERED`
5. Observe that events are published asynchronously and may not be trusted by physical timestamp alone
6. Use the collector timeline API to inspect the reconstructed logical order
7. Open the dashboard and visualize the final ordered timeline for the chosen `order_id`

During demo, evaluators should focus on:

- how logical clocks are propagated
- why physical time is not sufficient
- how the collector reconstructs order from distributed events
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
├── docker-compose.yml
├── package.json
└── README.md
```

## Verification

Run the project validation script:

```bash
npm run check
```

Note: the current validation script includes more than syntax checks. Depending on configuration, it may also attempt live API validation.

## Possible Viva Questions

1. **Why are physical timestamps not sufficient in distributed systems?**  
   Because clock skew and network delay can make later-arriving events look earlier in wall-clock time even when they are not logically earlier.

2. **Why use both Lamport clocks and vector clocks?**  
   Lamport clocks provide deterministic total ordering, while vector clocks help detect causality and concurrency.

3. **Why does this project use Redis Pub/Sub instead of Kafka or RabbitMQ?**  
   Redis Pub/Sub was chosen for prototype simplicity and ease of setup, while Kafka and RabbitMQ provide stronger durability and broker features better suited to production systems.

4. **Is this system fully event-driven?**  
   No. Event publication to the collector is event-driven, but downstream service progression is still coordinated by HTTP calls.

5. **What are the main limitations of this design?**  
   Non-durable pub/sub, partial event-driven behavior, per-order reconstruction focus, and lack of production-grade fault tolerance.

## Conclusion

This project is best understood as an educational prototype for demonstrating distributed event ordering using logical clocks. Its strength lies in showing how Lamport clocks and vector clocks can help reconstruct meaningful order when event arrival is asynchronous and unreliable from a physical-time perspective.

For academic evaluation, the strongest presentation strategy is to:

- explain the distributed ordering problem clearly
- demonstrate the current chained service flow honestly
- highlight how logical clocks solve ordering and causality challenges
- acknowledge the system limitations openly

That combination makes the project more defensible, technically credible, and viva-ready.
