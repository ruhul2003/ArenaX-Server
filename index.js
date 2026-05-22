const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// ====================== CORS ======================
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5000",
    process.env.CLIENT_URL || "https://arenax-cyan.vercel.app",
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
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

const connectDB = async (req, res, next) => {
    try {
        if (!db) {
            await client.connect();
            db = client.db("ArenaX");
            console.log("✅ Connected to MongoDB - ArenaX Database");
        }
        req.facilitiesCollection = db.collection("Facilities");
        req.bookingCollection = db.collection("Bookings");
        next();
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        res.status(500).json({ message: "Database connection failed" });
    }
};

app.use(connectDB);

// ====================== AUTH MIDDLEWARE ======================
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ message: "Access Denied: No token provided." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired token." });
    }
};

// ====================== AUTH ROUTES ======================
app.post("/auth/login", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 24 * 60 * 60 * 1000,
        });

        res.json({ success: true, message: "Login successful" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/auth/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.json({ success: true, message: "Logged out successfully" });
});

// ====================== FACILITIES ROUTES ======================

// GET Facilities (with owner filter support)
app.get("/facilities", async (req, res) => {
    try {
        const { owner_email } = req.query;
        let query = {};

        if (owner_email) {
            query.owner_email = owner_email;
        }

        const facilities = await req.facilitiesCollection.find(query).toArray();
        res.send(facilities);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// POST New Facility (with owner_email from token)
app.post("/facilities", verifyToken, async (req, res) => {
    try {
        const newFacility = req.body;

        if (!newFacility.name || !newFacility.location || !newFacility.price_per_hour) {
            return res.status(400).json({ message: "Missing required fields: name, location, price_per_hour" });
        }

        // Add owner information from verified token
        newFacility.owner_email = req.user.email;
        newFacility.createdAt = new Date();

        const result = await req.facilitiesCollection.insertOne(newFacility);

        res.status(201).json({
            success: true,
            insertedId: result.insertedId,
            message: "Facility added successfully"
        });
    } catch (err) {
        console.error("Error creating facility:", err);
        res.status(500).json({ message: err.message });
    }
});

// ====================== BASE ROUTE ======================
app.get("/", (req, res) => {
    res.send("✅ ArenaX Server is running successfully!");
});

// Start Server (Local)
if (process.env.NODE_ENV !== "production") {
    app.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
    });
}

module.exports = app;