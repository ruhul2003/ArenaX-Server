const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// ====================== MIDDLEWARES ======================
const allowedOrigins = [
  "http://localhost:3000",
  "https://arenax-cyan.vercel.app" // Your live client site
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, 
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

let db;
// Middleware to ensure database connection is alive before handling requests
const connectDB = async (req, res, next) => {
  try {
    if (!db) {
      await client.connect();
      db = client.db("ArenaX");
      console.log("Connected to MongoDB - ArenaX Database");
    }
    req.facilitiesCollection = db.collection("Facilities");
    req.bookingCollection = db.collection("Bookings");
    next();
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    res.status(500).json({ message: "Database connection failed" });
  }
};

// Apply database connection check globally
app.use(connectDB);

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
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

// ====================== REST API ENDPOINTS ======================

// --- Authentication ---
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
      secure: true, // Required on live deployment (HTTPS)
      sameSite: "none", // Required for cross-domain cookies across different domains
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

// --- Facilities Endpoints ---

// 1. GET All/Filtered Facilities
app.get("/facilities", async (req, res) => {
  try {
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

    const cursor = await req.facilitiesCollection.find(query).toArray();
    res.send(cursor);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 2. POST Add New Facility (Protected Route)
app.post("/facilities", verifyToken, async (req, res) => {
  try {
    const newFacility = req.body;

    // Server-side validation check
    if (!newFacility.name || !newFacility.location || !newFacility.price_per_hour) {
      return res.status(400).json({ message: "Missing required fields: Name, Location, or Price." });
    }

    const result = await req.facilitiesCollection.insertOne(newFacility);
    res.status(201).json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error("Error creating facility:", err);
    res.status(500).json({ message: err.message });
  }
});

// --- Bookings Endpoints ---
app.get("/bookings", verifyToken, async (req, res) => {
  try {
    const result = await req.bookingCollection.find(req.query).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Base Test Route ---
app.get("/", (req, res) => {
  res.send("ArenaX Server running cleanly with JWT cookie-auth!");
});

// For local testing, we still bind the port
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;