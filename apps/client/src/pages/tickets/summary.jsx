// src/pages/portal/tickets/summary.jsx
import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { toast } from "react-toastify";
import { useUser } from "../../store/session"; // Adjust path based on structure

const TicketSummary = () => {
  const { fetchWithAuth } = useUser();
  const [summary, setSummary] = useState({ open: 0, completed: 0, unassigned: 0, userTickets: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth("/api/data/tickets/summary");
      if (!response.ok) throw new Error(`Failed to fetch summary: ${response.statusText}`);
      const result = await response.json();
      if (result.success) setSummary(result.summary);
      else {
        setError(result.message);
        toast.error(result.message);
      }
    } catch (err) {
      setError("Failed to fetch summary");
      toast.error(`Error fetching summary: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const data = [
    { name: "Open", value: summary.open },
    { name: "Completed", value: summary.completed },
    { name: "Unassigned", value: summary.unassigned },
    { name: "My Tickets", value: summary.userTickets },
  ];

  if (loading) return <div className="text-center py-4">Loading...</div>;
  if (error) return <div className="text-red-600 text-center py-4">{error}</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Ticket Summary</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <BarChart width={600} height={300} data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#8884d8" />
        </BarChart>
      </div>
    </div>
  );
};

export default TicketSummary;