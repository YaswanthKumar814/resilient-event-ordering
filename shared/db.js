const mongoose = require("mongoose");
const logger = require("./logger");

let isConnecting = false;

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
    logger.info("MongoDB connected", { mongoUri });
    return mongoose.connection;
  } catch (error) {
    logger.error("MongoDB connection failed", { error: error.message, mongoUri });
    throw error;
  } finally {
    isConnecting = false;
  }
}

module.exports = {
  connectToDatabase
};
