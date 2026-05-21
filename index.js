const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, 
  })
);
app.use(express.json());

// 💡 Removed Better Auth code block and req.url replacement hacks from here!

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@tilux-server.cltfmst.mongodb.net/?appName=Tilux-server`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let facilitiesCollection;
let bookingCollection;

const run = async () => {
  try {
    await client.connect();
    const db = client.db("ArenaX");
    
    facilitiesCollection = db.collection("Facilities");
    bookingCollection = db.collection("Bookings");

    console.log("✅ Connected to MongoDB - ArenaX Database");
    await client.db("admin").command({ ping: 1 });

  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
};
run().catch(console.dir);

// ====================== REST API ENDPOINTS ======================
app.get("/facilities", async (req, res) => {
  try {
    if (!facilitiesCollection) return res.status(503).json({ message: "Database warming up..." });
    const cursor = await facilitiesCollection.find().toArray();
    res.send(cursor);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/bookings", async (req, res) => {
  try {
    if (!bookingCollection) return res.status(503).json({ message: "Database warming up..." });
    const result = await bookingCollection.find(req.query).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/", (req, res) => {
  res.send("ArenaX Server running cleanly!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});