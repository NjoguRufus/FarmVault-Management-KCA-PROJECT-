import React, { useState } from 'react';
import { Send, Star, MessageSquare } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayRole } from '@/lib/utils';

export default function FeedbackPage() {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState('general');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      alert('Please enter your feedback message.');
      return;
    }

    const roleLabel = user ? getDisplayRole(user) : 'Unknown';

    await addDoc(collection(db, 'feedback'), {
      rating,
      type: feedbackType,
      message,
      companyId: user?.companyId ?? null,
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      userRole: user?.role ?? null,
      userRoleLabel: roleLabel,
      employeeRole: (user as { employeeRole?: string })?.employeeRole ?? null,
      createdAt: serverTimestamp(),
    });

    alert('Feedback submitted to the relevant team.');
    setRating(0);
    setMessage('');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl w-full px-2 sm:px-0">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Help us improve FarmVault by sharing your thoughts
        </p>
      </div>

      {/* Feedback Form */}
      <form onSubmit={handleSubmit} className="fv-card">
        <div className="space-y-6">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium mb-3">How would you rate your experience?</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? 'text-fv-gold fill-fv-gold'
                        : 'text-muted'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Type */}
          <div>
            <label className="block text-sm font-medium mb-3">What type of feedback do you have?</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'general', label: 'General' },
                { value: 'bug', label: 'Bug Report' },
                { value: 'feature', label: 'Feature Request' },
                { value: 'improvement', label: 'Improvement' },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFeedbackType(type.value)}
                  className={`fv-btn ${
                    feedbackType === type.value
                      ? 'fv-btn--primary'
                      : 'fv-btn--secondary'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium mb-2">Your Feedback</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you think..."
              rows={5}
              className="fv-input resize-none"
            />
          </div>

          {/* Submit */}
          <button type="submit" className="fv-btn fv-btn--primary w-full">
            <Send className="h-4 w-4" />
            Submit Feedback
          </button>
        </div>
      </form>

      {/* Recent Feedback */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Your Recent Feedback</h3>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>You haven't submitted any feedback yet.</p>
        </div>
      </div>
    </div>
  );
}
