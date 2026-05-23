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

// ====================== MIDDLEWARES ======================
const allowedOrigins = [
    'http://localhost:3000',
    'https://arenax-cyan.vercel.app',
    'https://arena-x-xi.vercel.app'
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

// ====================== DATABASE CONNECTION ======================
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

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
                bookingsCollection: cachedDb.collection("Bookings")
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

app.use('/api', connectDatabaseMiddleware);

// ====================== AUTH MIDDLEWARE ======================
const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Access denied. Please log in first." });

    jwt.verify(token, jwtSecret, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Session expired. Please log in again." });
        req.user = decoded;
        next();
    });
};

// ====================== AUTH ROUTES ======================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { usersCollection } = req.dbCollections;
        const { email, password } = req.body;

        const user = await usersCollection.findOne({ email: email.toLowerCase().trim() });
        
        if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password" });
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
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { usersCollection } = req.dbCollections;
        const { name, email, password, image } = req.body;
        const cleanEmail = email.toLowerCase().trim();

        const existingUser = await usersCollection.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({ message: "An account with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.insertOne({
            name,
            email: cleanEmail,
            password: hashedPassword,
            image: image || "",
            role: "user",
            createdAt: new Date()
        });

        res.status(201).json({ success: true, message: "Account created successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// Google OAuth
app.get('/api/auth/google', (req, res) => {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    
    const options = {
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        access_type: 'offline',
        response_type: 'code',
        prompt: 'consent',
        scope: 'email profile'
    };

    const queryString = new URLSearchParams(options).toString();
    res.redirect(`${rootUrl}?${queryString}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    const clientUrl = process.env.CLIENT_URL || 'https://arenax-cyan.vercel.app';

    if (!code) {
        return res.redirect(`${clientUrl}/login?error=no_code_provided`);
    }

    try {
        const { usersCollection } = req.dbCollections;

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.GOOGLE_CALLBACK_URL,
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            throw new Error(tokenData.error_description || 'Failed to exchange code');
        }

        const { access_token } = tokenData;

        const profileResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`);
        const profile = await profileResponse.json();

        const emailAddress = profile.email.toLowerCase().trim();

        let user = await usersCollection.findOne({ email: emailAddress });

        if (!user) {
            const newUser = {
                name: profile.name,
                email: emailAddress,
                image: profile.picture || "",
                role: "user",
                createdAt: new Date()
            };
            const result = await usersCollection.insertOne(newUser);
            user = { _id: result.insertedId, ...newUser };
        }

        const token = jwt.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        const successUrl = process.env.CLIENT_SUCCESS_URL || `${clientUrl}/all-facilities`;
        res.redirect(successUrl);

    } catch (err) {
        console.error("Google OAuth Error:", err);
        res.redirect(`${clientUrl}/login?error=authentication_failed`);
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.json({ success: true, message: "Logged out successfully" });
});

// Check current user
app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.json({ success: false, user: null });

    try {
        const { usersCollection } = req.dbCollections;
        jwt.verify(token, jwtSecret, async (err, decoded) => {
            if (err) return res.json({ success: false, user: null });
            
            const user = await usersCollection.findOne(
                { _id: new ObjectId(decoded.id) }, 
                { projection: { password: 0 } }
            );
            res.json({ success: true, user });
        });
    } catch (error) {
        res.json({ success: false, user: null });
    }
});

// ====================== FACILITIES ROUTES ======================
app.get('/api/facilities', async (req, res) => {
    try {
        const { facilitiesCollection } = req.dbCollections;
        const result = await facilitiesCollection.find().toArray();
        res.send(result);
    } catch (err) {
        res.status(500).json({ message: "Failed to load facilities data." });
    }
});

