const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'your_fallback_secret_key_123';

// ==========================================
// ⚙️ MIDDLEWARES
// ==========================================
const allowedOrigins = [
    'http://localhost:3000',
    'https://arenax-cyan.vercel.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// ==========================================
// 🍃 MONGODB CONNECTION
// ==========================================
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db, facilitiesCollection, usersCollection, bookingsCollection;

async function startServer() {
    try {
        await client.connect();
        db = client.db("ArenaX");
        facilitiesCollection = db.collection("Facilities");
        usersCollection = db.collection("Users");
        bookingsCollection = db.collection("Bookings");
        
        console.log("🎯 Connected to MongoDB.");
        app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
    } catch (err) {
        console.error("❌ MongoDB connection failed:", err);
        process.exit(1);
    }
}

// ==========================================
// 🔐 REUSABLE AUTH MIDDLEWARE
// ==========================================
const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Access denied. Please log in first." });

    jwt.verify(token, jwtSecret, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Session expired. Please log in again." });
        req.user = decoded; // Contains id and email
        next();
    });
};

// ==========================================
// 🔐 AUTH ROUTES
// ==========================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email: email.toLowerCase().trim() });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, user: { name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' 
    });
    res.json({ success: true, message: "Logged out successfully" });
});

app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.json({ success: false, user: null });

    jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) return res.json({ success: false, user: null });
        const user = await usersCollection.findOne({ _id: new ObjectId(decoded.id) }, { projection: { password: 0 } });
        res.json({ success: true, user });
    });
});

// ==========================================
// 🏟️ FACILITIES ROUTES
// ==========================================

// GET: All facilities
app.get('/api/facilities', async (req, res) => {
    const result = await facilitiesCollection.find().toArray();
    res.send(result);
});

// GET: Single facility details
app.get('/api/facility/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || id.length < 12) {
            return res.status(400).json({ message: "Invalid ID format specified." });
        }
        
        let query = {};
        if (ObjectId.isValid(id)) {
            query = { 
                $or: [
                    { _id: new ObjectId(id) },
                    { _id: id }
                ] 
            };
        } else {
            query = { _id: id };
        }
        
        const facility = await facilitiesCollection.findOne(query);
        
        if (!facility) {
            return res.status(404).json({ message: "Facility venue could not be found in database." });
        }
        
        res.json(facility);
    } catch (err) {
        console.error("Error fetching facility by ID:", err);
        res.status(500).json({ message: "Internal Server Error exploring facility details." });
    }
});

// PUT: Update facility details
app.put('/api/facility/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, facility_type, location, price_per_hour, capacity, description, image } = req.body;

        if (!id || id.length < 12) {
            return res.status(400).json({ message: "Invalid facility ID format specified." });
        }

        let query = {};
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { _id: id };
        }

        const existingFacility = await facilitiesCollection.findOne(query);
        if (!existingFacility) {
            return res.status(404).json({ message: "Facility record not found to update." });
        }

        const updatedData = {
            name: name,
            facility_type: facility_type,
            location: location,
            price_per_hour: parseFloat(price_per_hour) || 0,
            capacity: parseInt(capacity, 10) || 0,
            description: description,
            image: image,
            updatedAt: new Date()
        };

        await facilitiesCollection.updateOne(query, { $set: updatedData });

        res.json({ success: true, message: "Facility details saved successfully!" });
    } catch (err) {
        console.error("Error updating facility:", err);
        res.status(500).json({ message: "Server encountered an error saving updates.", error: err.message });
    }
});

// DELETE: Remove facility listing (➕ ADDED: Re-integrated the missing router map for your deletion handlers)
app.delete('/api/facilities/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: "Required parameter identifier missing." });

        let query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const target = await facilitiesCollection.findOne(query);

        if (!target) return res.status(404).json({ message: "Facility context does not exist." });

        await facilitiesCollection.deleteOne(query);
        res.json({ success: true, message: "Listing successfully truncated." });
    } catch (err) {
        res.status(500).json({ message: "Internal destruction handler error.", error: err.message });
    }
});

// GET: User's owned facilities
app.get('/api/my-facilities', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) return res.status(401).json({ message: "Unauthorized" });
        
        const result = await facilitiesCollection.find({ owner_email: decoded.email }).toArray();
        res.json(result);
    });
});

// ==========================================
// 🎫 BOOKINGS ROUTES
// ==========================================

// POST: Create a booking (🛠️ FIXED: Added fallback for singular route /api/booking to fix frontend mismatches)
app.post(['/api/booking', '/api/bookings'], verifyToken, async (req, res) => {
    try {
        // 🛠️ FIXED: Frontend payload uses `facilityId`, `date`, `slot`, and `totalBill`
        // We accept both frontend property name variations to protect against breaks
        const facility_id = req.body.facilityId || req.body.facility_id;
        const booking_date = req.body.date || req.body.booking_date;
        const time_slot = req.body.slot || req.body.time_slot;
        const total_price = req.body.totalBill || req.body.total_price;
        const facility_name = req.body.facility_name;
        const hours = req.body.hours || 2; 

        if (!facility_id || !booking_date || !time_slot) {
            return res.status(400).json({ message: "Missing required booking payload items (facilityId, date, slot)." });
        }

        // Secure clean query evaluation for string or true Object IDs
        let query = ObjectId.isValid(facility_id) ? { _id: new ObjectId(facility_id) } : { _id: facility_id };
        const facilityData = await facilitiesCollection.findOne(query);

        const newBooking = {
            facilityId: ObjectId.isValid(facility_id) ? new ObjectId(facility_id) : facility_id,
            name: facility_name || facilityData?.name || "Premium Arena",
            image: facilityData?.image || "", 
            facility_type: facilityData?.facility_type || "",
            location: facilityData?.location || "",
            date: booking_date,            
            slot: time_slot,               
            hours: parseInt(hours, 10) || 1,
            amountPaid: total_price || (facilityData?.price_per_hour * parseInt(hours, 10)) || 0,       
            userEmail: req.user.email,     
            status: "PENDING",             
            createdAt: new Date()
        };

        const result = await bookingsCollection.insertOne(newBooking);
        
        res.status(201).json({ 
            success: true, 
            message: "Reservation logged successfully!", 
            bookingId: result.insertedId 
        });

    } catch (err) {
        console.error("Error creating booking:", err);
        res.status(500).json({ message: "Server encountered an error saving reservation.", error: err.message });
    }
});

// GET: Current user's bookings
app.get('/api/my-bookings', verifyToken, async (req, res) => {
    try {
        const userBookings = await bookingsCollection
            .find({ userEmail: req.user.email })
            .sort({ createdAt: -1 }) 
            .toArray();

        res.json(userBookings);
    } catch (err) {
        res.status(500).json({ message: "Could not fetch user reservations.", error: err.message });
    }
});

// PATCH: Cancel a booking
app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid booking ID template." });
        }

        const targetBooking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

        if (!targetBooking) {
            return res.status(404).json({ message: "Booking record could not be found." });
        }

        if (targetBooking.userEmail !== req.user.email) {
            return res.status(403).json({ message: "Forbidden. You do not own this booking." });
        }

        await bookingsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "CANCELLED" } }
        );

        res.json({ success: true, message: "Reservation cancelled successfully." });
    } catch (err) {
        res.status(500).json({ message: "Server error executing cancellation requests.", error: err.message });
    }
});

startServer();