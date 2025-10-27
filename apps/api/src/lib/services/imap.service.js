const express = require('express');
const EmailReplyParser = require('email-reply-parser');
const ImapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const AuthService = require('./authService');
const EmailQueue = require('../../models/EmailQueue');
const Ticket = require('../../models/Ticket');
const Comment = require('../../models/Comment');
const Counter = require('../../models/Counter');
const EmailMessage = require('../../models/EmailMessage');
const router = express.Router();

// ------------------ Helper Functions ------------------
function getReplyText(email) {
  const parsed = new EmailReplyParser().read(email.text);
  return parsed.getFragments()
    .filter(f => !f._isHidden && !f._isSignature && !f._isQuoted)
    .map(f => f._content)
    .join('\n');
}

// Simple hash for duplicate detection (32-bit int)
function getEmailHash(parsed) {
  const text = (parsed.text || '') + (parsed.html || '') + (parsed.messageId || '');
  let hash = 0, i, chr;
  for (i = 0; i < text.length; i++) {
    chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}


async function sendAutoReply(toEmail, ticketNumber) {
  console.log(`🚀 Attempting to send auto-reply to: ${toEmail} for ticket: ${ticketNumber}`);
  
  try {
    // Get active queues, sorted by priority
    const queues = await EmailQueue.findActiveQueues();
    console.log(`📧 Found ${queues.length} email queues`);
    
    if (queues.length === 0) {
      console.warn('No email queues found for sending auto-reply');
      return;
    }

    // Select the highest-priority queue
    const queue = queues[0];
    console.log(`📧 Using queue: ${queue.username} (${queue.serviceType})`);
    
    // Check rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const emailsSent = await EmailMessage.countDocuments({
      from: queue.username,
      date: { $gte: oneHourAgo }
    });
    if (emailsSent >= queue.maxEmailsPerHour) {
      console.warn(`Rate limit exceeded for queue ${queue.username}`);
      await queue.updateHealth('degraded', new Error('Rate limit exceeded'));
      return;
    }

    const nodemailer = require('nodemailer');
    let transporter;
    if (queue.serviceType === 'gmail') {
      console.log(`🔐 Getting access token for Gmail...`);
      const accessToken = await AuthService.getValidAccessToken(queue);
      console.log(`✅ Access token obtained`);
      
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: queue.username,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: queue.refreshToken,
          accessToken: accessToken,
        },
      });
    } else {
      console.log(`📨 Setting up SMTP transport...`);
      transporter = nodemailer.createTransport({
        host: queue.hostname,
        port: queue.smtpPort,
        secure: queue.smtpPort === 465,
        auth: {
          user: queue.username,
          pass: queue.password,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
    }

    const mailOptions = {
      from: `"Support Team" <${queue.username}>`,
      to: toEmail,
      subject: `Re: [TKT-${ticketNumber}] Thank you for contacting us`,
      text: `Dear Customer,\n\nThank you for contacting our support team. We have received your request and created ticket ${ticketNumber}.\n\nOur team will review your request and get back to you as soon as possible.\n\nBest regards,\nSupport Team\n\n---\nThis is an automated reply. Please do not reply to this email.`,
      html: `<p>Dear Customer,</p><p>Thank you for contacting our support team. We have received your request and created ticket <strong>${ticketNumber}</strong>.</p><p>Our team will review your request and get back to you as soon as possible.</p><p>Best regards,<br>Support Team</p><hr><p><em>This is an automated reply. Please do not reply to this email.</em></p>`,
    };

    console.log(`📤 Sending email...`);
    await transporter.sendMail(mailOptions);
    console.log(`📧 Auto-reply successfully sent to ${toEmail}`);
    await queue.updateHealth('healthy');
  } catch (error) {
    console.error('❌ Error sending auto-reply:', error);
    await queue.updateHealth('failed', error);
    throw error;
  }
}

// Save email to DB
async function saveEmail(parsed, mailboxId, folder) {
  const exists = await EmailMessage.findOne({ messageId: parsed.messageId });
   if (exists) {
    // Update existing email if not analyzed
    await EmailMessage.updateOne(
      { messageId: parsed.messageId, sentiment_analyzed: { $ne: true } },
      { 
        $set: { 
          priority: 'pending',
          sentiment_analyzed: false
        } 
      }
    );
    console.log(`📁 Existing email updated to pending priority: ${parsed.subject}`);
    return;
  }

  const emailDoc = new EmailMessage({
    mailbox: mailboxId,
    messageId: parsed.messageId,
    folder,
    subject: parsed.subject || '(No subject)',
    body: parsed.text || parsed.html || '',
    from: parsed.from?.text,
    to: parsed.to?.value?.map(a => a.address) || [],
    cc: parsed.cc?.value?.map(a => a.address) || [],
    bcc: parsed.bcc?.value?.map(a => a.address) || [],
    date: parsed.date || new Date(),
    isRead: false,
    priority: 'pending',
    sentiment_analyzed: false,
    attachments: parsed.attachments?.map(att => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    })),
  });

  await emailDoc.save();
  console.log(`💾 New email saved with pending priority: ${parsed.subject}`);
}

