// require("dotenv").config();
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");
const mongoose = require("mongoose");
const User = require("./models/User");
const { attachUser } = require('./lib/session');
// Custom imports
const { track } = require("./lib/hog");
const { getEmails } = require("./lib/imap");
const { checkToken } = require("./lib/jwt");
const { registerRoutes } = require("./routes"); // combined routes

// Ensure logs file exists
const logFilePath = "./logs.log";
if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "");
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Initialize Express
const app = express();

const allowedOrigins = [
  "http://localhost:5173", // Vite dev server
  "http://127.0.0.1:5173" // Sometimes vite uses 127.0.0.1
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like curl or Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true
}));

app.use(express.json());
// app.use(multer().any());
app.use(attachUser);

// Updated JWT middleware with improved exclusion logic
app.use((req, res, next) => {
  const excludedPaths = [
    // AUTH
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/user/register/external",
    "/api/v1/auth/password-reset",
    "/api/v1/auth/password-reset/code",
    "/api/v1/auth/password-reset/password",
    "/api/v1/auth/check",
    "/api/v1/auth/oidc/callback",
    "/api/v1/auth/oauth/callback",
    "/api/v1/auth/user/:id",
    "/api/v1/auth/user/all",
    "/api/v1/auth/profile",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/admin/reset-password",
    "/api/v1/auth/profile/notifcations/emails",
    "/api/v1/auth/user/:id/logout",
    "/api/v1/auth/:id/first-login",

    // IMAP
    "/api/v1/imap/emails",
    "/api/v1/imap/fetch-emails",
    "/api/v1/imap/emails/:id",
    "/api/v1/imap/emails/move",
    "/api/v1/imap/emails/:id/move",

    // TICKETS (including the specific route causing issues)
    "/api/v1/ticket/create",
    "/api/v1/ticket/public/create",
    "/api/v1/ticket/:id",
    "/api/v1/ticket/tickets/open",
    "/api/v1/ticket/tickets/search",
    "/api/v1/ticket/tickets/all",
    "/api/v1/ticket/tickets/user/open",
    "/api/v1/ticket/tickets/completed",
    "/api/v1/ticket/tickets/unassigned",
    "/api/v1/ticket/ticket/update",
    "/api/v1/ticket/ticket/transfer",
    "/api/v1/ticket/transfer/client",
    "/api/v1/ticket/comment",
    "/api/v1/ticket/comment/delete",
    "/api/v1/ticket/status/update",
    "/api/v1/ticket/status/hide",
    "/api/v1/ticket/status/lock",
    "/api/v1/ticket/delete",
    "/api/v1/ticket/tickets/templates",
    "/api/v1/ticket/template/:id",
    "/api/v1/ticket/user/open/external",
    "/api/v1/ticket/user/closed/external",
    "/api/v1/ticket/subscribe/:id",
    "/api/v1/ticket/unsubscribe/:id",
    "/api/v1/ticket/data/tickets/summary",
    "/api/v1/ticket/list/open",
    "/api/v1/ticket/tickets/list/closed",
    "/api/v1/ticket/tickets/list/assigned/:userId",

    // CLIENTS
    "/api/v1/client/create",
    "/api/v1/client/update",
    "/api/v1/client/all",
    "/api/v1/client/:id/delete-client",

    // ROLES
    "/api/v1/role/create",
    "/api/v1/role/all",
    "/api/v1/role/:id",
    "/api/v1/role/:id/update",
    "/api/v1/role/:id/delete",
    "/api/v1/role/assign",
    "/api/v1/role/remove",

    // QUEUE
    "/api/v1/email-queue/create",
    "/api/v1/email-queue/oauth",
    "/api/v1/email-queue/all",
    "/api/v1/email-queue/generate-oauth-url/:mailboxId",
    "/auth/gmail/url?mailboxId",

    // SMTP.SERVICE
    "/api/v1/smtp/tickets/:id/reply",
    "/api/v1/smtp/send-email",

    // CONFIG
    "/api/v1/config/check",
    "/api/v1/config/oidc/update",
    "/api/v1/config/oauth/update",
    "/api/v1/config/delete",
    "/api/v1/config/email",
    "/api/v1/config/email/oauth/gmail?code=<GOOGLE_OAUTH_CODE>",
    "/api/v1/config/toggle-roles",

    // STORAGE
    "/api/v1/storage/ticket/:id/upload/single",
    "/api/v1/storage/ticket/:id/files",
    "/api/v1/storage/file/:fileId/delete",
    "/api/v1/storage/file/:fileId/download",
    "/api/v1/storage/file/:fileId/info",

    // DATA
    "/api/v1/data/tickets/all",
    "/api/v1/data/tickets/completed",
    "/api/v1/data/tickets/open",
    "/api/v1/data/tickets/unassigned",
    "/api/v1/data/logs",

    // TIME TRACKING
    "/api/v1/time/new",
    "/api/v1/time",
    "/api/v1/time/:id",

    // USERS
    "/api/v1/user/all",
    "/api/v1/user/new",
    "/api/v1/user/reset-password",

    "/api/v1/email/send-assigned",
    "/api/v1/email/config",
    "/api/v1/email/templates",
    "/api/v1/email/template/:type",
    "/api/v1/email/send-comment",

    "/api/v1/webhook/create",
    "/api/v1/webhook/all"
  ];

  const cleanPath = req.path.replace(/\/+$/, ""); // remove trailing slash

  // Improved exclusion logic
  const isExcluded = excludedPaths.some(path => {
    if (!path.includes(":")) {
      // Exact match for static paths
      return cleanPath === path;
    }
    // Regex for dynamic paths
    const pattern = path.replace(/:[^/]+/g, "([^/]+)");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(cleanPath);
  });

  // Debug logging
  console.log(`🔍 Checking path: ${cleanPath}, Is Excluded: ${isExcluded}, Authorization: ${req.headers.authorization || 'None'}`);

  if (isExcluded) {
    return next();
  }

  try {
    const bearer = req.headers.authorization?.split(" ")[1];
    if (!bearer) {
      console.log(`❌ No token provided for path: ${cleanPath}`);
      throw new Error("No token provided");
    }
    checkToken(bearer);
    next();
  } catch (err) {
    console.error(`❌ Authentication error for ${cleanPath}: ${err.message}`);
    return res.status(401).json({ message: "Unauthorized", success: false });
  }
});

// Register all routes
registerRoutes(app);

// Health check
app.get("/", (req, res) => res.json({ healthy: true }));

// Seed admin user (commented out)
// async function seedAdmin() {
//   try {
//     await User.deleteOne({ email: "admin@gmail.com" });
//     const hashedPassword = await bcrypt.hash("123456", 10);
//     const admin = new User({ email: "admin@gmail.com", password: hashedPassword, name: "Admin User", isAdmin: true, role: "admin" });
//     await admin.save();
//     console.log("✅ Admin user reseeded: admin@gmail.com / 123456");
//   } catch (err) {
//     console.error("❌ Failed to seed admin:", err);
//   }
// }

// Start server function
async function start() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/pp", {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log("✅ Connected to MongoDB");
    } else {
      console.log("ℹ️ MongoDB already connected");
    }

    // await seedAdmin();

    const port = process.env.PORT || 5004;
    app.listen(port, () => {
      console.log(`🚀 Server listening on port ${port}`);
      const client = track();
      client.capture({ event: "server_started", distinctId: "uuid" });
      client.shutdownAsync();
      setInterval(() => getEmails(), 10000);
    });
  } catch (err) {
    console.error("❌ Server startup failed:", err);
    process.exit(1);
  }
}

start();