// src/pages/tickets/index.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mail, Plus, Filter } from "lucide-react";
import { toast } from "react-toastify";
import { useUser } from "../../store/session";

const Tickets = () => {
  const { fetchWithAuth, isAdmin, isAgent, user, loading: userLoading } = useUser();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchTickets = useCallback(async () => {
    if (userLoading || !user?._id) {
      console.log("User loading or ID not available, skipping fetch:", { userLoading, user }); // Debug
      setHasError(true);
      toast.error("User session is not ready. Please wait or log in again.", { autoClose: 5000 });
      return;
    }

    try {
      setLoading(true);
      setHasError(false);
      let endpoint = "/v1/ticket/tickets/list/open"; // Default for non-agents or portal

      if (isAgent) {
        // For agents, fetch assigned tickets based on the current route
        const path = location.pathname;
        endpoint = path.includes("/tickets/closed")
          ? `/v1/ticket/tickets/list/assigned/closed/${user._id}`
          : `/v1/ticket/tickets/list/assigned/open/${user._id}`;
      }

      console.log("Fetching tickets from endpoint:", endpoint); // Debug
      const response = await fetchWithAuth(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch tickets: ${response.statusText}`);
      const result = await response.json();
      console.log("API Response:", result); // Debug
      if (result.success) setTickets(result.tickets);
      else throw new Error(result.message || "Failed to load tickets");
    } catch (err) {
      setHasError(true);
      toast.error(`Error fetching tickets: ${err.message}`, { autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, isAgent, user?._id, location.pathname, userLoading]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = () => navigate(`${basePath}/tickets/new`);
  const handleViewTicket = (id) => navigate(`${basePath}/tickets/${id}`);
  const handleSearch = () => navigate(`${basePath}/tickets/search`);
  const handleSummary = () => navigate(`${basePath}/tickets/summary`);

  // Determine base path based on role and current route
  const basePath = isAgent ? "/agents" : location.pathname.startsWith("/admin") ? "/admin" : "/portal";

  if (loading) return <div className="text-center py-4">Loading...</div>;
  if (hasError && tickets.length === 0) return <div className="text-red-600 text-center py-4">Failed to load tickets. Please try again later.</div>;

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        </div>
        <div className="space-x-2">
          {isAgent && (
            <button
              onClick={handleCreateTicket}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Ticket
            </button>
          )}
          <button
            onClick={handleSearch}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white text-gray-700 hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            Search
          </button>
          {!isAgent && isAdmin && (
            <button
              onClick={handleSummary}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white text-gray-700 hover:bg-gray-50"
            >
              Summary
            </button>
          )}
        </div>
      </div>
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Reply</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tickets.map((ticket) => (
              <tr key={ticket._id} className="hover:bg-gray-50 transition-colors duration-200">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {ticket.comments && ticket.comments.length > 0 ? (
                    ticket.comments[0].type === "auto-reply" ? (
                      <span className="text-gray-500 italic">Auto-reply: {ticket.comments[0].text.slice(0, 30)}...</span>
                    ) : (
                      <span>{ticket.comments[0].text.slice(0, 30)}...</span>
                    )
                  ) : "No replies"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    ticket.priority === "low" ? "bg-green-100 text-green-800" :
                    ticket.priority === "pending" ? "bg-yellow-100 text-yellow-800" :
                    ticket.priority === "medium" ? "bg-blue-100 text-blue-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={ticket.isComplete ? "text-green-600" : "text-red-600"}>
                    {ticket.isComplete ? "Completed" : "Open"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {ticket.assignedTo?.name || "Unassigned"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleViewTicket(ticket._id)}
                    className="text-indigo-600 hover:text-indigo-900 mr-2"
                  >
                    View
                  </button>
                  {isAdmin && !ticket.isComplete && (
                    <button
                      onClick={() => {
                        alert("Transfer action not implemented yet.");
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Transfer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.length === 0 && !loading && <div className="p-4 text-center text-gray-500">No tickets found.</div>}
      </div>
    </div>
  );
};

export default Tickets;