// src/pages/portal/tickets/search.jsx
import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { toast } from "react-toastify";
import { useUser } from "../../store/session";
import { useNavigate } from "react-router-dom";

const TicketSearch = () => {
  const { fetchWithAuth } = useUser();
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      setLoading(true);
      const response = await fetchWithAuth("/api/tickets/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`Failed to search tickets: ${response.statusText}`);
      const result = await response.json();
      if (result.success) setTickets(result.tickets);
      else {
        setError(result.message);
        toast.error(result.message);
      }
    } catch (err) {
      setError("Failed to search tickets");
      toast.error(`Error searching tickets: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicket = (id) => navigate(`/portal/tickets/${id}`);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Search Tickets</h1>
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter search term..."
            className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={loading || !query.trim()}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>
      {loading && <div className="text-center py-4">Searching...</div>}
      {error && <div className="text-red-600 text-center py-4">{error}</div>}
      {!loading && !error && tickets.length === 0 && query && <div className="text-gray-500 text-center py-4">No tickets found.</div>}
      {!loading && !error && tickets.length > 0 && (
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket._id} className="p-4 bg-gray-50 rounded cursor-pointer hover:bg-gray-100" onClick={() => handleViewTicket(ticket._id)}>
              <div className="text-sm font-medium text-gray-900">{ticket.title} <span className="text-xs text-gray-500">#{ticket.number}</span></div>
              <div className="text-xs text-gray-600">Priority: {ticket.priority}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TicketSearch;