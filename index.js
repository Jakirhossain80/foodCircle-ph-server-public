const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APP_NAME}`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let foodCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    foodCollection = db.collection("foodCollection");

    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
run();


app.get("/", (req, res) => res.send("FoodCircle Backend Running"));


app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
