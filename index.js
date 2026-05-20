const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@tilux-server.cltfmst.mongodb.net/?appName=Tilux-server`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("ArenaX");
    const usersCollection = db.collection("Users");
    const facilitiesCollection = db.collection("Facilities");
    const bookingCollection = db.collection("Bookings");

    app.get("/facilities", async (req, res) => {
      try {
        const cursor = await facilitiesCollection.find().toArray();
        res.send(cursor);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch facilities", error });
      }
    });

    app.get("/bookings", async (req, res) => {
      try {
        const query = req.query;
        const result = await bookingCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch bookings", error });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Successfully pinged and connected to MongoDB");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
};

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("ArenaX Server is Running smoothly!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});