import { MongoClient, type Collection } from "mongodb";

// One MongoDB client per server process (survives hot reload in dev). Raw events live in db MONGODB_DB, collection ad_events.
const g = globalThis as unknown as { mongoClient?: Promise<MongoClient>; mongoIndexed?: boolean };

export function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new Error("MONGODB_URI is not set"));
  if (!g.mongoClient) {
    g.mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 }).connect().catch((e) => {
      g.mongoClient = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return g.mongoClient;
}

export async function eventsCollection(): Promise<Collection> {
  const client = await getMongoClient();
  const col = client.db(process.env.MONGODB_DB ?? "adtech_analytics").collection("ad_events");
  if (!g.mongoIndexed) {
    // time-ordered reads for synchronisation, and per-user lookups
    await col.createIndex({ received_at: 1 });
    await col.createIndex({ user_id: 1, received_at: 1 });
    g.mongoIndexed = true;
  }
  return col;
}