// Determine priority
function determinePriority(subject, body) {
  // const text = (subject + ' ' + body).toLowerCase();
  // if (/urgent|critical|down/.test(text)) return 'critical';
  // if (/slow|error|issue/.test(text)) return 'medium';
  return 'pending';
}


// ------------------ IMAP Service ------------------
class ImapService {

  static async getImapConfig(queue) {
    if (queue.serviceType === "gmail") {
      const accessToken = await AuthService.getValidAccessToken(queue);
      const xoauth2 = Buffer.from(
        `user=${queue.username}\u0001auth=Bearer ${accessToken}\u0001\u0001`
      ).toString("base64");

      return {
        user: queue.username,
        xoauth2,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        authTimeout: 30000,
        tlsOptions: { rejectUnauthorized: false },
      };
    } else {
      return {
        user: queue.username,
        password: queue.password,
        // host: queue.hostname || "mail.grssl.net",
        port: queue.imapPort,
         tls: queue.tls === true,
        authTimeout: 30000,
        tlsOptions: { rejectUnauthorized: false, servername: queue.hostname },
      };
    }
  }



    // Add this method to the ImapService class if it's not already there
static async ensureFolderExists(connection, folderName) {
  try {
    // Try to open the folder first to see if it exists
    await connection.openBox(folderName);
    console.log(`📁 Folder "${folderName}" already exists`);
    return true;
  } catch (err) {
    console.log(`📁 Folder "${folderName}" does not exist, attempting to create...`);
    
    if (err.message.includes('does not exist') || 
        err.message.includes('No such mailbox') || 
        err.message.includes('NO') ||
        err.message.includes('Failure')) {
      
      try {
        // Create the folder
        await connection.addBox(folderName);
        console.log(`📁 Successfully created folder "${folderName}"`);
        
        // Verify it was created by trying to open it
        await connection.openBox(folderName);
        return true;
      } catch (createErr) {
        console.error(`❌ Failed to create folder "${folderName}":`, createErr.message);
        return false;
      }
    } else {
      // Re-throw other errors (like connection issues)
      console.error(`❌ Error checking folder "${folderName}":`, err.message);
      throw err;
    }
  }
}
  // ------------------ Gmail-Specific Folder Handling ------------------
static async handleGmailProcessedFolder(connection, queue, uid) {
  if (queue.serviceType !== 'gmail') return false;
  
  try {
    // For Gmail, use the [Gmail]/All Mail label or create a custom label
    // Instead of moving, we'll just mark it as processed in the database
    console.log(`🏷️ Gmail email processed (kept in All Mail): UID ${uid}`);
    return true;
  } catch (err) {
    console.error(`❌ Gmail processing error:`, err.message);
    return false;
  }
}

// Updated fetchFolderMails with Gmail handling
static async fetchFolderMails(connection, queue, folderName, mailboxId) {
  const retry = require('async-retry');

  try {
    await retry(
      async () => {
        await connection.openBox(folderName);
        const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchCriteria = [['SINCE', sinceDate], 'UNSEEN'];
        const fetchOptions = { bodies: [''], markSeen: true };

        const results = await connection.search(searchCriteria, fetchOptions);

        for (const res of results) {
          const raw = res.parts[0].body;
          const parsed = await simpleParser(raw);

          await ImapService.processEmail(parsed, mailboxId, queue);

          await EmailMessage.updateOne(
            { messageId: parsed.messageId },
            { folder: 'processed', isRead: true }
          );

          let movedSuccessfully = false;
          if (queue.serviceType === 'gmail') {
            movedSuccessfully = await ImapService.handleGmailProcessedFolder(connection, queue, res.attributes.uid);
          } else {
            const folderCreated = await ImapService.ensureFolderExists(connection, 'Processed');
            if (folderCreated) {
              await connection.moveMessage(res.attributes.uid, 'Processed');
              console.log(`📦 Email moved to Processed: ${parsed.subject}`);
              movedSuccessfully = true;
            }
          }

          if (movedSuccessfully) {
            console.log(`✅ Email fully processed: ${parsed.subject}`);
          }
        }

        console.log(`✅ Synced ${folderName} mails`);
      },
      {
        retries: 2,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (err) => console.warn(`Retrying ${folderName} sync: ${err.message}`)
      }
    );
    await queue.updateHealth('healthy');
  } catch (err) {
    console.error(`❌ Error syncing ${folderName}:`, err.message);
    await queue.updateHealth('failed', err);
  }
}
  // ------------------ Process Email ------------------
// ------------------ Process Email (COMPLETE VERSION) ------------------
static async processEmail(parsed, mailboxId, queue) {
  try {
    const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
    const toEmails = (parsed.to?.value || []).map(a => a.address?.toLowerCase()).filter(Boolean);
    const folder = fromEmail === queue.username
      ? 'sent'
      : toEmails.includes(queue.username)
      ? 'inbox'
      : 'internal';

    console.log(`📨 Processing email from: ${fromEmail} | Subject: ${parsed.subject || 'No Subject'}`);

    // ✅ STEP 1: Save email FIRST and get its ID
    await saveEmail(parsed, mailboxId, folder);
    
    // ✅ STEP 2: Find the saved email to link to ticket
    const savedEmail = await EmailMessage.findOne({ messageId: parsed.messageId });
    if (!savedEmail) {
      console.error(`❌ Could not find saved email for ${parsed.subject}`);
      return;
    }
    
    console.log(`🔗 Saved email ID: ${savedEmail._id} | Priority: '${savedEmail.priority}' | Analyzed: ${savedEmail.sentiment_analyzed}`);

    if (folder === 'internal' || fromEmail === queue.username) {
      console.log(`⏭️ Skipping internal/sent email processing`);
      return;
    }

    const defaultUserId = process.env.DEFAULT_USER_ID;
    if (!defaultUserId) {
      console.warn('⚠️ DEFAULT_USER_ID not set. Skipping ticket creation.');
      return;
    }

    const isReply = /^(re|ref):/i.test(parsed.subject || '');
    const cleanSubject = (parsed.subject || '').replace(/^(re|ref):\s*/i, '').trim();

    let ticket = null;

    // ----- Handle Reply -----
    if (isReply) {
      console.log(`💬 Detected reply: ${parsed.subject}`);
      
      // Find ticket by ticket number in subject
      const ticketNumberMatch = (parsed.subject || '').match(/\[?TKT-\d{6}\]?/i);
      if (ticketNumberMatch?.[0]) {
        ticket = await Ticket.findOne({ number: ticketNumberMatch[0].replace(/\[|\]/g, '') });
        console.log(`🎫 Found ticket by number: ${ticket?.number}`);
      }

      // Fallback: match by sender + subject
      if (!ticket) {
        ticket = await Ticket.findOne({ email: fromEmail, title: cleanSubject });
        console.log(`🎫 Found ticket by email+subject: ${ticket?.number}`);
      }

      if (!ticket) {
        console.warn(`⚠️ Reply detected but ticket not found: ${parsed.subject}`);
        // Still mark email as processed
        await EmailMessage.updateOne(
          { messageId: parsed.messageId }, 
          { folder: 'processed', isRead: true }
        );
        return;
      }

      const replyText = getReplyText(parsed) || parsed.text || parsed.html || 'No Body';

      // Prevent duplicate comments
      const existingComment = await Comment.findOne({
        ticketId: ticket._id,
        replyEmail: fromEmail,
        text: replyText,
      });

      if (!existingComment) {
        await Comment.create({
          text: replyText,
          userId: defaultUserId,
          ticketId: ticket._id,
          reply: true,
          replyEmail: fromEmail,
          public: true,
        });
        console.log(`💬 Comment added to ${ticket.number}`);
      }

      // Link reply email to existing ticket
      await EmailMessage.updateOne(
        { _id: savedEmail._id },
        { $set: { ticketId: ticket._id } }
      );

      // Mark email as processed (replies don't need sentiment analysis)
      await EmailMessage.updateOne(
        { messageId: parsed.messageId }, 
        { 
          folder: 'processed', 
          isRead: true,
          priority: 'low', // Replies are typically low priority
          sentiment_analyzed: true,
          ticketId: ticket._id
        }
      );
      console.log(`✅ Reply processed for ticket ${ticket.number}`);
      return;
    }

    // ----- Handle Existing Ticket -----
    const existingTicket = await Ticket.findOne({ email: fromEmail, title: cleanSubject });

    if (existingTicket) {
      console.log(`🔄 Found existing ticket: ${existingTicket.number}`);
      
      const commentExists = await Comment.findOne({
        ticketId: existingTicket._id,
        replyEmail: fromEmail,
        text: parsed.text || parsed.html,
      });

      if (!commentExists) {
        await Comment.create({
          text: parsed.text || parsed.html || 'No Body',
          userId: defaultUserId,
          ticketId: existingTicket._id,
          reply: true,
          replyEmail: fromEmail,
          public: true,
        });
        console.log(`💬 Follow-up comment added to ${existingTicket.number}`);
      }

      // Link email to existing ticket
      await EmailMessage.updateOne(
        { _id: savedEmail._id },
        { $set: { ticketId: existingTicket._id } }
      );

      // Mark email as processed
      await EmailMessage.updateOne(
        { messageId: parsed.messageId }, 
        { 
          folder: 'processed', 
          isRead: true,
          priority: 'low', // Follow-ups are typically low priority
          sentiment_analyzed: true,
          ticketId: existingTicket._id
        }
      );
      console.log(`✅ Follow-up processed for ticket ${existingTicket.number}`);
      return;
    }

    // ----- Create NEW Ticket -----
    console.log(`🎫 Creating new ticket for: ${cleanSubject}`);
    
    try {
      const priority = determinePriority(parsed.subject, parsed.text || parsed.html);
      console.log(`🎯 Ticket priority determined: '${priority}'`);

      ticket = new Ticket({
        email: fromEmail,
        name: parsed.from?.value?.[0]?.name || fromEmail,
        title: cleanSubject,
        detail: parsed.text || parsed.html || 'No body provided',
        type: 'support',
        isComplete: false,
        // ✅ CRITICAL: Set priority and analysis flag
        priority: priority, // 'pending'
        sentiment_analyzed: false,
        fromImap: true,
        createdBy: defaultUserId,
        // ✅ Link to the saved email
        emailId: savedEmail._id
      });

      // Generate ticket number
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'ticket' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      ticket.number = `TKT-${String(counter.seq).padStart(6, '0')}`;

      await ticket.save();
      console.log(`🎫 SUCCESS: Created ticket ${ticket.number} (priority: '${ticket.priority}', analyzed: ${ticket.sentiment_analyzed})`);

      // Update email to link back to ticket
      await EmailMessage.updateOne(
        { _id: savedEmail._id },
        { 
          $set: { 
            ticketId: ticket._id,
            priority: 'pending', // Ensure email stays pending
            sentiment_analyzed: false
          } 
        }
      );
      console.log(`🔗 Email ${savedEmail._id} linked to ticket ${ticket.number}`);

      // Auto-reply
      try {
        await sendAutoReply(fromEmail, ticket.number);
        console.log(`📧 Auto-reply sent for ${ticket.number}`);
      } catch (err) {
        console.error(`❌ Failed to send auto-reply for ${ticket.number}:`, err.message);
      }

      // Initial comment
      await Comment.create({
        text: parsed.text || parsed.html || 'No Body',
        userId: defaultUserId,
        ticketId: ticket._id,
        reply: true,
        replyEmail: fromEmail,
        public: true,
      });
      console.log(`💬 Initial comment added to ${ticket.number}`);

      // Move email to processed but KEEP priority as pending for Python
      await EmailMessage.updateOne(
        { messageId: parsed.messageId }, 
        { 
          folder: 'processed', 
          isRead: true,
          priority: 'pending', // ✅ Keep pending for Python analysis
          sentiment_analyzed: false
        }
      );
      console.log(`📁 Email moved to processed, pending Python analysis: ${parsed.subject}`);

    } catch (ticketError) {
      console.error(`❌ Ticket creation failed: ${ticketError.message}`);
      
      // Still mark email as processed even if ticket fails
      await EmailMessage.updateOne(
        { messageId: parsed.messageId }, 
        { folder: 'processed', isRead: true }
      );
    }
  } catch (error) {
    console.error(`❌ processEmail failed: ${error.message}`);
  }
}