app.post('/api/facilities', verifyToken, async (req, res) => {
    try {
        const { facilitiesCollection } = req.dbCollections;
        const { name, facility_type, location, price_per_hour, capacity, description, image } = req.body;
        
        const newFacility = {
            name,
            facility_type,
            location,
            price_per_hour: parseFloat(price_per_hour) || 0,
            capacity: parseInt(capacity, 10) || 0,
            description,
            image,
            owner_email: req.user.email, 
            createdAt: new Date()
        };

        const result = await facilitiesCollection.insertOne(newFacility);
        res.status(201).json({ success: true, message: "Facility added successfully!", facilityId: result.insertedId });
    } catch (err) {
        res.status(500).json({ message: "Server encountered an error creating the facility listing." });
    }
});

app.get('/api/facility/:id', async (req, res) => {
    try {
        const { facilitiesCollection } = req.dbCollections;
        const { id } = req.params;
        if (!id || id.length < 12) return res.status(400).json({ message: "Invalid ID format specified." });
        
        let query = ObjectId.isValid(id) ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] } : { _id: id };
        const facility = await facilitiesCollection.findOne(query);
        if (!facility) return res.status(404).json({ message: "Facility venue could not be found." });
        
        res.json(facility);
    } catch (err) {
        res.status(500).json({ message: "Internal Server Error exploring facility details." });
    }
});

app.put('/api/facility/:id', verifyToken, async (req, res) => {
    try {
        const { facilitiesCollection } = req.dbCollections;
        const { id } = req.params;
        const { name, facility_type, location, price_per_hour, capacity, description, image } = req.body;

        let query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const updatedData = {
            name, facility_type, location,
            price_per_hour: parseFloat(price_per_hour) || 0,
            capacity: parseInt(capacity, 10) || 0,
            description, image, updatedAt: new Date()
        };

        await facilitiesCollection.updateOne(query, { $set: updatedData });
        res.json({ success: true, message: "Facility details saved successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Server encountered an error saving updates." });
    }
});

app.delete('/api/facilities/:id', verifyToken, async (req, res) => {
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

app.get('/api/my-facilities', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { facilitiesCollection } = req.dbCollections;
        jwt.verify(token, jwtSecret, async (err, decoded) => {
            if (err) return res.status(401).json({ message: "Unauthorized" });
            const result = await facilitiesCollection.find({ owner_email: decoded.email }).toArray();
            res.json(result);
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to access user details." });
    }
});

// ====================== BOOKINGS ROUTES ======================
app.post(['/api/booking', '/api/bookings'], verifyToken, async (req, res) => {
    try {
        const { facilitiesCollection, bookingsCollection } = req.dbCollections;
        
        const facility_id = req.body.facilityId || req.body.facility_id;
        const booking_date = req.body.date || req.body.booking_date;
        const time_slot = req.body.slot || req.body.time_slot;
        const total_price = req.body.totalBill || req.body.total_price;
        const facility_name = req.body.facility_name;
        const hours = req.body.hours || 2; 

        if (!facility_id || !booking_date || !time_slot) {
            return res.status(400).json({ message: "Missing required booking payload items." });
        }

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
        res.status(201).json({ success: true, message: "Reservation logged successfully!", bookingId: result.insertedId });
    } catch (err) {
        res.status(500).json({ message: "Server encountered an error saving reservation." });
    }
});

app.get('/api/my-bookings', verifyToken, async (req, res) => {
    try {
        const { bookingsCollection } = req.dbCollections;
        const userBookings = await bookingsCollection.find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
        res.json(userBookings);
    } catch (err) {
        res.status(500).json({ message: "Could not fetch user reservations." });
    }
});

app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
    try {
        const { bookingsCollection } = req.dbCollections;
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid booking ID template." });

        const targetBooking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
        if (!targetBooking) return res.status(404).json({ message: "Booking record could not be found." });
        if (targetBooking.userEmail !== req.user.email) return res.status(403).json({ message: "Forbidden." });

        await bookingsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "CANCELLED" } });
        res.json({ success: true, message: "Reservation cancelled successfully." });
    } catch (err) {
        res.status(500).json({ message: "Server error executing cancellation requests." });
    }
});

// Root Route
app.get('/', (req, res) => {
    res.status(200).json({ status: "healthy", service: "ArenaX Live Engine" });
});

// Start Server (for local development)
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

module.exports = app;