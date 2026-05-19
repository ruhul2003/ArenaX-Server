const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://ruhul941020_db_user:SeBV0xyMDe7qeFOj@tilux-server.cltfmst.mongodb.net/?appName=Tilux-server;`;

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
      const cursor = await facilitiesCollection.find().toArray();
      res.send(cursor);
    });

    app.get("/bookings", async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.find(booking).toArray();
      res.send(result);
    });


    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB");
  }
  
  finally
  {
    // await client.close();
  }
};

run();

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
