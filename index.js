const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;
const SECRET_KEY = "your_secret_key"; // Change this in production

// Middleware
app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));

// Multer Storage and File Upload Setup
const storage = multer.diskStorage({
    destination: "./uploads/",
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Only images (JPEG, PNG, GIF) are allowed"));
        }
        cb(null, true);
    },
});

// Connect to SQLite Database
const db = new sqlite3.Database("database.sqlite", (err) => {
    if (err) console.error("Error connecting to database:", err.message);
    else console.log("Connected to SQLite database");
});

// Middleware to Verify JWT Token
const authenticateToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token" });
        req.user = user;
        next();
    });
};

// REGISTER User
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "User registered successfully", user_id: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: "Error registering user" });
    }
});

// LOGIN User
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ user_id: user.id, name: user.name, email: user.email }, SECRET_KEY, { expiresIn: "1h" });
        res.json({ message: "Login successful", token });
    });
});

// LOGOUT User (Token Blacklist - Optional)
app.post("/logout", (req, res) => {
    res.json({ message: "Logout successful. Token invalidation not needed on the server side." });
});

// GET Listings with Filters, Sorting, and Pagination
app.get("/listings", (req, res) => {
    let { location, min_price, max_price, sort_by, order, page, limit } = req.query;

    let query = "SELECT * FROM listings WHERE 1=1";
    let params = [];

    // Filtering
    if (location) {
        query += " AND location = ?";
        params.push(location);
    }
    if (min_price) {
        query += " AND price >= ?";
        params.push(parseFloat(min_price));
    }
    if (max_price) {
        query += " AND price <= ?";
        params.push(parseFloat(max_price));
    }

    // Sorting
    const validSortColumns = ["price", "id", "title"];
    const validOrder = ["ASC", "DESC"];

    if (sort_by && validSortColumns.includes(sort_by)) {
        query += ` ORDER BY ${sort_by}`;
        query += validOrder.includes(order?.toUpperCase()) ? ` ${order.toUpperCase()}` : " ASC";
    }

    // Pagination
    limit = parseInt(limit) || 10;
    page = parseInt(page) || 1;
    const offset = (page - 1) * limit;

    let countQuery = "SELECT COUNT(*) AS total FROM listings WHERE 1=1";
    db.get(countQuery, params, (err, countResult) => {
        if (err) return res.status(500).json({ error: "Failed to retrieve count" });

        query += " LIMIT ? OFFSET ?";
        params.push(limit, offset);

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                total_results: countResult.total,
                total_pages: Math.ceil(countResult.total / limit),
                current_page: page,
                limit,
                listings: rows,
            });
        });
    });
});

// GET a single listing by ID
app.get("/listings/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM listings WHERE id = ?", [id], (err, listing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!listing) return res.status(404).json({ error: "Listing not found" });

        res.json(listing);
    });
});

// CREATE Listing (Authenticated)
app.post("/listings", authenticateToken, upload.single("image"), (req, res) => {
    const { title, description, location, price } = req.body;
    const owner_id = req.user.user_id;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !location || !price) return res.status(400).json({ error: "Missing required fields" });

    db.run(
        "INSERT INTO listings (title, description, location, price, owner_id, image) VALUES (?, ?, ?, ?, ?, ?)",
        [title, description, location, price, owner_id, imageUrl],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, image: imageUrl });
        }
    );
});

// DELETE Listing (Authenticated)
app.delete("/listings/:id", authenticateToken, (req, res) => {
    const { id } = req.params;
    const owner_id = req.user.user_id;

    db.get("SELECT owner_id FROM listings WHERE id = ?", [id], (err, listing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!listing) return res.status(404).json({ error: "Listing not found" });
        if (listing.owner_id !== owner_id) return res.status(403).json({ error: "Unauthorized" });

        db.run("DELETE FROM listings WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Listing deleted successfully" });
        });
    });
});

// Start the Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