  // ------------------ Fetch Folder Emails ------------------
 static async fetchFolderMails(connection, queue, folderName, mailboxId) {
  try {
    await connection.openBox(folderName);

    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
    const searchCriteria = [['SINCE', sinceDate], 'UNSEEN'];
    const fetchOptions = { bodies: [''], markSeen: true }; // ✅ mark as seen after fetch

    const results = await connection.search(searchCriteria, fetchOptions);

    for (const res of results) {
      const raw = res.parts[0].body;
      const parsed = await simpleParser(raw);

      // Process email into ticket/comments
      await ImapService.processEmail(parsed, mailboxId, queue);

      // ✅ Move to processed in DB
      await EmailMessage.updateOne(
        { messageId: parsed.messageId },
        { folder: 'processed', isRead: true }
      );

      // ✅ Ensure Processed folder exists BEFORE trying to move
      let folderCreated = false;
      try {
        // First, ensure the Processed folder exists
        folderCreated = await ImapService.ensureFolderExists(connection, 'Processed');
        
        if (folderCreated) {
          // Now try to move the email
          await connection.moveMessage(res.attributes.uid, 'Processed');
          console.log(`📦 Email moved to Processed: ${parsed.subject}`);
        } else {
          console.warn(`⚠️ Skipping server move - folder creation failed: ${parsed.subject}`);
        }
      } catch (moveErr) {
        console.warn(`⚠️ Could not move email on IMAP: ${moveErr.message}`);
      }
    }

    console.log(`✅ Synced ${folderName} mails`);
  } catch (err) {
    console.error(`❌ Error syncing ${folderName}:`, err.message);
  }
}

