require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;


const requiredEnvVars = [
  "MONGODB_USER",
  "MONGODB_PASS",
  "MONGODB_CLUSTER",
  "MONGODB_DB",
  "MONGODB_APP_NAME",
  "JWT_SECRET"
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}


app.use(cors());
app.use(express.json());

app.use(cors({
  origin: ["https://foodcircle-ph-eleven.netlify.app","http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));


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
let requestCollection;

// ✅ Function to normalize incorrect expireAt string fields
async function normalizeExpireAtField() {
  const cursor = foodCollection.find({ expireAt: { $type: "string" } });

  for await (const doc of cursor) {
    const parsedDate = new Date(doc.expireAt);
    if (!isNaN(parsedDate)) {
      await foodCollection.updateOne(
        { _id: doc._id },
        { $set: { expireAt: parsedDate } }
      );
      console.log(`✅ Updated expireAt for food ID: ${doc._id}`);
    } else {
      console.warn(`⚠️ Skipped invalid date for food ID: ${doc._id}`);
    }
  }
}

// MongoDB connection function
async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    foodCollection = db.collection("foodCollection");
    requestCollection = db.collection("requestCollection");
    console.log("✅ Connected to MongoDB");

    // ✅ Normalize incorrect expireAt formats
    await normalizeExpireAtField();
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

// ✅ JWT generator route (called after successful frontend login)
app.post("/jwt", (req, res) => {
  const user = req.body; // expects { email: userEmail }

  if (!user?.email) {
    return res.status(400).json({ error: "Email required to generate token" });
  }

  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });

  res.send({ token });
});

// ✅ JWT verify middleware
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized access" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Forbidden access" });

    req.decoded = decoded;
    next();
  });
};

// ✅ Secure routes (using verifyJWT)

app.post("/foods", verifyJWT, async (req, res) => {
  try {
    const {
      foodName, foodImage, quantity, location, expireAt, note, userName, userEmail, userImage
    } = req.body;

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
    const topFoods = await foodCollection
      .aggregate([
        { $match: { foodStatus: "Available" } },
        {
          $addFields: {
            quantityNumeric: {
              $cond: [
                { $isNumber: "$quantity" },
                "$quantity",
                {
                  $convert: {
                    input: "$quantity",  // handles "3", "03", "3.5", etc.
                    to: "double",
                    onError: 0,          // if "2 kg" or invalid → 0 (no crash)
                    onNull: 0
                  }
                }
              ]
            }
          }
        },
        { $sort: { quantityNumeric: -1 } },
        { $limit: 6 },
        // Optional: project only what the UI needs (keeps payload lean)
        {
          $project: {
            foodName: 1,
            foodImage: 1,
            quantity: 1,
            location: 1,
            note: 1
          }
        }
      ])
      .toArray();

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

app.get("/food/:id", verifyJWT, async (req, res) => {
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

app.put("/foods/request/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid food ID" });

  try {
    const result = await foodCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { foodStatus: "requested" } }
    );
    res.json({ success: result.modifiedCount > 0 });
  } catch (err) {
    console.error("Error updating food:", err);
    res.status(500).json({ error: "Failed to update food status" });
  }
});

app.post("/requests", verifyJWT, async (req, res) => {
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

app.get("/myfoods", verifyJWT, async (req, res) => {
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

app.delete("/food/:id", verifyJWT, async (req, res) => {
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

app.put("/food/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid food ID" });
  }

  try {
    const updateData = req.body;
    const result = await foodCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Food item not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating food:", err);
    res.status(500).json({ error: "Failed to update food" });
  }
});

app.get("/", (req, res) => {
  res.send("FoodCircle Server is running");
});

app.listen(port, () => {
  console.log(`FoodCircle Server is listening on port ${port}`);
});
