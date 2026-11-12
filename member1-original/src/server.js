
require("dotenv").config();

const express = require("express");
const { connectDatabases, pgPool } = require("./db");

const app = express();
app.use(express.json({ limit: "100kb" }));

const ALLOWED_EVENTS = [
  "IMPRESSION",
  "CLICK",
  "VISIT",
  "ADD_TO_CART",
  "PURCHASE",
];

const POSTGRES_EVENTS = [
  "IMPRESSION",
  "CLICK",
  "VISIT",
  "ADD_TO_CART",
];

const PURCHASE_EVENT = "PURCHASE";

let mongoDb;

// Health endpoint
app.get("/", (req, res) => {
  res.json({
    message: "AdTech Attribution API is running!",
  });
});

// Ingest raw events into MongoDB
app.post("/api/events", async (req, res) => {
  try {
    const {
      user_id,
      event_type,
      channel,
      ad_id,
      device_type,
      revenue,
      order_reference,
      session_id,
    } = req.body;

    if (!Number.isSafeInteger(user_id) || user_id <= 0) {
      return res.status(400).json({
        error: "user_id must be a positive integer",
      });
    }

    if (!ALLOWED_EVENTS.includes(event_type)) {
      return res.status(400).json({
        error: "Invalid event_type",
        allowed: ALLOWED_EVENTS,
      });
    }

    if (typeof channel !== "string" || !channel.trim()) {
      return res.status(400).json({
        error: "channel is required",
      });
    }

    // Validate purchase-specific fields
if (event_type === PURCHASE_EVENT) {
  if (
    typeof revenue !== "number" ||
    !Number.isFinite(revenue) ||
    revenue < 0
  ) {
    return res.status(400).json({
      error: "revenue must be a non-negative number",
    });
  }

  if (
    typeof order_reference !== "string" ||
    !order_reference.trim() ||
    order_reference.trim().length > 100
  ) {
    return res.status(400).json({
      error: "order_reference is required and must be at most 100 characters",
    });
  }

  if (
    session_id !== undefined &&
    session_id !== null &&
    (!Number.isSafeInteger(session_id) || session_id <= 0)
  ) {
    return res.status(400).json({
      error: "session_id must be a positive integer",
    });
  }
}

    if (
      ad_id !== undefined &&
      ad_id !== null &&
      (!Number.isSafeInteger(ad_id) || ad_id <= 0)
    ) {
      return res.status(400).json({
        error: "ad_id must be a positive integer",
      });
    }

    if (
      device_type !== undefined &&
      typeof device_type !== "string"
    ) {
      return res.status(400).json({
        error: "device_type must be a string",
      });
    }

    const now = new Date();

    const event = {
  user_id,
  event_type,
  channel: channel.trim(),
  ad_id: ad_id ?? null,
  device_type: device_type ?? "Unknown",
  event_time: now,
  received_at: now,
};

if (event_type === PURCHASE_EVENT) {
  event.revenue = revenue;
  event.order_reference = order_reference.trim();
  event.session_id = session_id ?? null;
}

    const result = await mongoDb
      .collection("ad_events")
      .insertOne(event);

    return res.status(201).json({
      message: "Event stored successfully",
      event_id: result.insertedId,
      event,
    });
  } catch (error) {
    console.error("Event ingestion failed:", error.message);

    return res.status(500).json({
      error: "Failed to store event",
    });
  }
});

// Synchronize MongoDB events into PostgreSQL
app.post("/api/events/sync", async (req, res) => {
  let client;

  try {
    client = await pgPool.connect();

    const events = await mongoDb
      .collection("ad_events")
      .find({})
      .sort({ received_at: 1 })
      .toArray();

    await client.query("BEGIN");

    let synced = 0;
    let skipped = 0;

    for (const event of events) {
      const eventId = event._id.toString();

      // Process purchase events into PostgreSQL conversions.
if (event.event_type === PURCHASE_EVENT) {
  if (
    typeof event.revenue !== "number" ||
    !Number.isFinite(event.revenue) ||
    event.revenue < 0 ||
    typeof event.order_reference !== "string" ||
    !event.order_reference.trim()
  ) {
    skipped++;
    continue;
  }

  // Check that the user exists.
  const purchaseUser = await client.query(
    "SELECT user_id FROM app_user WHERE user_id = $1",
    [event.user_id]
  );

  if (purchaseUser.rowCount === 0) {
    skipped++;
    continue;
  }

  // Validate the optional session belongs to this user.
  let purchaseSessionId = null;

  if (event.session_id !== null && event.session_id !== undefined) {
    const sessionResult = await client.query(
      `SELECT session_id
       FROM user_session
       WHERE session_id = $1 AND user_id = $2`,
      [event.session_id, event.user_id]
    );

    if (sessionResult.rowCount === 0) {
      skipped++;
      continue;
    }

    purchaseSessionId = event.session_id;
  }

  // Create the conversion, preventing duplicate order references.
  const conversionResult = await client.query(
    `INSERT INTO conversion
       (user_id, session_id, conversion_time, revenue, order_reference)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_reference) DO NOTHING
     RETURNING conversion_id`,
    [
      event.user_id,
      purchaseSessionId,
      event.event_time,
      event.revenue,
      event.order_reference.trim(),
    ]
  );

  if (conversionResult.rowCount > 0) {
    synced++;
  } else {
    skipped++;
  }

  continue;
}

// Ignore other event types that cannot become interactions.
if (!POSTGRES_EVENTS.includes(event.event_type)) {
  skipped++;
  continue;
}

      // Prevent duplicate imports.
      const existing = await client.query(
        `SELECT 1
         FROM ad_interaction
         WHERE mongo_event_id = $1`,
        [eventId]
      );

      if (existing.rowCount > 0) {
        skipped++;
        continue;
      }

      // Validate user.
      const userResult = await client.query(
        "SELECT user_id FROM app_user WHERE user_id = $1",
        [event.user_id]
      );

      if (userResult.rowCount === 0) {
        skipped++;
        continue;
      }

      // Resolve channel name.
      const channelResult = await client.query(
        "SELECT channel_id FROM channel WHERE channel_name = $1",
        [event.channel]
      );

      if (channelResult.rowCount === 0) {
        skipped++;
        continue;
      }

      // Validate the optional advertisement.
      let adId = null;

      if (event.ad_id !== null && event.ad_id !== undefined) {
        const adResult = await client.query(
          `SELECT ad_id, channel_id
           FROM ad
           WHERE ad_id = $1`,
          [event.ad_id]
        );

        if (
          adResult.rowCount === 0 ||
          adResult.rows[0].channel_id !== channelResult.rows[0].channel_id
        ) {
          skipped++;
          continue;
        }

        adId = adResult.rows[0].ad_id;
      }

      // Insert the structured event.
      await client.query(
        `INSERT INTO ad_interaction
          (user_id, ad_id, channel_id, event_type,
           event_time, mongo_event_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          event.user_id,
          adId,
          channelResult.rows[0].channel_id,
          event.event_type,
          event.event_time,
          eventId,
        ]
      );

      synced++;
    }

    await client.query("COMMIT");

    return res.json({
      message: "Event synchronization completed",
      total: events.length,
      synced,
      skipped,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Event synchronization failed:", error.message);

    return res.status(500).json({
      error: "Event synchronization failed",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Start server after both databases connect
async function startServer() {
  try {
    const databases = await connectDatabases();
    mongoDb = databases.mongoDb;

    const port = Number(process.env.PORT) || 3000;

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      console.log("Event endpoint: POST /api/events");
      console.log("Sync endpoint: POST /api/events/sync");
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  }
}

startServer();
