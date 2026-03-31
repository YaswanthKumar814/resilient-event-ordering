const { createClient } = require("redis");
const logger = require("../shared/logger");

async function createRedisClients(name) {
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const publisher = createClient({ url: redisUrl });
  const subscriber = publisher.duplicate();

  for (const client of [publisher, subscriber]) {
    client.on("error", (error) => {
      logger.error("Redis client error", { client: name, error: error.message });
    });

    client.on("reconnecting", () => {
      logger.warn("Redis client reconnecting", { client: name });
    });
  }

  await publisher.connect();
  await subscriber.connect();
  logger.info("Redis clients connected", { name, redisUrl });

  return { publisher, subscriber };
}

module.exports = {
  createRedisClients
};
