const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("database.sqlite", (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to SQLite database");
    }
});

// Enable foreign key constraints
db.run("PRAGMA foreign_keys = ON;", (err) => {
    if (err) console.error("Error enabling foreign keys:", err.message);
});

// Create users table
db.run(
    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )`,
    (err) => {
        if (err) console.error("Error creating users table:", err.message);
        else console.log("✅ Users table created");
    }
);

// Create listings table
db.run(
    `CREATE TABLE IF NOT EXISTS listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT NOT NULL,
        price REAL NOT NULL,
        owner_id INTEGER NOT NULL,
        image TEXT,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    (err) => {
        if (err) console.error("Error creating listings table:", err.message);
        else console.log("✅ Listings table created");
    }
);

// Close the database connection
db.close((err) => {
    if (err) {
        console.error("Error closing the database:", err.message);
    } else {
        console.log("Database connection closed.");
    }
});
