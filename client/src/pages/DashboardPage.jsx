import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600 font-medium">Loading session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-800">Secure Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.email}</span>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 p-6 flex flex-col justify-center items-center bg-white shadow">
            {user?.avatar_url && (
              <img
                src={user.avatar_url}
                alt="Profile Avatar"
                className="w-24 h-24 rounded-full mb-4 shadow"
              />
            )}
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welcome back, {user?.name || 'User'}!</h2>
            <p className="text-gray-600 mb-4">You are successfully authenticated via a secure HttpOnly BFF session cookie.</p>
            <div className="bg-gray-50 p-4 rounded border text-left text-xs font-mono text-gray-700 w-full max-w-md">
              <p><strong>User ID:</strong> {user?.id}</p>
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>Email Verified:</strong> {user?.email_verified ? 'Yes' : 'No'}</p>
              <p><strong>Member Since:</strong> {new Date(user?.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