  // ------------------ Main Fetch ------------------
  static async fetchEmails() {
  try {
    const queues = await EmailQueue.findActiveQueues();
    console.log(`📧 Processing ${queues.length} active queues`);

    // Process queues in parallel with a concurrency limit
    const { promisify } = require('util');
    const asyncPool = require('tiny-async-pool');

    const processQueue = async (queue) => {
      try {
        const imapConfig = await ImapService.getImapConfig(queue);
        const connection = await ImapSimple.connect({ imap: imapConfig });
        await ImapService.fetchFolderMails(connection, queue, 'INBOX', queue._id);
        connection.end();
        await queue.updateHealth('healthy');
      } catch (err) {
        console.error(`❌ IMAP fetch error for ${queue.username}:`, err.message);
        await queue.updateHealth('failed', err);
      }
    };

    // Limit to 3 concurrent connections to avoid overwhelming IMAP servers
    await asyncPool(3, queues, processQueue);
    console.log('✅ All queues processed');
  } catch (err) {
    console.error('❌ IMAP fetchEmails error:', err);
  }
}
}
// ------------------ Router Endpoints ------------------


// Add to your router in imap.service.js
router.get('/priority-stats', async (req, res) => {
  try {
    const stats = await EmailMessage.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const total = await EmailMessage.countDocuments();
    const pending = await EmailMessage.countDocuments({ 
      priority: 'pending', 
      sentiment_analyzed: { $ne: true } 
    });

    const summary = {
      totalEmails: total,
      pendingAnalysis: pending,
      distribution: stats,
      lastUpdated: new Date()
    };

    res.status(200).json({ 
      success: true, 
      data: summary 
    });
  } catch (error) {
    console.error('Error fetching priority stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch priority stats' 
    });
  }
});

