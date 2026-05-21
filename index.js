const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// ====================== MIDDLEWARES ======================
// Allowed origins list: Includes your local testing environment and your live client site
const allowedOrigins = [
  "http://localhost:3000",
  "https://arenax-cyan.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Crucial for passing JWT auth cookies between different domains
  })
);
app.use(express.json());
app.use(cookieParser()); 

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
    // await client.connect();
    const db = client.db("ArenaX");
    
    facilitiesCollection = db.collection("Facilities");
    bookingCollection = db.collection("Bookings");

    console.log(" Connected to MongoDB - ArenaX Database");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
};
run().catch(console.dir);


// ====================== AUTH MIDDLEWARE (Token Verification) ======================
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token; 

  if (!token) {
    return res.status(401).json({ message: "Access Denied: No token provided. Please log in." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; 
    next(); 
  } catch (err) {
    res.status(403).json({ message: "Invalid or expired token." });
  }
};


// ====================== REST API ENDPOINTS ======================

app.post("/auth/login", async (req, res) => {
  try {
    const { email } = req.body; 
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const payload = { email };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, {
      httpOnly: true,                                  
      secure: true, // Must be true on production for cross-site cookie assignment
      sameSite: "none", // Must be "none" to share cookies between different domains (.vercel.app)
      maxAge: 24 * 60 * 60 * 1000,                
    });

    res.send({ success: true, message: "Authentication cookie set successfully." });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

app.post("/auth/logout", async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.send({ success: true, message: "Logged out cleanly." });
});

app.get("/facilities", async (req, res) => {
  try {
    if (!facilitiesCollection) return res.status(503).json({ message: "Database warming up..." });
    
    const { search, sportType } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } }
      ];
    }

    if (sportType) {
      const sportsArray = sportType.split(",");
      query.$or = query.$or || [];
      query.$or.push(
        { sportType: { $in: sportsArray } },
        { facility_type: { $in: sportsArray } }
      );
    }

    const cursor = await facilitiesCollection.find(query).toArray();
    res.send(cursor);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/bookings", verifyToken, async (req, res) => {
  try {
    if (!bookingCollection) return res.status(503).json({ message: "Database warming up..." });
    
    const result = await bookingCollection.find(req.query).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/", (req, res) => {
  res.send("ArenaX Server running cleanly with JWT cookie-auth!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});