require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { checkToken } = require('../lib/jwt');
const { track } = require('../lib/hog');
const { sendAssignedEmail } = require('../lib/nodemailer/ticket/email');
const { sendComment } = require('../lib/nodemailer/ticket/email');
// const { sendComment } = require('../lib/services/emailService');
const { sendTicketCreate } = require('../lib/nodemailer/ticket/email');
const { sendTicketStatus } = require('../lib/nodemailer/ticket/email');
const { assignedNotification } = require('../lib/services/notifications/notification');
const { commentNotification } = require('../lib/services/notifications/notification');
const { priorityNotification } = require('../lib/services/notifications/notification');
const { activeStatusNotification, statusUpdateNotification } = require('../lib/services/notifications/notification');
const { sendWebhookNotification } = require('../lib/services/notifications/webhook');
const { requirePermission } = require('../lib/roles');
const { checkSession } = require('../lib/session'); 
const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const TimeTracking = require('../models/TimeTracking');
const EmailTemplate = require('../models/EmailTemplate');
const Webhook = require('../models/Webhook');
const User = require('../models/User');
const Client = require('../models/Client');

const router = express.Router();

const validateEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
};

// Create ticket
router.post(
  "/create",
  // requirePermission(["issue::create"]),
  async (req, res) => {
    try {
      const {
        name,
        company,
        detail,
        title,
        priority,
        email,
        engineer,
        type,
        createdBy,
      } = req.body;

      const user = await checkSession(req);

      // const ticketData = {
      //   name,
      //   title,
      //   detail: JSON.stringify(detail),
      //   priority: priority ? priority : "low",
      //   email,
      //   type: type ? type.toLowerCase() : "support",
      //   // createdBy: createdBy ? {
      //   //   id: createdBy.id,
      //   //   name: createdBy.name,
      //   //   role: createdBy.role,
      //   //   email: createdBy.email,
      //   // } : undefined,
      //   fromImap: false,
      //   isComplete: false,
      // };

      // if (company) {
      //   ticketData.client = company.id || company;
      // }

      // if (engineer && engineer.name !== "Unassigned") {
      //   ticketData.assignedTo = engineer.id;
      // }

const ticketData = {
  name,
  title,
  detail: typeof detail === "object" ? JSON.stringify(detail) : detail,
  priority: priority || "low",
  email,
  type: type ? type.toLowerCase() : "support",
  createdBy: createdBy || user?._id, // session user or provided ID
  fromImap: false,
  isComplete: false,
  number: req.body.number
   };

if (company) {
  ticketData.client = company.id || company;
}

if (engineer && engineer !== "Unassigned") {
  ticketData.assignedTo = engineer.id || engineer;
}


      const ticket = await Ticket.create(ticketData);

      if (email && validateEmail(email)) {
        await sendTicketCreate(ticket);
      }

      if (engineer && engineer.name !== "Unassigned") {
        const assignedUser = await User.findById(ticket.assignedTo);
        if (assignedUser) {
          await sendAssignedEmail(assignedUser.email);
          await assignedNotification(engineer, ticket, user);
        }
      }

      const webhooks = await Webhook.find({ type: "ticket_created", active: true });
      for (const webhook of webhooks) {
        const message = {
          event: "ticket_created",
          id: ticket._id,
          title: ticket.title,
          priority: ticket.priority,
          email: ticket.email,
          name: ticket.name,
          type: ticket.type,
          createdBy: ticket.createdBy,
          assignedTo: ticket.assignedTo,
          client: ticket.client,
        };
        await sendWebhookNotification(webhook, message);
      }

      const hog = track();
      hog.capture({
        event: "ticket_created",
        distinctId: ticket._id.toString(),
      });

      res.status(200).send({
        message: "Ticket created correctly",
        success: true,
        id: ticket._id,
      });
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Public ticket creation
router.post(
  "/public/create",
  async (req, res) => {
    try {
      const {
        name,
        company,
        detail,
        title,
        priority,
        email,
        engineer,
        type,
        createdBy,
        number
      } = req.body;

       let creatorId = createdBy || null;

        // ✅ If no createdBy provided, create/find a Guest user
    if (!creatorId) {
      let guest = await User.findOne({ email: "guest@system.local" });
      if (!guest) {
        guest = await User.create({
          name: "Guest",
          email: "guest@system.local",
          password: "guest123", // hashed automatically if you have middleware
          role: "guest"
        });
      }
      creatorId = guest._id;
    }

  const ticketData = {
  name,
  title,
  detail: JSON.stringify(detail),
  priority: priority || "low",
  email,
  type: type ? type.toLowerCase() : "support",
  createdBy: createdBy || user?._id,
  fromImap: false,
  isComplete: false
    };

    if (company) {
      ticketData.client = company.id || company;
    }

   if (engineer && engineer !== "Unassigned") {
     ticketData.assignedTo = engineer.id || engineer;
    }


      const ticket = await Ticket.create(ticketData);

      if (email && validateEmail(email)) {
        await sendTicketCreate(ticket);
      }

      if (engineer && engineer.name !== "Unassigned") {
        const assignedUser = await User.findById(ticket.assignedTo);
        if (assignedUser) {
          await sendAssignedEmail(assignedUser.email);
          const user = await checkSession(req);
          await assignedNotification(engineer, ticket, user);
        }
      }

      const webhooks = await Webhook.find({ type: "ticket_created", active: true });
      for (const webhook of webhooks) {
        const message = {
          event: "ticket_created",
          id: ticket._id,
          title: ticket.title,
          priority: ticket.priority,
          email: ticket.email,
          name: ticket.name,
          type: ticket.type,
          createdBy: ticket.createdBy,
          assignedTo: ticket.assignedTo,
          client: ticket.client,
        };
        await sendWebhookNotification(webhook, message);
      }

      const hog = track();
      hog.capture({
        event: "ticket_created",
        distinctId: ticket._id.toString(),
      });

      res.status(200).send({
        message: "Ticket created correctly",   
        success: true,
        id: ticket._id,
      });
    } catch (error) {
      console.error("Error creating public ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get ticket by IDx
router.get(
  "/:id",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const ticket = await Ticket.findById(id)
        .populate('client', 'id name number notes')
        .populate('assignedTo', 'id name');

      if (!ticket) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      const timeTracking = await TimeTracking.find({ ticketId: id })
        .populate('user', 'name');

      const comments = await Comment.find({ ticketId: id })
        .populate('user', 'name');

      const files = []; // Assuming you have a TicketFile model

      const result = {
        ...ticket.toObject(),
        comments,
        TimeTracking: timeTracking,
        files
      };

      res.send({
        ticket: result,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get all open tickets
router.get(
  "/tickets/open",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const tickets = await Ticket.find({ isComplete: false, hidden: false })
        .sort({ createdAt: -1 })
        .populate('client', 'id name number')
        .populate('assignedTo', 'id name')
        .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching open tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Search tickets--------------------------->
router.post(
  "/tickets/search",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const { query } = req.body;

      const tickets = await Ticket.find({
        title: { $regex: query, $options: 'i' }
      });

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error searching tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get all tickets (admin)
router.get(
  "/tickets/all",
  // requirePermission(["issue::read"]), // NEW: Add permission check
  async (req, res) => {
    try {
      const tickets = await Ticket.find({ hidden: false })
        .sort({ createdAt: -1 })
        .populate('clientId', 'id name number')
        .populate('assignedTo', 'id name')
        .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching all tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get user's open tickets
router.get(
  "/tickets/user/open",
  // requirePermission(["issue::read"]), // NEW: Add permission check
  async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).send({
          success: false,
          message: "Unauthorized: user not found in session"
        });
      }

      const tickets = await Ticket.find({
        isComplete: false,
        assignedTo: user._id,
        hidden: false
      })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching user open tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get completed tickets
router.get(
  "/tickets/completed",
  // requirePermission(["issue::read"]), // NEW: Add permission check
  async (req, res) => {
    try {
      const tickets = await Ticket.find({ isComplete: true, hidden: false })
        .populate('client', 'id name number')
        .populate('assignedTo', 'id name')
        .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching completed tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get unassigned tickets
router.get(
  "/tickets/unassigned",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const tickets = await Ticket.find({
        isComplete: false,
        assignedTo: null,
        hidden: false
      });

      res.send({
        success: true,
        tickets: tickets,
      });
    } catch (error) {
      console.error("Error fetching unassigned tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Update ticket
router.put(
  "/ticket/update",
  // requirePermission(["issue::update"]),
  async (req, res) => {
    try {
      const { id, note, detail, title, priority, status, client } = req.body;
      const user = await checkSession(req);

      const issue = await Ticket.findById(id);
      if (!issue) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      const updateData = {
        detail,
        note,
        title,
        priority,
        status
      };

      if (client) {
        updateData.client = client;
      }

      await Ticket.findByIdAndUpdate(id, updateData);

      if (priority && issue.priority !== priority) {
        await priorityNotification(issue, user, issue.priority, priority);
      }

      if (status && issue.status !== status) {
        await statusUpdateNotification(issue, user, status);
      }

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Transfer ticket to another user
// Transfer ticket
router.post('/ticket/transfer', async (req, res) => {
  try {
    const user = await checkSession(req);
    if (!user || !user._id) {
      return res.status(401).send({
        success: false,
        message: 'Unauthorized: user not found in session',
      });
    }

    const { ticketId, newAssigneeId } = req.body;

    if (!ticketId || !newAssigneeId) {
      return res.status(400).send({
        success: false,
        message: 'ticketId and newAssigneeId are required',
      });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).send({
        success: false,
        message: 'Ticket not found',
      });
    }

    ticket.assignedTo = newAssigneeId;
    await ticket.save();

    await Notification.create({
      userId: newAssigneeId,
      ticketId: ticket._id,
      title: 'Ticket Transferred',
      message: `Ticket "${ticket.title}" has been transferred to you.`,
      text: `You are now assigned to ticket: ${ticket.title}`,
      type: 'info',
      relatedEntity: 'ticket',
      relatedEntityId: ticket._id,
    });

    try {
      await sendAssignedEmail('newassignee@email.com');
    } catch (err) {
      console.error('Error sending assigned email:', err.message);
    }

    res.send({
      success: true,
      message: 'Ticket transferred successfully',
    });
  } catch (error) {
    console.error('Error transferring ticket:', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Transfer ticket to another client
router.post('/transfer/client',
  //  requirePermission(['issue::transfer']),
    async (req, res) => {
  try {
    const user = await checkSession(req);
    if (!user || !user._id) {
      return res.status(401).send({
        success: false,
        message: 'Unauthorized: user not found in session',
      });
    }

    const { clientId, ticketId } = req.body;

    if (!clientId || !ticketId) {
      return res.status(400).send({
        success: false,
        message: 'clientId and ticketId are required',
      });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).send({
        success: false,
        message: 'Ticket not found',
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).send({
        success: false,
        message: 'Client not found',
      });
    }

    ticket.clientId = client._id;
    ticket.clientName = client.name;
    await ticket.save();

    await Notification.create({
      userId: user._id,
      ticketId: ticket._id,
      title: 'Ticket Client Transfer',
      message: `Ticket "${ticket.title}" has been transferred to client "${client.name}".`,
      text: `The ticket "${ticket.title}" is now assigned to client "${client.name}".`,
      type: 'info',
      relatedEntity: 'client',
      relatedEntityId: client._id,
    });

    res.send({
      success: true,
      message: `Ticket transferred to client "${client.name}" successfully`,
    });
  } catch (error) {
    console.error('Error transferring ticket to client:', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Add comment to ticket
router.post(
  "/comment",
  // requirePermission(["issue::comment"]),
  async (req, res) => {
    try {
      const { text, id, public: public_comment } = req.body;
      const user = await checkSession(req);

      await Comment.create({
        text,
        public: public_comment,
        ticketId: id,
        userId: user._id,
      });

      const ticket = await Ticket.findById(id);
      if (!ticket) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      if (public_comment && ticket.email) {
        await sendComment(text, ticket.title, ticket._id, ticket.email);
      }

      await commentNotification(ticket, user);

      const hog = track();
      hog.capture({
        event: "ticket_comment",
        distinctId: ticket._id.toString(),
      });

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Delete comment
router.post(
  "/comment/delete",
  // requirePermission(["issue::comment"]),
  async (req, res) => {
    try {
      const { id } = req.body;

      await Comment.findByIdAndDelete(id);

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Update ticket status
router.put(
  "/status/update",
  // requirePermission(["issue::update"]),
  async (req, res) => {
    try {
      const { status, id } = req.body;
      const user = await checkSession(req);

      const ticket = await Ticket.findByIdAndUpdate(
        id,
        { isComplete: status },
        { new: true }
      );

      if (!ticket) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      await activeStatusNotification(ticket, user, status);
      await sendTicketStatus(ticket);

      const webhooks = await Webhook.find({ type: "ticket_status_changed", active: true });
      for (const webhook of webhooks) {
        const s = status ? "Completed" : "Outstanding";
        if (webhook.url.includes("discord.com")) {
          const message = {
            content: `Ticket ${ticket._id} created by ${ticket.email}, has had its status changed to ${s}`,
            avatar_url: "https://avatars.githubusercontent.com/u/76014454?s=200&v=4",
            username: "Peppermint.sh",
          };
          await axios.post(webhook.url, message);
        } else {
          await axios.post(webhook.url, {
            data: `Ticket ${ticket._id} created by ${ticket.email}, has had its status changed to ${s}`,
          });
        }
      }

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error updating ticket status:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Hide ticket
router.put(
  "/status/hide",
  // requirePermission(["issue::update"]),
  async (req, res) => {
    try {
      const { hidden, id } = req.body;

      await Ticket.findByIdAndUpdate(id, { hidden });

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error hiding ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Lock ticket
router.put(
  "/status/lock",
  // requirePermission(["issue::update"]),
  async (req, res) => {
    try {
      const { locked, id } = req.body;

      await Ticket.findByIdAndUpdate(id, { locked });

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error locking ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Delete ticket
router.post(
  "/delete",
  // requirePermission(["issue::delete"]),
  async (req, res) => {
    try {
      const { id } = req.body;

      await Ticket.findByIdAndDelete(id);

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error deleting ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);


// Get external user's open tickets
router.get(
  "/user/open/external",
  async (req, res) => {
    try {
      const user = await checkSession(req);

      const tickets = await Ticket.find({
        isComplete: false,
        email: user.email,
        hidden: false
      })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching external user tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get external user's closed tickets
router.get(
  "/user/closed/external",
  async (req, res) => {
    try {
      const user = await checkSession(req);

      const tickets = await Ticket.find({
        isComplete: true,
        email: user.email,
        hidden: false
      })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching external user closed tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Get all external user tickets
router.get(
  "/user/external",
 
  async (req, res) => {
    try {
      const user = await checkSession(req);

      const tickets = await Ticket.find({
        email: user.email,
        hidden: false
      })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name');

      res.send({
        tickets: tickets,
        success: true,
      });
    } catch (error) {
      console.error("Error fetching all external user tickets:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Subscribe to ticket
router.get(
  "/subscribe/:id",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await checkSession(req);

      if (!user || !user._id) {
        return res.status(401).send({
          success: false,
          message: "Unauthorized: user not found in session"
        });
      }

      const ticket = await Ticket.findById(id);
      if (!ticket) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      const following = ticket.following || [];

      // Ensure values are strings before comparing
      const userId = user._id.toString();
      if (following.includes(userId)) {
        return res.send({
          success: false,
          message: "You are already following this issue"
        });
      }

      following.push(userId);
      await Ticket.findByIdAndUpdate(id, { following });

      res.send({
        success: true,
      });
    } catch (error) {
      console.error("Error subscribing to ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

// Unsubscribe from ticket
router.get(
  "/unsubscribe/:id",
  // requirePermission(["issue::read"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await checkSession(req);

      const ticket = await Ticket.findById(id);
      if (!ticket) {
        return res.status(404).send({
          success: false,
          message: "Ticket not found"
        });
      }

      const following = ticket.following || [];
      if (!following.includes(user._id.toString())) {
        return res.send({
          success: false,
          message: "You are not following this issue"
        });
      }

      const updatedFollowing = following.filter(userId => userId !== user._id.toString());
      await Ticket.findByIdAndUpdate(id, { following: updatedFollowing });

      res.send({
        success: true,
      }); 
    } catch (error) {
      console.error("Error unsubscribing from ticket:", error);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
);

router.get("/data/tickets/summary", async (req, res) => {
  try {
    const user = await checkSession(req);
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in session",
      });
    }

    const openTickets = await Ticket.countDocuments({
      isComplete: false,
      hidden: false,
    });
    const completedTickets = await Ticket.countDocuments({
      isComplete: true,
      hidden: false,
    });
    const unassignedTickets = await Ticket.countDocuments({
      isComplete: false,
      assignedTo: null,
      hidden: false,
    });
    const userTickets = await Ticket.countDocuments({
      isComplete: false,
      assignedTo: user._id,
      hidden: false,
    });

    res.json({
      success: true,
      summary: {
        open: openTickets,
        completed: completedTickets,
        unassigned: unassignedTickets,
        userTickets: userTickets,
      },
    });
  } catch (error) {
    console.error("Error fetching ticket summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.get('/list/open', async (req, res) => {
  try {
    const tickets = await Ticket.find({ isComplete: false, hidden: false })
      .sort({ createdAt: -1 })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name')
      .populate({
        path: 'comments',
        model: 'Comment',
        options: { sort: { createdAt: -1 }, limit: 1 },
        populate: { path: 'userId', select: 'name' },
        select: 'text type createdAt userId replyEmail',
      });
    res.send({
      tickets: tickets,
      success: true,
    });
  } catch (error) {
    console.error('Error fetching open tickets:', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// New route for assigned tickets (open and closed)
router.get('/tickets/list/assigned/:userId', async (req, res) => {
  try {
    const user = await checkSession(req);
    if (!user || user._id.toString() !== req.params.userId) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only view your own assigned tickets',
      });
    }

    const { status } = req.query; // Allow filtering by status (open or closed)
    const query = {
      assignedTo: user._id,
      hidden: false,
    };

    if (status === 'closed') {
      query.isComplete = true;
    } else if (status === 'open') {
      query.isComplete = false;
    } // Default includes both if no status specified

    const tickets = await Ticket.find(query)
      .sort({ createdAt: -1 })
      .populate('client', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name')
      .populate({
        path: 'comments',
        model: 'Comment',
        options: { sort: { createdAt: -1 }, limit: 1 },
        populate: { path: 'userId', select: 'name' },
        select: 'text type createdAt userId replyEmail',
      });

    res.send({
      tickets: tickets,
      success: true,
    });
  } catch (error) {
    console.error('Error fetching assigned tickets:', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Keep existing /user/closed/external
router.get('/user/closed/external', async (req, res) => {
  try {
    const user = await checkSession(req);
    const tickets = await Ticket.find({
      isComplete: true,
      email: user.email,
      hidden: false,
    })
      .populate('clientId', 'id name number')
      .populate('assignedTo', 'id name')
      .populate('team', 'id name');
    res.send({
      tickets: tickets,
      success: true,
    });
  } catch (error) {
    console.error('Error fetching external user closed tickets:', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});
module.exports = router;