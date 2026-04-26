const levels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG"
};

const levelPriority = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const activeLevel = String(process.env.LOG_LEVEL || "info").toLowerCase();

function redactString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/mongodb:\/\/[^/\s]+/gi, "mongodb://<redacted>")
    .replace(/redis:\/\/[^/\s]+/gi, "redis://<redacted>");
}

function sanitizeContextValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeContextValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeContextValue(entryValue)])
    );
  }

  return redactString(value);
}

function formatContext(context = {}) {
  const sanitized = sanitizeContextValue(context);
  const entries = Object.entries(sanitized);
  if (!entries.length) {
    return "";
  }

  return ` ${JSON.stringify(sanitized)}`;
}

function log(level, message, context) {
  if ((levelPriority[level] || levelPriority.info) < (levelPriority[activeLevel] || levelPriority.info)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const normalizedLevel = levels[level] || levels.info;
  console.log(`[${timestamp}] [${normalizedLevel}] ${message}${formatContext(context)}`);
}

module.exports = {
  info: (message, context) => log("info", message, context),
  warn: (message, context) => log("warn", message, context),
  error: (message, context) => log("error", message, context),
  debug: (message, context) => log("debug", message, context)
};
