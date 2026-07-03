'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError('Invalid or missing recovery token');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Password reset failed');
      } else {
        setSuccess('Password updated successfully! Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>New Password</label>
        <div className="input-wrap">
          <i className="fas fa-lock field-icon"></i>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="pass-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex="-1"
          >
            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>Confirm Password</label>
        <div className="input-wrap">
          <i className="fas fa-lock field-icon"></i>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Repeat password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="pass-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex="-1"
          >
            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
          </button>
        </div>
      </div>

      <button type="submit" className="btn-primary" disabled={loading || !token}>
        {loading ? <span className="spinner"></span> : 'Reset Password'}
      </button>

      {error && (
        <div className="form-error" style={{ marginTop: '16px' }}>
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="form-success" style={{ marginTop: '16px' }}>
          <i className="fas fa-check-circle"></i>
          <span>{success}</span>
        </div>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/assets/logo-full.png" alt="OnePWS Logo" />
        </div>
        <h2 className="auth-title">Create New Password</h2>
        <p className="auth-subtitle">Set a secure password for your account</p>

        <Suspense fallback={<p style={{ textAlign: 'center' }}>Loading form...</p>}>
          <ResetPasswordForm />
        </Suspense>

        <p className="auth-link">
          Back to <Link href="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
