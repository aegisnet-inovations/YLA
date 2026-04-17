import React, { useState } from 'react';
import { Star, Send } from 'lucide-react';

const ReviewModal = ({ sessionId, onSuccess, onClose }) => {
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const API = `${BACKEND_URL}/api`;

  const wordCount = reviewText.trim().split(/\s+/).filter(w => w).length;

  const handleSubmit = async () => {
    if (wordCount < 300) {
      setError(`Review must be at least 300 words. Current: ${wordCount} words`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${API}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          rating: rating,
          review_text: reviewText
        })
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to submit review');
      }
    } catch (err) {
      setError('Error submitting review');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="modal-content" style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Get Unlimited FREE Access! ⭐</h2>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Leave a 5-star review (300+ words) and get DROP for FREE forever!
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            {[1,2,3,4,5].map(star => (
              <Star
                key={star}
                size={32}
                fill={star <= rating ? '#FFD700' : 'none'}
                stroke={star <= rating ? '#FFD700' : '#ccc'}
                style={{ cursor: 'pointer' }}
                onClick={() => setRating(star)}
              />
            ))}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#666' }}>Must be 5 stars for free access</p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Write your 300+ word review here... Tell us what you love about DROP!"
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '1rem',
              border: '2px solid #ddd',
              borderRadius: '8px',
              fontSize: '1rem',
              resize: 'vertical'
            }}
          />
          <p style={{ 
            fontSize: '0.875rem', 
            color: wordCount >= 300 ? 'green' : '#666',
            marginTop: '0.5rem'
          }}>
            Word count: {wordCount} / 300 {wordCount >= 300 && '✓'}
          </p>
        </div>

        {error && (
          <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || rating !== 5 || wordCount < 300}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: rating === 5 && wordCount >= 300 ? '#667eea' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: rating === 5 && wordCount >= 300 ? 'pointer' : 'not-allowed',
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit & Get FREE Access'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
