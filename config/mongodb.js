import { MongoClient } from "mongodb";
import "dotenv/config";

const client = new MongoClient(process.env.MONGODB_URI);

let db;
let connectionPromise;

export async function connectToMongoDB() {
  if (db) return db;

  if (!connectionPromise) {
    connectionPromise = client.connect()
      .then(() => {
        db = client.db("studiospace");
        console.log("MongoDB Connected Successfully!");
        return db;
      })
      .catch((error) => {
        connectionPromise = null;
        console.error("MongoDB Connection Failed:", error);
        throw error;
      });
  }

  return connectionPromise;
}

export function getDB() {
  if (!db) {
    throw new Error("Database is not connected!");
  }

  return db;
}

export function getMongoClient() {
  return client;
}