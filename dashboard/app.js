const API_BASE_URL = "http://localhost:4000";
const AUTO_REFRESH_INTERVAL_MS = 3000;

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
  orderIdInput: document.getElementById("order-id"),
  loadButton: document.getElementById("load-button"),
  refreshButton: document.getElementById("refresh-button"),
  toggleJsonButton: document.getElementById("toggle-json-button"),
  timeline: document.getElementById("timeline"),
  rawJson: document.getElementById("raw-json"),
  statusMessage: document.getElementById("status-message"),
  totalCount: document.getElementById("total-count"),
  lastUpdated: document.getElementById("last-updated")
};

let autoRefreshTimer = null;
let lastResponse = null;

function setStatus(message, isError) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", Boolean(isError));
}

function setLastUpdated(date) {
  elements.lastUpdated.textContent = date
    ? `Last updated: ${date.toLocaleTimeString()}`
    : "";
}

function formatVectorTimestamp(vectorTimestamp) {
  return JSON.stringify(vectorTimestamp, null, 2);
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function createBadge(className, text, color) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;

  if (color) {
    badge.style.setProperty("--service-color", color);
    badge.style.setProperty("--relation-color", color);
  }

  return badge;
}

function createMetaLine(label, value) {
  const item = document.createElement("span");
  item.innerHTML = `<strong>${label}:</strong> ${value}`;
  return item;
}

function renderTimeline(payload) {
  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  elements.timeline.innerHTML = "";
  elements.totalCount.textContent = String(
    typeof payload.total_events === "number" ? payload.total_events : timeline.length
  );

  if (!timeline.length) {
    elements.timeline.appendChild(createEmptyState("No events found"));
    return;
  }

  timeline.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";

    const serviceColor = serviceColors[event.service] || "#94a3b8";
    const relationColor = relationColors[event.vector_relation_to_previous] || "#94a3b8";
    card.style.setProperty("--service-color", serviceColor);

    const head = document.createElement("div");
    head.className = "event-head";

    const eventType = document.createElement("strong");
    eventType.className = "event-type";
    eventType.textContent = event.event_type || "Unknown Event";

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.appendChild(createBadge("service-pill", event.service || "Unknown Service", serviceColor));
    badges.appendChild(
      createBadge(
        "relation-pill",
        event.vector_relation_to_previous || "unknown",
        relationColor
      )
    );

    head.appendChild(eventType);
    head.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.appendChild(createMetaLine("Lamport", event.lamport_timestamp ?? "-"));
    meta.appendChild(createMetaLine("Order Index", event.order_index ?? "-"));

    const vectorBox = document.createElement("pre");
    vectorBox.className = "vector-box";
    vectorBox.textContent = formatVectorTimestamp(event.vector_timestamp);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(vectorBox);
    elements.timeline.appendChild(card);
  });
}

function updateRawJson(payload) {
  lastResponse = payload;
  elements.rawJson.textContent = JSON.stringify(payload, null, 2);
}

function getOrderId() {
  return elements.orderIdInput.value.trim();
}

async function loadTimeline() {
  const orderId = getOrderId();

  if (!orderId) {
    setStatus("Enter an order_id to load a timeline", true);
    elements.timeline.innerHTML = "";
    elements.timeline.appendChild(createEmptyState("Enter an order_id to begin"));
    elements.totalCount.textContent = "0";
    setLastUpdated(null);
    return;
  }

  setStatus("Loading timeline...", false);

  try {
    const response = await fetch(
      `${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/timeline`
    );

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    renderTimeline(payload);
    updateRawJson(payload);
    setStatus(
      payload.timeline && payload.timeline.length
        ? `Loaded ${payload.timeline.length} event(s) for ${payload.order_id}`
        : "No events found",
      false
    );
    setLastUpdated(new Date());
  } catch (error) {
    elements.timeline.innerHTML = "";
    elements.timeline.appendChild(createEmptyState("Failed to load data"));
    elements.totalCount.textContent = "0";
    updateRawJson({ error: "Failed to load data" });
    setStatus("Failed to load data", true);
    setLastUpdated(null);
  }
}

function toggleAutoRefresh() {
  if (autoRefreshTimer) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    elements.refreshButton.textContent = "Start Auto Refresh";
    setStatus("Auto refresh stopped", false);
    return;
  }

  autoRefreshTimer = window.setInterval(() => {
    if (getOrderId()) {
      loadTimeline();
    }
  }, AUTO_REFRESH_INTERVAL_MS);
  elements.refreshButton.textContent = "Stop Auto Refresh";
  setStatus("Auto refresh every 3 seconds", false);

  if (getOrderId()) {
    loadTimeline();
  }
}

function toggleJsonPanel() {
  const isHidden = elements.rawJson.classList.toggle("hidden");
  elements.toggleJsonButton.textContent = isHidden ? "Show JSON" : "Hide JSON";

  if (!isHidden && lastResponse) {
    elements.rawJson.textContent = JSON.stringify(lastResponse, null, 2);
  }
}

elements.loadButton.addEventListener("click", loadTimeline);
elements.refreshButton.addEventListener("click", toggleAutoRefresh);
elements.toggleJsonButton.addEventListener("click", toggleJsonPanel);
elements.orderIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadTimeline();
  }
});

elements.timeline.appendChild(createEmptyState("Enter an order_id to begin"));
