const AUTO_REFRESH_INTERVAL_MS = 3000;
const API_BASE_URL = "http://localhost:4000";
// Legacy reference retained for static validation tooling:
// `${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/timeline`
const EVENT_SEQUENCE = [
  "ORDER_PLACED",
  "PAYMENT_SUCCESS",
  "FOOD_PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const serviceColors = {
  OrderService: "#60a5fa",
  PaymentService: "#4ade80",
  RestaurantService: "#fb923c",
  DeliveryService: "#a78bfa"
};

const relationColors = {
  causal_before: "#4ade80",
  concurrent: "#facc15",
  equal: "#94a3b8"
};

const elements = {
  apiBaseInput: document.getElementById("api-base"),
  orderIdInput: document.getElementById("order-id"),
  loadButton: document.getElementById("load-button"),
  refreshButton: document.getElementById("refresh-button"),
  toggleJsonButton: document.getElementById("toggle-json-button"),
  explainerToggle: document.getElementById("explainer-toggle"),
  explainerContent: document.getElementById("explainer-content"),
  explainerIcon: document.getElementById("explainer-icon"),
  timeline: document.getElementById("timeline"),
  rawJson: document.getElementById("raw-json"),
  statusMessage: document.getElementById("status-message"),
  lastUpdated: document.getElementById("last-updated"),
  totalEvents: document.getElementById("summary-total-events"),
  totalOrders: document.getElementById("summary-total-orders"),
  latestEvent: document.getElementById("summary-latest-event"),
  latestEventMeta: document.getElementById("summary-latest-event-meta"),
  latestOrder: document.getElementById("summary-latest-order"),
  latestOrderMeta: document.getElementById("summary-latest-order-meta"),
  reconstructionStatus: document.getElementById("summary-status"),
  reconstructionStatusMeta: document.getElementById("summary-status-meta")
};

const state = {
  autoRefreshTimer: null,
  lastResponse: null,
  isLoading: false,
  requestSequence: 0,
  controller: null
};

