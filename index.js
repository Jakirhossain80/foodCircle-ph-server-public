const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Check for essential environment variables
const requiredEnvVars = [
  "MONGODB_USER",
  "MONGODB_PASS",
  "MONGODB_CLUSTER",
  "MONGODB_DB",
  "MONGODB_APP_NAME",
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APP_NAME}`;

// MongoClient setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let foodCollection;

// MongoDB connection function
async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    foodCollection = db.collection("foodCollection");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run().catch(console.dir);

// Middleware to block requests if DB not ready
app.use((req, res, next) => {
  if (!foodCollection) {
    return res.status(503).send("Server is not ready. Please try again shortly.");
  }
  next();
});

// POST endpoint to handle food addition
app.post("/foods", async (req, res) => {
  try {
    const {
      foodName,
      foodImage,
      quantity,
      location,
      expireAt,
      note,
      userName,
      userEmail,
      userImage,
    } = req.body;

    // Basic required field validation
    if (!foodName || !quantity || !location || !expireAt || !userName || !userEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newFood = {
      foodName,
      foodImage: foodImage || "",
      quantity: Number(quantity),
      location,
      expireAt: new Date(expireAt),
      note: note || "",
      donorName: userName,
      donorEmail: userEmail,
      donorImage: userImage || "",
      foodStatus: "Available",
      createdAt: new Date(),
    };

    const result = await foodCollection.insertOne(newFood);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error("Error adding food:", err);
    res.status(500).json({ error: "Failed to add food" });
  }
});

// Default route
app.get("/", (req, res) => res.send("🍽️ FoodCircle Backend Running"));

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

