// apps/api/src/lib/sessionStore.js
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

async function createSession(userId, userAgent, ipAddress) {
  try {
    if (!JWT_SECRET) {
      console.log('❌ createSession: JWT_SECRET not configured');
      throw new Error('JWT secret not configured');
    }

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log('✅ createSession → Generated JWT:', token);

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const session = new Session({
      userId,
      sessionToken: token,
      expires,
      userAgent,
      ipAddress,
      createdAt: new Date(),
    });

    console.log('📝 createSession → Saving session:', { userId, sessionToken: token, expires });
    await session.save();
    console.log('✅ createSession → Session saved successfully');

    const savedSession = await Session.findOne({ sessionToken: token });
    console.log('🔍 createSession → Saved session found:', !!savedSession);

    return token;
  } catch (err) {
    console.error('❌ createSession error:', err.message, err);
    throw err;
  }
}

async function deleteSession(sessionToken) {
  try {
    console.log('🗑️ deleteSession → Deleting session:', sessionToken);
    const result = await Session.deleteOne({ sessionToken });
    console.log('✅ deleteSession → Result:', result);
  } catch (err) {
    console.error('❌ deleteSession error:', err.message, err);
    throw err;
  }
}

async function deleteAllUserSessions(userId) {
  try {
    console.log('🗑️ deleteAllUserSessions → Deleting all sessions for user:', userId);
    const result = await Session.deleteMany({ userId });
    console.log('✅ deleteAllUserSessions → Result:', result);
  } catch (err) {
    console.error('❌ deleteAllUserSessions error:', err.message, err);
    throw err;
  }
}

async function getUserSessions(userId) {
  try {
    console.log('🔍 getUserSessions → Fetching sessions for user:', userId);
    const sessions = await Session.find({ userId }).sort({ createdAt: -1 }).lean();
    console.log('✅ getUserSessions → Found sessions:', sessions.length);
    return sessions;
  } catch (err) {
    console.error('❌ getUserSessions error:', err.message, err);
    throw err;
  }
}

module.exports = {
  createSession,
  deleteSession,
  deleteAllUserSessions,
  getUserSessions,
};