const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// ====================== MIDDLEWARES ======================

const allowedOrigins = [
  "http://localhost:3000",
  "https://arena-x-xi.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    // Add "PATCH" right here 👇
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Set-Cookie"], 
  }),
);

app.use(express.json());
app.use(cookieParser());

// Apply DB middleware only to /api routes
app.use("/api", connectDatabaseMiddleware);

// ====================== DATABASE CONNECTION ======================
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


const verifyToken = (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1]; 
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  } 
  next();

}

let cachedDb = null;
let cachedCollections = {};

async function connectDatabaseMiddleware(req, res, next) {
  try {
    if (!cachedDb) {
      await client.connect();
      cachedDb = client.db("ArenaX");

      cachedCollections = {
        facilitiesCollection: cachedDb.collection("Facilities"),
        usersCollection: cachedDb.collection("Users"),
        bookingsCollection: cachedDb.collection("Bookings"),
      };
      console.log("✅ Connected to MongoDB Atlas successfully.");
    }

    req.dbCollections = cachedCollections;
    next();
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
}

// ====================== AUTH ROUTES ======================

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { usersCollection } = req.dbCollections;
    const { email, password } = req.body;

    const user = await usersCollection.findOne({
      email: email.toLowerCase().trim(),
    });

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log("✅ User authenticated successfully:", user.email);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { usersCollection } = req.dbCollections;
    const { name, email, password, image } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const existingUser = await usersCollection.findOne({ email: cleanEmail });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({
      name,
      email: cleanEmail,
      password: hashedPassword,
      image: image || "",
      role: "user",
      createdAt: new Date(),
    });

    res
      .status(201)
      .json({ success: true, message: "Account created successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

// ====================== FACILITIES ROUTES ======================
app.get("/api/facilities", async (req, res) => {
  try {
    const { facilitiesCollection } = req.dbCollections;
    const result = await facilitiesCollection.find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to load facilities data." });
  }
});

app.post("/api/facilities", async (req, res) => {
  try {
    const { facilitiesCollection } = req.dbCollections;
    
    const {
      name,
      facility_type,
      location,
      price_per_hour,
      capacity,
      description,
      image,
      owner_email,   // ← Frontend থেকে আসবে
      email          // ← Backup (যদি কোনো কারণে owner_email না আসে)
    } = req.body;

    // Safety Check
    const finalOwnerEmail = owner_email || email;
    if (!finalOwnerEmail) {
      return res.status(400).json({ 
        success: false, 
        message: "Owner email is required" 
      });
    }

    const newFacility = {
      name,
      facility_type,
      location,
      price_per_hour: parseFloat(price_per_hour) || 0,
      capacity: parseInt(capacity, 10) || 0,
      description,
      image,
      owner_email: finalOwnerEmail,   // ← এটাই গুরুত্বপূর্ণ
      createdAt: new Date(),
    };

    const result = await facilitiesCollection.insertOne(newFacility);

    console.log(`✅ New facility created by: ${finalOwnerEmail}, ID: ${result.insertedId}`);

    res.status(201).json({
      success: true,
      message: "Facility added successfully!",
      facilityId: result.insertedId,
    });
  } catch (err) {
    console.error("Facility creation error:", err);
    res.status(500).json({
      success: false,
      message: "Server encountered an error creating the facility listing.",
    });
  }
});

app.get("/api/facility/:id",verifyToken, async (req, res, next) => {
  const header = req.headers.authorization



  try {
    const { facilitiesCollection } = req.dbCollections;
    const { id } = req.params;
    if (!id || id.length < 12)
      return res.status(400).json({ message: "Invalid ID format specified." });

    let query = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id };
    const facility = await facilitiesCollection.findOne(query);
    if (!facility)
      return res
        .status(404)
        .json({ message: "Facility venue could not be found." });

    res.json(facility);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Internal Server Error exploring facility details." });
  }
});

app.put("/api/facility/:id", async (req, res) => {
  try {
    const { facilitiesCollection } = req.dbCollections;
    const { id } = req.params;
    const {
      name,
      facility_type,
      location,
      price_per_hour,
      capacity,
      description,
      image,
    } = req.body;

    let query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const updatedData = {
      name,
      facility_type,
      location,
      price_per_hour: parseFloat(price_per_hour) || 0,
      capacity: parseInt(capacity, 10) || 0,
      description,
      image,
      updatedAt: new Date(),
    };

    await facilitiesCollection.updateOne(query, { $set: updatedData });
    res.json({
      success: true,
      message: "Facility details saved successfully!",
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Server encountered an error saving updates." });
  }
});

// Backend: index.js এর ডিলিট রাউটটি পরিবর্তন করুন
app.delete("/api/facility/:id", async (req, res) => {
  try {
    const { facilitiesCollection } = req.dbCollections;
    const { id } = req.params;
    let query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    await facilitiesCollection.deleteOne(query);
    res.json({ success: true, message: "Listing successfully truncated." });
  } catch (err) {
    res.status(500).json({ message: "Internal destruction handler error." });
  }
});

// Backend: index.js এর /api/my-facilities রাউটটি এভাবে পরিবর্তন করুন
app.get("/api/my-facilities", async (req, res) => {
  try {
    const { facilitiesCollection } = req.dbCollections;
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({ success: false, message: "Missing email parameter." });
    }

    const result = await facilitiesCollection
      .find({ owner_email: email })
      .toArray();

    // success এবং data কি দিয়ে অবজেক্ট পাঠান
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching user facilities:", error);
    res.status(500).json({ success: false, message: "Failed to access user details." });
  }
});

// ====================== BOOKINGS ROUTES ======================
app.post(["/api/booking", "/api/bookings"], async (req, res) => {
  try {
    const { facilitiesCollection, bookingsCollection } = req.dbCollections;

    const facility_id = req.body.facilityId || req.body.facility_id;
    const booking_date = req.body.date || req.body.booking_date;
    const time_slot = req.body.slot || req.body.time_slot;
    const total_price = req.body.totalBill || req.body.total_price;
    const facility_name = req.body.facility_name;
    const hours = req.body.hours || 2;
    const userEmail = req.body.email; // Expecting user email explicitly passed from front-end

    if (!facility_id || !booking_date || !time_slot || !userEmail) {
      return res
        .status(400)
        .json({ message: "Missing required booking payload items." });
    }

    let query = ObjectId.isValid(facility_id)
      ? { _id: new ObjectId(facility_id) }
      : { _id: facility_id };
    const facilityData = await facilitiesCollection.findOne(query);

    const newBooking = {
      facilityId: ObjectId.isValid(facility_id)
        ? new ObjectId(facility_id)
        : facility_id,
      name: facility_name || facilityData?.name || "Premium Arena",
      image: facilityData?.image || "",
      facility_type: facilityData?.facility_type || "",
      location: facilityData?.location || "",
      date: booking_date,
      slot: time_slot,
      hours: parseInt(hours, 10) || 1,
      amountPaid:
        total_price || facilityData?.price_per_hour * parseInt(hours, 10) || 0,
      userEmail: userEmail,
      status: "PENDING",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.status(201).json({
      success: true,
      message: "Reservation logged successfully!",
      bookingId: result.insertedId,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Server encountered an error saving reservation." });
  }
});

app.get("/api/my-bookings", async (req, res) => {
  try {
    const { bookingsCollection } = req.dbCollections;
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ message: "Missing email parameter." });
    }

    const userBookings = await bookingsCollection
      .find({ 
        userEmail: email,
        status: { $ne: "CANCELLED" }   // ← Cancelled বাদ দিয়ে শুধু Active নিয়ে আসবে
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(userBookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ message: "Could not fetch user reservations." });
  }
});

// ====================== CANCEL BOOKING ======================
app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try {
    const { bookingsCollection } = req.dbCollections;
    const { id } = req.params;
    const { email } = req.body;   // User email for ownership check

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID." });
    }

    const targetBooking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!targetBooking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }

    // Ownership check (important for security)
    if (email && targetBooking.userEmail !== email) {
      return res.status(403).json({ success: false, message: "You can only cancel your own bookings." });
    }

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "CANCELLED", cancelledAt: new Date() } }
    );

    res.json({ 
      success: true, 
      message: "Booking cancelled successfully." 
    });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error while cancelling booking." 
    });
  }
});

// Root Route
app.get("/", (req, res) => {
  res.status(200).json({ status: "healthy", service: "ArenaX Live Engine" });
});

// Start Server (for local development)
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

module.exports = app;