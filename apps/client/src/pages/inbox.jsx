// src/pages/portal/Inbox.jsx
import React, { useState, useEffect, useCallback, useRef, Fragment } from "react"; // Removed Filter from import
import { useSearchParams } from "react-router-dom";
import { Mail, Eye, Reply, RefreshCw, Search, ChevronLeft, ChevronRight, Clock, AlertCircle, Send, Download, Paperclip, Filter } from "lucide-react"; // Added Filter icon
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "react-toastify";
import { useUser } from "../store/session.jsx";

// Optional: If using Radix UI for Select
import { Select, SelectTrigger, SelectContent, SelectItem } from "@radix-ui/react-select"; // Add this if using bulk move

const FOLDERS = ['inbox', 'sent', 'processed', 'trash', 'drafts', 'resolved'];

const Inbox = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [folder, setFolder] = useState(searchParams.get('folder') || 'inbox');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);
  const [limit] = useState(20);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [stats, setStats] = useState({ unseen: 0, pending: 0 });
  const [statsError, setStatsError] = useState(false);
  const { fetchWithAuth } = useUser();
  const searchTimeoutRef = useRef(null);
  const modalRef = useRef(null); // For keyboard nav

  // Fetch emails
  const fetchEmails = useCallback(async (currFolder = folder, currPage = page, currSearch = searchTerm, currUnread = unreadOnly) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: currPage, limit: limit.toString() });
      if (currSearch) params.append('q', currSearch);
      if (currUnread) params.append('unreadOnly', 'true');
      const url = `/v1/imap/emails?${params}`;
      const res = await fetchWithAuth(url);
      const result = await res.json();

      if (res.ok && result.success) {
        setEmails(result.emails || []);
        setTotal(result.total || 0);
      } else {
        toast.error(result.error || "Failed to fetch emails", { toastId: "fetch-emails-error" });
        setEmails([]);
        setTotal(0);
      }
    } catch (err) {
      toast.error(err.message, { toastId: "fetch-emails-error" });
      setEmails([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, page, searchTerm, unreadOnly, limit]);

  // Debounced search
  const debouncedSearch = useCallback((term) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchTerm(term);
      setPage(1);
    }, 300);
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      setStatsError(false);
      const unseenRes = await fetchWithAuth("/v1/imap/emails/unseen");
      const unseenResult = await unseenRes.json();
      if (unseenRes.ok && unseenResult.success) {
        setStats(prev => ({ ...prev, unseen: unseenResult.total || 0 }));
      }

      const prioRes = await fetchWithAuth("/v1/imap/priority-stats");
      const prioResult = await prioRes.json();
      if (prioRes.ok && prioResult.success) {
        setStats(prev => ({ ...prev, pending: prioResult.data.pendingAnalysis || 0 }));
      }
    } catch (err) {
      console.error('Stats error:', err);
      setStatsError(true);
      setStats({ unseen: 0, pending: 0 });
    }
  }, [fetchWithAuth]);

  // Trigger IMAP fetch
  const handleRefresh = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/v1/imap/fetch-emails", { method: 'POST' });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.info('Fetch started—refreshing...', { toastId: "fetch-started" });
        setTimeout(() => fetchEmails(folder, page, searchTerm, unreadOnly), 2000);
      } else {
        toast.error(result.error || "Failed to start fetch", { toastId: "fetch-start-error" });
      }
    } catch (err) {
      toast.error(err.message, { toastId: "fetch-start-error" });
    }
  }, [fetchWithAuth, fetchEmails, folder, page, searchTerm, unreadOnly]);

  // Reply
  const handleReply = useCallback(async (emailId) => {
    if (!replyText.trim()) {
      toast.error("Reply cannot be empty", { toastId: "reply-empty" });
      return;
    }
    try {
      const res = await fetchWithAuth(`/v1/imap/emails/${emailId}/reply`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        toast.success("Reply sent successfully", { toastId: `reply-${emailId}` });
        setReplyText('');
        setReplyOpen(false);
        setSelectedEmail(null);
        fetchEmails(folder, page, searchTerm, unreadOnly);
      } else {
        toast.error(result.error || "Failed to send reply", { toastId: `reply-error-${emailId}` });
      }
    } catch (err) {
      toast.error(err.message, { toastId: `reply-error-${emailId}` });
    }
  }, [fetchWithAuth, replyText, fetchEmails, folder, page, searchTerm, unreadOnly]);

  // Move
  const handleMove = useCallback(async (emailId, newFolder) => {
    try {
      const res = await fetchWithAuth(`/v1/imap/emails/${emailId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: newFolder }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        toast.success("Email moved successfully", { toastId: `move-${emailId}` });
        fetchEmails(folder, page, searchTerm, unreadOnly);
      } else {
        toast.error(result.error || "Failed to move email", { toastId: `move-error-${emailId}` });
      }
    } catch (err) {
      toast.error(err.message, { toastId: `move-error-${emailId}` });
    }
  }, [fetchWithAuth, fetchEmails, folder, page, searchTerm, unreadOnly]);

  // Mark read/unread
  const handleMarkRead = useCallback(async (emailId) => {
    try {
      const email = emails.find(e => e._id === emailId);
      const endpoint = email.isRead ? 'unread' : 'read';
      const res = await fetchWithAuth(`/v1/imap/emails/${emailId}/${endpoint}`, {
        method: "POST",
      });
      const result = await res.json();

      if (res.ok && result.success) {
        toast.success("Status updated", { toastId: `read-${emailId}` });
        if (result.email) {
          setEmails(prev => prev.map(e => e._id === emailId ? result.email : e));
        } else {
          fetchEmails(folder, page, searchTerm, unreadOnly);
        }
      } else {
        toast.error(result.error || "Failed to update status", { toastId: `read-error-${emailId}` });
      }
    } catch (err) {
      toast.error(err.message, { toastId: `read-error-${emailId}` });
    }
  }, [fetchWithAuth, emails, fetchEmails, folder, page, searchTerm, unreadOnly]);

  // Bulk move
  const handleBulkMove = useCallback(async (newFolder) => {
    if (selectedEmails.length === 0) return;
    try {
      const res = await fetchWithAuth("/v1/emails/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: selectedEmails, folder: newFolder }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        toast.success(`Moved ${selectedEmails.length} emails`, { toastId: "bulk-move" });
        setSelectedEmails([]);
        fetchEmails(folder, page, searchTerm, unreadOnly);
      } else {
        toast.error(result.error || "Bulk move failed", { toastId: "bulk-move-error" });
      }
    } catch (err) {
      toast.error(err.message, { toastId: "bulk-move-error" });
    }
  }, [fetchWithAuth, selectedEmails, fetchEmails, folder, page, searchTerm, unreadOnly]);

  // Bulk mark read
  const handleBulkRead = useCallback(async (isRead) => {
    if (selectedEmails.length === 0) return;
    const endpoint = isRead ? 'unread' : 'read';
    try {
      for (const id of selectedEmails) {
        await handleMarkRead(id);
      }
      setSelectedEmails([]);
    } catch (err) {
      toast.error('Bulk update failed', { toastId: "bulk-read-error" });
    }
  }, [selectedEmails, handleMarkRead]);

  useEffect(() => {
    fetchEmails();
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Poll stats every 30s
    return () => clearInterval(interval);
  }, [fetchEmails, fetchStats]);

  useEffect(() => {
    setSearchParams({ page: page.toString(), ...(searchTerm && { q: searchTerm }) }, { replace: true });
  }, [page, searchTerm, setSearchParams]);

  const pages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const handleSelectAll = useCallback(() => {
    if (selectedEmails.length === emails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(emails.map(e => e._id));
    }
  }, [selectedEmails.length, emails.length]);

  const handleSelectOne = useCallback((id) => {
    setSelectedEmails(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  }, []);

  const isSelected = useCallback((id) => selectedEmails.includes(id), [selectedEmails]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
            <p className="text-sm text-gray-700">{startItem}-{endItem} of {total}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              placeholder="Search emails..."
              value={searchTerm}
              onChange={(e) => debouncedSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`px-3 py-2 border border-gray-300 rounded-md text-sm font-medium ${unreadOnly ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            <Filter className="h-4 w-4 inline mr-1" />
            Unread Only
          </button>
          {selectedEmails.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => handleBulkRead(false)} className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                Mark Read ({selectedEmails.length})
              </button>
              <Select onValueChange={handleBulkMove}>
                <SelectTrigger className="w-32">
                  Move Selected
                </SelectTrigger>
                <SelectContent>
                  {FOLDERS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Unseen</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.unseen}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending Analysis</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.pending}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Mail className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total</dt>
                  <dd className="text-lg font-medium text-gray-900">{total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 mb-4 text-red-600" />
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchEmails}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="-mx-4 sm:-mx-6 overflow-x-auto">
              <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:pl-6">
                          <input type="checkbox" onChange={handleSelectAll} className="rounded" />
                        </th>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:pl-6">
                          From
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {emails.map((email) => (
                        <tr key={email._id} className="hover:bg-gray-50">
                          <td className="py-4 pl-4 pr-3 text-sm">
                            <input type="checkbox" checked={isSelected(email._id)} onChange={() => handleSelectOne(email._id)} className="rounded" />
                          </td>
                          <td className="w-full max-w-0 py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:w-auto sm:max-w-none sm:pl-6">
                            {email.from}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-500 max-w-md truncate">
                            <div className="flex items-center">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                email.isRead ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              } mr-2`}>
                                {email.isRead ? "Read" : "Unread"}
                              </span>
                              {email.subject}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-500">
                            {new Date(email.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              email.priority === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                              email.priority === 'low' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {email.priority?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => { setSelectedEmail(email); setIsOpen(true); }}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleMarkRead(email._id)}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                {email.isRead ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => { setSelectedEmail(email); setReplyOpen(true); }}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                <Reply className="h-4 w-4" />
                              </button>
                              <select
                                onChange={(e) => handleMove(email._id, e.target.value)}
                                defaultValue=""
                                className="text-sm border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Move</option>
                                {FOLDERS.map(f => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {emails.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <Mail className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">No emails. <button onClick={handleRefresh} className="text-indigo-600 hover:text-indigo-900">Fetch new ones?</button></p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
          <div className="text-sm text-gray-700">
            <span className="font-medium">{total} total emails</span>
            <span className="ml-1">•</span>
            <span className="ml-1">Page {page} of {pages}</span>
          </div>
          <div className="flex justify-between flex-1 sm:justify-end sm:flex-grow-0">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* View Modal */}
      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedEmail?.subject}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        From: {selectedEmail?.from} | {new Date(selectedEmail?.date).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={() => setIsOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-4 max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-md">
                    <div className="whitespace-pre-wrap text-sm text-gray-900 prose max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: selectedEmail?.body || 'No body' }} />
                    </div>
                    {selectedEmail?.attachments && selectedEmail.attachments.length > 0 && (
                      <div className="mt-4">
                        <h3 className="font-medium mb-2">Attachments:</h3>
                        <ul className="space-y-1">
                          {selectedEmail.attachments.map((att, i) => (
                            <li key={i} className="text-sm text-gray-600">
                              <a href={`/api/attachments/${selectedEmail._id}/${att.filename}`} download className="flex items-center gap-2 hover:text-indigo-600">
                                <Paperclip className="h-4 w-4" />
                                {att.filename} ({att.size} bytes)
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => handleMarkRead(selectedEmail._id)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {selectedEmail?.isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                    <button
                      onClick={() => handleMove(selectedEmail._id, 'processed')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      Move to Processed
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Reply Modal */}
      <Transition show={replyOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setReplyOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Reply to {selectedEmail?.from}</h2>
                      <p className="text-sm text-gray-500">Subject: Re: {selectedEmail?.subject}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={() => setReplyOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply here..."
                    rows={6}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => setReplyOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReply(selectedEmail?._id)}
                      disabled={!replyText.trim()}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Reply
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default Inbox; // Ensure this export is present