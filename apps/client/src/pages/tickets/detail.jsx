import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Reply, Check, Lock, EyeOff, User, Mail, Send, Users, ArrowLeftRight } from "lucide-react";
import { toast } from "react-toastify";
import { useUser } from "../../store/session";

const TicketDetail = () => {
  const { id } = useParams();
  const { fetchWithAuth, isAdmin } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const chatRef = useRef(null); // For auto-scroll

  const fetchTicket = useCallback(async () => {
    try {
      setLoading(true);
      setHasError(false);
      const response = await fetchWithAuth(`/v1/ticket/tickets/${id}`);
      if (!response.ok) throw new Error(`Failed to fetch ticket: ${response.statusText}`);
      const result = await response.json();
      if (result.success) {
        setTicket(result.ticket);
        setComments(result.comments || []);
      } else {
        throw new Error(result.message || "Failed to load ticket");
      }
    } catch (err) {
      setHasError(true);
      toast.error(`Error fetching ticket: ${err.message}`, { autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, id]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [comments]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const response = await fetchWithAuth("/v1/ticket/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment, id, public: true }),
      });
      if (!response.ok) throw new Error(`Failed to add comment: ${response.statusText}`);
      setNewComment("");
      toast.success("Comment added");
      await fetchTicket();
    } catch (err) {
      toast.error(`Error adding comment: ${err.message}`, { autoClose: 5000 });
    }
  };

  const handleStatusUpdate = async (status) => {
    try {
      const response = await fetchWithAuth("/v1/ticket/status/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, id }),
      });
      if (!response.ok) throw new Error(`Failed to update status: ${response.statusText}`);
      toast.success("Status updated");
      await fetchTicket();
    } catch (err) {
      toast.error(`Error updating status: ${err.message}`, { autoClose: 5000 });
    }
  };

  const handleHide = async () => {
    try {
      const response = await fetchWithAuth("/v1/ticket/status/hide", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !ticket.hidden, id }),
      });
      if (!response.ok) throw new Error(`Failed to hide ticket: ${response.statusText}`);
      toast.success("Ticket visibility updated");
      await fetchTicket();
    } catch (err) {
      toast.error(`Error updating visibility: ${err.message}`, { autoClose: 5000 });
    }
  };

  const handleLock = async () => {
    try {
      const response = await fetchWithAuth("/v1/ticket/status/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !ticket.locked, id }),
      });
      if (!response.ok) throw new Error(`Failed to lock ticket: ${response.statusText}`);
      toast.success("Ticket lock status updated");
      await fetchTicket();
    } catch (err) {
      toast.error(`Error updating lock: ${err.message}`, { autoClose: 5000 });
    }
  };

  const handleTransfer = async () => {
    if (!isAdmin || !transferTo) return;
    setTransferring(true);
    try {
      const response = await fetchWithAuth("/v1/ticket/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, newAssigneeId: transferTo }),
      });
      if (!response.ok) throw new Error(`Failed to transfer ticket: ${response.statusText}`);
      toast.success("Ticket transferred successfully");
      await fetchTicket();
      setTransferTo("");
    } catch (err) {
      toast.error(`Error transferring ticket: ${err.message}`, { autoClose: 5000 });
    } finally {
      setTransferring(false);
    }
  };

  const basePath = location.pathname.startsWith("/admin") ? "/admin" : "/portal";

  if (loading) return <div className="text-center py-4">Loading...</div>;
  if (hasError && !ticket) return <div className="text-red-600 text-center py-4">Failed to load ticket. Please try again later.</div>;

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">{ticket.title} <span className="text-sm text-gray-500">#{ticket.number}</span></h1>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <p><strong>Status:</strong> {ticket.isComplete ? "Completed" : "Open"}</p>
        <p><strong>Priority:</strong> {ticket.priority}</p>
        <p><strong>Assigned To:</strong> {ticket.assignedTo?.name || "Unassigned"}</p>
        <p><strong>Email:</strong> {ticket.email}</p>
        <p><strong>Client:</strong> {ticket.client?.name || "N/A"}</p>
        <p><strong>Created By:</strong> {ticket.createdBy?.name || "Guest"}</p>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={() => handleStatusUpdate(!ticket.isComplete)}
          className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
        >
          <Check className="h-4 w-4 mr-2" />
          {ticket.isComplete ? "Reopen" : "Complete"}
        </button>
        {isAdmin && (
          <>
            <button
              onClick={handleHide}
              className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              {ticket.hidden ? "Unhide" : "Hide"}
            </button>
            <button
              onClick={handleLock}
              className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Lock className="h-4 w-4 mr-2" />
              {ticket.locked ? "Unlock" : "Lock"}
            </button>
            <div className="flex items-center">
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="mr-2 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={!isAdmin}
              >
                <option value="">Select User</option>
                {/* This is a placeholder; replace with actual user list from API */}
                <option value="user1">User 1</option>
                <option value="user2">User 2</option>
              </select>
              <button
                onClick={handleTransfer}
                className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                disabled={!isAdmin || !transferTo || transferring}
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                {transferring ? "Transferring..." : "Transfer"}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4">
        <h2 className="text-lg font-medium">Workflow</h2>
        <div ref={chatRef} className="h-96 overflow-y-auto p-4 bg-gray-50 rounded space-y-4">
          {/* Initial Ticket Bubble */}
          <div className="p-3 rounded-lg max-w-[70%] ml-auto bg-blue-100">
            <p className="text-gray-800">{ticket.detail}</p>
            <p className="text-xs text-gray-500 mt-1">Created: {new Date(ticket.createdAt).toLocaleString()}</p>
          </div>
          {/* Comments as Bubbles */}
          {comments.map((comment) => (
            <div
              key={comment._id}
              className={`p-3 rounded-lg max-w-[70%] ${
                comment.type === "auto-reply" ? "bg-gray-200 mr-auto" : "bg-green-100 ml-auto"
              }`}
            >
              <p className="text-gray-800">{comment.text}</p>
              <p className="text-xs text-gray-500 mt-1">
                {comment.userId?.name || "System"} - {new Date(comment.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          rows="4"
        />
        <button
          onClick={handleAddComment}
          className="mt-2 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          disabled={!newComment.trim()}
        >
          <Send className="h-4 w-4 mr-2" />
          Add Comment
        </button>
      </div>
    </div>
  );
};

export default TicketDetail;