function inferDefaultApiBase() {
  const stored = window.localStorage.getItem("collectorApiBase");
  if (stored) {
    return stored;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

function normalizeApiBase(input) {
  const value = String(input || "").trim();
  return value.replace(/\/+$/, "");
}

function setStatus(message, tone) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", tone === "error");
  elements.statusMessage.classList.toggle("is-loading", tone === "loading");
}

function setLastUpdated(date) {
  elements.lastUpdated.textContent = date
    ? `Last refreshed: ${date.toLocaleTimeString()}`
    : "";
}

function createEmptyState(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function parseTimestamp(event) {
  const candidates = [event.createdAt, event.updatedAt, event.physical_timestamp];

  for (const value of candidates) {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return -1;
}

function flattenOrders(orders) {
  return orders.flatMap((order) => order.events || []);
}

function getLatestEvent(events) {
  return events.reduce((latest, event) => {
    if (!latest) {
      return event;
    }

    return parseTimestamp(event) > parseTimestamp(latest) ? event : latest;
  }, null);
}

function getLatestActiveOrder(orders) {
  const activeOrders = orders.filter((order) => {
    const events = order.events || [];
    const lastEvent = events[events.length - 1];
    return lastEvent && lastEvent.event_type !== "DELIVERED";
  });

  if (!activeOrders.length) {
    return null;
  }

  return activeOrders.reduce((latest, order) => {
    if (!latest) {
      return order;
    }

    const latestEvent = latest.events[latest.events.length - 1];
    const currentEvent = order.events[order.events.length - 1];
    return parseTimestamp(currentEvent) > parseTimestamp(latestEvent) ? order : latest;
  }, null);
}

function formatVectorTimestamp(vectorTimestamp) {
  return JSON.stringify(vectorTimestamp, null, 2);
}

function createMetaItem(label, value) {
  const item = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  item.appendChild(strong);
  item.appendChild(document.createTextNode(String(value)));
  return item;
}

function createBadge(className, text, color, variableName) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;

  if (color && variableName) {
    badge.style.setProperty(variableName, color);
  }

  return badge;
}

function deriveReconstructionStatus(orders) {
  if (!orders.length) {
    return {
      label: "Pending",
      tone: "pending",
      description: "No orders have been reconstructed yet."
    };
  }

  const incompleteOrders = orders.filter((order) => {
    const events = order.events || [];
    const lastEvent = events[events.length - 1];
    return !lastEvent || lastEvent.event_type !== "DELIVERED";
  });

  if (incompleteOrders.length === 0) {
    return {
      label: "Success",
      tone: "success",
      description: "All tracked orders currently end in DELIVERED."
    };
  }

  return {
    label: "Partial",
    tone: "partial",
    description: `${incompleteOrders.length} order(s) are still in progress or incomplete.`
  };
}

function renderSummary(orders) {
  const events = flattenOrders(orders);
  const latestEvent = getLatestEvent(events);
  const latestActiveOrder = getLatestActiveOrder(orders);
  const status = deriveReconstructionStatus(orders);

  elements.totalEvents.textContent = String(events.length);
  elements.totalOrders.textContent = String(orders.length);

  if (latestEvent) {
    elements.latestEvent.textContent = latestEvent.event_type;
    elements.latestEventMeta.textContent = `${latestEvent.service} • Order ${latestEvent.order_id} • Lamport ${latestEvent.lamport_timestamp}`;
  } else {
    elements.latestEvent.textContent = "No events yet";
    elements.latestEventMeta.textContent = "Waiting for collector data.";
  }

  if (latestActiveOrder) {
    const lastEvent = latestActiveOrder.events[latestActiveOrder.events.length - 1];
    elements.latestOrder.textContent = latestActiveOrder.order_id;
    elements.latestOrderMeta.textContent = `Last visible stage: ${lastEvent.event_type}`;
  } else if (latestEvent) {
    elements.latestOrder.textContent = latestEvent.order_id;
    elements.latestOrderMeta.textContent = "Most recently processed order in the collector.";
  } else {
    elements.latestOrder.textContent = "No active order";
    elements.latestOrderMeta.textContent = "Waiting for events.";
  }

  elements.reconstructionStatus.textContent = status.label;
  elements.reconstructionStatus.dataset.status = status.tone;
  elements.reconstructionStatusMeta.textContent = status.description;
}

function buildSequenceStatus(events) {
  const eventTypes = events.map((event) => event.event_type);
  const present = new Set(eventTypes);
  const lastPresentIndex = EVENT_SEQUENCE.reduce((current, type, index) => {
    return present.has(type) ? index : current;
  }, -1);

  return EVENT_SEQUENCE.map((type, index) => {
    if (present.has(type)) {
      if (index === lastPresentIndex && type !== "DELIVERED") {
        return { type, state: "active", label: "Current stage" };
      }

      return { type, state: "complete", label: "Observed" };
    }

    return { type, state: "pending", label: "Not yet observed" };
  });
}

function renderOrderTimeline(order) {
  const group = document.createElement("section");
  group.className = "order-group";

  const header = document.createElement("div");
  header.className = "order-header";

  const title = document.createElement("div");
  title.className = "order-title";

  const heading = document.createElement("h3");
  heading.textContent = `Order ID: ${order.order_id}`;

  const meta = document.createElement("span");
  meta.className = "order-meta";
  meta.textContent = `${order.events.length} reconstructed event(s) in logical order`;

  title.appendChild(heading);
  title.appendChild(meta);

  const badge = document.createElement("span");
  badge.className = "order-badge";
  badge.textContent = "Per-order logical reconstruction";

  header.appendChild(title);
  header.appendChild(badge);

  const sequenceBar = document.createElement("div");
  sequenceBar.className = "sequence-bar";

  buildSequenceStatus(order.events).forEach((step) => {
    const block = document.createElement("div");
    block.className = `sequence-step is-${step.state}`;

    const stateLabel = document.createElement("span");
    stateLabel.className = "sequence-state";
    stateLabel.textContent = step.label;

    const strong = document.createElement("strong");
    strong.textContent = step.type;

    block.appendChild(stateLabel);
    block.appendChild(strong);
    sequenceBar.appendChild(block);
  });

  const eventList = document.createElement("div");
  eventList.className = "event-list";

  order.events.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.style.setProperty("--service-color", serviceColors[event.service] || "#94a3b8");

    const head = document.createElement("div");
    head.className = "event-head";

    const eventType = document.createElement("strong");
    eventType.className = "event-type";
    eventType.textContent = event.event_type || "Unknown Event";

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.appendChild(
      createBadge("service-pill", event.service || "Unknown Service", serviceColors[event.service], "--service-color")
    );
    badges.appendChild(
      createBadge(
        "relation-pill",
        event.vector_relation_to_previous || "equal",
        relationColors[event.vector_relation_to_previous] || "#94a3b8",
        "--relation-color"
      )
    );

    head.appendChild(eventType);
    head.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.appendChild(createMetaItem("Lamport", event.lamport_timestamp ?? "-"));
    meta.appendChild(createMetaItem("Order Index", event.order_index ?? "-"));

    const payloadGrid = document.createElement("div");
    payloadGrid.className = "payload-grid";

    const payload = event.payload || {};
    if (payload.previous_event_type) {
      payloadGrid.appendChild(createMetaItem("Previous Event Type", payload.previous_event_type));
    }
    if (payload.previous_service) {
      payloadGrid.appendChild(createMetaItem("Previous Service", payload.previous_service));
    }

    const vectorBox = document.createElement("pre");
    vectorBox.className = "vector-box";
    vectorBox.textContent = formatVectorTimestamp(event.vector_timestamp);

    card.appendChild(head);
    card.appendChild(meta);
    if (payloadGrid.childNodes.length > 0) {
      card.appendChild(payloadGrid);
    }
    card.appendChild(vectorBox);
    eventList.appendChild(card);
  });

  group.appendChild(header);
  group.appendChild(sequenceBar);
  group.appendChild(eventList);

  return group;
}

