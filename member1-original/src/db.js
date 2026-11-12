
require("dotenv").config();

const { Pool } = require("pg");
const { MongoClient } = require("mongodb");

const pgPool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const mongoClient = new MongoClient(process.env.MONGODB_URI);

async function connectDatabases() {
  const result = await pgPool.query("SELECT NOW() AS current_time");
  console.log("PostgreSQL connected:", result.rows[0].current_time);

  await mongoClient.connect();

  const mongoDb = mongoClient.db(process.env.MONGODB_DATABASE);
  await mongoDb.command({ ping: 1 });

  console.log("MongoDB connected successfully!");

  return { pgPool, mongoClient, mongoDb };
}

module.exports = {
  pgPool,
  mongoClient,
  connectDatabases,
};
