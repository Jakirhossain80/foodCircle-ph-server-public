const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const serverless = require("serverless-http");
require("dotenv").config();

const app = express();

// ✅ Manual CORS for Vercel serverless
const allowedOrigin = "https://foodcircle-ph-eleven.netlify.app";
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// ✅ Environment validation
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

// ✅ MongoDB connection
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APP_NAME}`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let foodCollection;
let requestCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    foodCollection = db.collection("foodCollection");
    requestCollection = db.collection("requestCollection");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
run().catch(console.dir);

// ✅ MongoDB readiness check middleware
app.use((req, res, next) => {
  if (!foodCollection) {
    return res.status(503).send("Server is not ready. Please try again shortly.");
  }
  next();
});

// ✅ Routes

app.get("/", (req, res) => res.send("🍽️ FoodCircle Backend Running"));

app.post("/foods", async (req, res) => {
  try {
    const { foodName, foodImage, quantity, location, expireAt, note, userName, userEmail, userImage } = req.body;
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

app.get("/featured-foods", async (req, res) => {
  try {
    const topFoods = await foodCollection.find({ foodStatus: "Available" }).sort({ quantity: -1 }).limit(6).toArray();
    res.json(topFoods);
  } catch (err) {
    console.error("Error fetching featured foods:", err);
    res.status(500).json({ error: "Failed to fetch featured foods" });
  }
});

app.get("/available-foods", async (req, res) => {
  try {
    const { search, sort } = req.query;
    const query = { foodStatus: "Available" };
    if (search) query.foodName = { $regex: search, $options: "i" };
    const sortOptions = {};
    if (sort === "asc") sortOptions.expireAt = 1;
    else if (sort === "desc") sortOptions.expireAt = -1;
    const foods = await foodCollection.find(query).sort(sortOptions).toArray();
    res.json(foods);
  } catch (err) {
    console.error("Error fetching available foods:", err);
    res.status(500).json({ error: "Failed to fetch available foods" });
  }
});

app.get("/food/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid food ID" });
    const food = await foodCollection.findOne({ _id: new ObjectId(id) });
    if (!food) return res.status(404).json({ error: "Food item not found" });
    res.json(food);
  } catch (err) {
    console.error("Error fetching food by ID:", err);
    res.status(500).json({ error: "Failed to fetch food item" });
  }
});

app.put("/foods/request/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid food ID" });
  try {
    const result = await foodCollection.updateOne({ _id: new ObjectId(id) }, { $set: { foodStatus: "requested" } });
    res.json({ success: result.modifiedCount > 0 });
  } catch (err) {
    console.error("Error updating food:", err);
    res.status(500).json({ error: "Failed to update food status" });
  }
});

app.post("/requests", async (req, res) => {
  try {
    const requestData = req.body;
    const result = await requestCollection.insertOne({ ...requestData, createdAt: new Date() });
    res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error("Error saving request:", err);
    res.status(500).json({ error: "Failed to save request" });
  }
});

app.get("/requests", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });
  try {
    const myRequests = await requestCollection.find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
    res.json(myRequests);
  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

app.get("/myfoods", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });
  try {
    const myFoods = await foodCollection.find({ donorEmail: email }).sort({ createdAt: -1 }).toArray();
    res.json(myFoods);
  } catch (err) {
    console.error("Error fetching user-specific foods:", err);
    res.status(500).json({ error: "Failed to fetch your foods" });
  }
});

app.delete("/food/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid food ID" });
  try {
    const result = await foodCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Food item not found or already deleted" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting food:", err);
    res.status(500).json({ error: "Failed to delete food item" });
  }
});

app.put("/food/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid food ID" });
  const updateData = req.body;
  if (updateData.expireAt) {
    updateData.expireAt = new Date(updateData.expireAt);
    if (isNaN(updateData.expireAt)) return res.status(400).json({ error: "Invalid expiration date format" });
  }
  try {
    const result = await foodCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    if (result.modifiedCount === 0) return res.status(404).json({ error: "No document updated. It may not exist." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating food:", err);
    res.status(500).json({ error: "Failed to update food" });
  }
});

// ✅ Export for Vercel serverless
module.exports = serverless(app);
