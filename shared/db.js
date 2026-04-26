const mongoose = require("mongoose");
const logger = require("./logger");

let isConnecting = false;
let cleanupRegistered = false;

function registerDatabaseCleanup() {
  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;

  const shutdown = async () => {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");
      } catch (error) {
        logger.warn("MongoDB shutdown encountered an error", { error: error.message });
      }
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/distributed_event_ordering";

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (isConnecting) {
    return mongoose.connection.asPromise();
  }

  isConnecting = true;

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    registerDatabaseCleanup();
    logger.info("MongoDB connected");
    return mongoose.connection;
  } catch (error) {
    logger.error("MongoDB connection failed", { error: error.message });
    throw error;
  } finally {
    isConnecting = false;
  }
}

module.exports = {
  connectToDatabase
};