router.post('/fetch-emails', async (req, res) => {
  try {
    ImapService.fetchEmails().catch(error => console.error('Background IMAP fetch error:', error));
    res.status(202).json({ message: 'IMAP email fetch started in background', success: true });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Get All Emails (Paginated) ------------------
router.get('/emails', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const emails = await EmailMessage.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await EmailMessage.countDocuments();

    res.status(200).json({ emails, total, page: parseInt(page), pages: Math.ceil(total / limit), success: true });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Get Single Email ------------------
router.get('/emails/:id', async (req, res) => {
  try {
    const email = await EmailMessage.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found', success: false });
    res.status(200).json({ email, success: true });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Move a Single Email ------------------
router.post('/emails/:id/move', async (req, res) => {
  try {
    const { folder } = req.body;
    if (!folder) return res.status(400).json({ message: 'Folder is required', success: false });

    const email = await EmailMessage.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found', success: false });

    email.folder = folder;
    await email.save();

    // Optional: sync with IMAP server
    // await ImapService.moveEmailOnServer(email.messageId, folder);

    res.status(200).json({ message: `Email moved to ${folder}`, success: true });
  } catch (err) {
    console.error('Error moving email:', err);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Move Multiple Emails ------------------
router.post('/emails/move', async (req, res) => {
  try {
    const { emailIds, folder } = req.body;
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return res.status(400).json({ message: 'No emails provided', success: false });
    }
    if (!folder) return res.status(400).json({ message: 'Folder is required', success: false });

    await EmailMessage.updateMany(
      { _id: { $in: emailIds } },
      { $set: { folder } }
    );

    // Optional: loop & update IMAP server
    // for (const id of emailIds) await ImapService.moveEmailOnServer(id, folder);

    res.status(200).json({ message: `Moved ${emailIds.length} emails to ${folder}`, success: true });
  } catch (err) {
    console.error('Error moving emails:', err);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Get Emails by Folder ------------------
router.get('/emails/folder/:folder', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    const { folder } = req.params;

    const allowedFolders = ["inbox", "sent", "received", "drafts", "trash", "resolved", "internal", "processed"];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ message: `Invalid folder: ${folder}`, success: false });
    }

    const emails = await EmailMessage.find({ folder })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await EmailMessage.countDocuments({ folder });

    res.status(200).json({
      emails,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      folder,
      success: true
    });
  } catch (error) {
    console.error(`❌ Error fetching emails for folder ${req.params.folder}:`, error);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Get Unseen Emails in Inbox ------------------
router.get('/emails/unseen', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const emails = await EmailMessage.find({
      folder: 'inbox',
      isRead: false
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await EmailMessage.countDocuments({
      folder: 'inbox',
      isRead: false
    });

    res.status(200).json({
      emails,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      success: true
    });
  } catch (error) {
    console.error('❌ Error fetching unseen emails:', error);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Mark Email as Read ------------------
router.post('/emails/:id/read', async (req, res) => {
  try {
    const email = await EmailMessage.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found', success: false });

    email.isRead = true;
    await email.save();

    res.status(200).json({ message: 'Email marked as read', success: true });
  } catch (err) {
    console.error('Error marking email as read:', err);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});

// ------------------ Mark Email as Unread ------------------
router.post('/emails/:id/unread', async (req, res) => {
  try {
    const email = await EmailMessage.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found', success: false });

    email.isRead = false;
    await email.save();

    res.status(200).json({ message: 'Email marked as unread', success: true });
  } catch (err) {
    console.error('Error marking email as unread:', err);
    res.status(500).json({ message: 'Internal Server Error', success: false });
  }
});  

// ------------------ Export ------------------
module.exports = {
  router,
  ImapService,
};