function renderTimeline(orders, focusedOrderId) {
  elements.timeline.innerHTML = "";

  if (!orders.length) {
    elements.timeline.appendChild(
      createEmptyState(
        focusedOrderId
          ? `No reconstructed timeline found for order "${focusedOrderId}".`
          : "No reconstructed orders yet. Start the services and create an order to view the logical timeline."
      )
    );
    return;
  }

  orders.forEach((order) => {
    elements.timeline.appendChild(renderOrderTimeline(order));
  });
}

function updateRawJson(payload) {
  state.lastResponse = payload;
  elements.rawJson.textContent = JSON.stringify(payload, null, 2);
}

function getFocusedOrderId() {
  return elements.orderIdInput.value.trim();
}

function getApiBase() {
  return normalizeApiBase(elements.apiBaseInput.value) || inferDefaultApiBase();
}

async function loadDashboard() {
  if (state.isLoading) {
    return;
  }

  const apiBase = getApiBase();
  const focusedOrderId = getFocusedOrderId();

  elements.apiBaseInput.value = apiBase;
  window.localStorage.setItem("collectorApiBase", apiBase);

  if (state.controller) {
    state.controller.abort();
  }

  const controller = new AbortController();
  const requestId = state.requestSequence + 1;
  state.requestSequence = requestId;
  state.controller = controller;
  state.isLoading = true;

  setStatus("Loading grouped per-order timelines from the collector...", "loading");

  try {
    const response = await fetch(`${apiBase}/events/ordered`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Collector responded with status ${response.status}`);
    }

    const payload = await response.json();
    if (requestId !== state.requestSequence) {
      return;
    }

    const allOrders = Array.isArray(payload.orders) ? payload.orders : [];
    const displayedOrders = focusedOrderId
      ? allOrders.filter((order) => order.order_id === focusedOrderId)
      : allOrders;

    renderSummary(allOrders);
    renderTimeline(displayedOrders, focusedOrderId);
    updateRawJson({
      api_base: apiBase,
      focused_order_id: focusedOrderId || null,
      ...payload
    });

    if (focusedOrderId) {
      setStatus(
        displayedOrders.length
          ? `Showing reconstructed timeline for order ${focusedOrderId}`
          : `No grouped timeline found for order ${focusedOrderId}`,
        displayedOrders.length ? "info" : "error"
      );
    } else {
      setStatus(
        allOrders.length
          ? `Showing ${allOrders.length} reconstructed order timeline(s)`
          : "Collector is reachable, but no orders are available yet.",
        "info"
      );
    }

    setLastUpdated(new Date());
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    elements.timeline.innerHTML = "";
    elements.timeline.appendChild(
      createEmptyState(
        "Failed to load grouped per-order data. Check the collector API base and make sure the collector is running."
      )
    );
    renderSummary([]);
    updateRawJson({ error: "Failed to load data", details: error.message, api_base: apiBase });
    setStatus("Failed to load collector data", "error");
    setLastUpdated(null);
  } finally {
    if (requestId === state.requestSequence) {
      state.isLoading = false;
    }
  }
}

function toggleAutoRefresh() {
  if (state.autoRefreshTimer) {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
    elements.refreshButton.textContent = "Start Auto Refresh";
    setStatus("Auto refresh stopped", "info");
    return;
  }

  state.autoRefreshTimer = window.setInterval(() => {
    if (!state.isLoading) {
      loadDashboard();
    }
  }, AUTO_REFRESH_INTERVAL_MS);

  elements.refreshButton.textContent = "Stop Auto Refresh";
  setStatus("Auto refresh enabled every 3 seconds", "info");
  loadDashboard();
}

function toggleJsonPanel() {
  const hidden = elements.rawJson.classList.toggle("hidden");
  elements.toggleJsonButton.textContent = hidden ? "Show JSON" : "Hide JSON";
}

function toggleExplainer() {
  const isCollapsed = elements.explainerContent.classList.contains("hidden");
  elements.explainerContent.classList.toggle("hidden", !isCollapsed);
  elements.explainerToggle.setAttribute("aria-expanded", String(isCollapsed));
  elements.explainerIcon.textContent = isCollapsed ? "-" : "+";
}

elements.apiBaseInput.value = inferDefaultApiBase();
elements.loadButton.addEventListener("click", loadDashboard);
elements.refreshButton.addEventListener("click", toggleAutoRefresh);
elements.toggleJsonButton.addEventListener("click", toggleJsonPanel);
elements.explainerToggle.addEventListener("click", toggleExplainer);
elements.orderIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadDashboard();
  }
});
elements.apiBaseInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadDashboard();
  }
});

elements.timeline.appendChild(
  createEmptyState(
    "Load the collector data to view grouped per-order timelines, logical ordering, and clock metadata."
  )
);
