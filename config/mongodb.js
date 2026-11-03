import { MongoClient } from "mongodb";
import "dotenv/config";

const client = new MongoClient(process.env.MONGODB_URI);

let db;

export async function connectToMongoDB() {
  try {
    await client.connect();

    db = client.db("studiospace");

    console.log("MongoDB Connected Successfully!");

    return db;
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    throw error;
  }
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