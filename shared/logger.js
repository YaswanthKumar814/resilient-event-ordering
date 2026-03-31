const levels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG"
};

function formatContext(context = {}) {
  const entries = Object.entries(context);
  if (!entries.length) {
    return "";
  }

  return ` ${JSON.stringify(context)}`;
}

function log(level, message, context) {
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
