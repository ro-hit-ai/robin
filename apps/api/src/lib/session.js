// apps/api/src/lib/session.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

// ✅ Use a single JWT secret everywhere
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// ✅ Helper: normalize token from Authorization header
function extractToken(authHeader) {
  if (!authHeader) return null;
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
}

// ✅ Core checkSession: verifies token & returns user data
async function checkSession(req) {
  try {
    const token = extractToken(req.headers.authorization);
    console.log("🔍 checkSession → token:", token);

    if (!token) {
      console.log("❌ checkSession → No token provided");
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("✅ checkSession → decoded JWT:", decoded);

    const userId = decoded.userId;
    if (!userId) {
      console.log("❌ No userId in token");
      return null;
    }

    // Optional session check (non-blocking)
    const session = await Session.findOne({
      sessionToken: token,
      userId,
      expires: { $gt: new Date() }
    }).lean();
    console.log("🔍 Session query result:", session);

    const user = await User.findById(userId).select('isAdmin email').lean();
    if (!user) {
      console.log("❌ No user found in DB");
      return null;
    }

    const userData = {
      _id: user._id,
      id: user._id,
      email: user.email,
      isAdmin: user.isAdmin || false // Ensure isAdmin is always present
    };

    console.log("✅ checkSession → user attached:", userData);
    return userData;
  } catch (err) {
    console.error("❌ checkSession error:", err.message);
    return null;
  }
}

// ✅ Middleware: attach user to req.user (non-blocking)
async function attachUser(req, res, next) {
  req.user = null;

  try {
    const token = extractToken(req.headers.authorization);
    if (!token) return next();

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.warn("❌ attachUser → Invalid token:", err.message);
      return next();
    }

    if (!decoded.userId) return next();

    const user = await User.findById(decoded.userId).select('isAdmin email').lean();
    if (!user) return next();

    req.user = user;
    console.log(`✅ attachUser → user attached: ${user.email}`);
  } catch (err) {
    console.error("❌ attachUser → Unexpected error:", err);
  }

  next();
}

// ✅ Middleware: enforce JWT auth
async function requireAuthJWT(req, res, next) {
  console.log("🔑 requireAuthJWT → Auth Header:", req.headers.authorization);

  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("❌ requireAuthJWT → Invalid token:", err.message);
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const user = await User.findById(decoded.userId).select('isAdmin');
    if (!user) {
      console.warn("❌ requireAuthJWT → User not found");
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    req.user = user;
    console.log(`✅ requireAuthJWT → User authorized: ${user.email}`);
    next();
  } catch (err) {
    console.error("❌ requireAuthJWT → Unexpected error:", err);
    return res.status(401).json({ message: "Unauthorized", success: false });
  }
}

module.exports = {
  checkSession,
  attachUser,
  requireAuthJWT
};