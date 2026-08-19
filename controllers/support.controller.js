import AuditLog from "../models/auditLog.model.js";
import SupportTicket from "../models/supportTicket.model.js";

const serializeTicket = (ticket) => ({
  id: ticket._id,
  subject: ticket.subject,
  category: ticket.category,
  status: ticket.status,
  priority: ticket.priority,
  latestMessage: ticket.latestMessage,
  messageCount: ticket.messages.length,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

export const getSupportOverview = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id }).sort({
      updatedAt: -1,
    });

    res.json({
      totals: {
        all: tickets.length,
        open: tickets.filter((ticket) => ticket.status === "open").length,
        inReview: tickets.filter((ticket) => ticket.status === "in_review")
          .length,
        resolved: tickets.filter((ticket) => ticket.status === "resolved")
          .length,
      },
      recentTickets: tickets.slice(0, 5).map(serializeTicket),
    });
  } catch (error) {
    next(error);
  }
};

export const getSupportTickets = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id }).sort({
      updatedAt: -1,
    });

    res.json({
      tickets: tickets.map(serializeTicket),
    });
  } catch (error) {
    next(error);
  }
};

export const createSupportTicket = async (req, res, next) => {
  try {
    const { subject, category = "general", priority = "medium", message } =
      req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res
        .status(400)
        .json({ message: "Subject and message are required" });
    }

    const ticket = await SupportTicket.create({
      userId: req.user._id,
      subject: subject.trim(),
      category,
      priority,
      latestMessage: message.trim(),
      messages: [{ senderType: "user", message: message.trim() }],
    });

    await AuditLog.create({
      actorUserId: req.user._id,
      actorType: "user",
      action: "support.ticket.created",
      entityType: "SupportTicket",
      entityId: ticket._id,
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent") || null,
      metadata: {
        category,
        priority,
      },
    });

    res.status(201).json({
      message: "Support ticket created successfully",
      ticket: serializeTicket(ticket),
    });
  } catch (error) {
    next(error);
  }
};
