import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './Auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'user'
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const email = form.email.trim().toLowerCase();

    if (!email || !form.password) {
      setError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);

    try {
      await login(email, form.password);
      navigate('/');

    } catch (err) {
      console.error('Login error:', err);

      setError(
        err.response?.data?.message ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container min-vh-100 d-flex align-items-center justify-content-center py-5">

      <div
        className="card shadow-sm border-0 rounded-4"
        style={{ maxWidth: '450px', width: '100%' }}
      >
        <div className="card-body p-4 p-md-5">

          <div className="text-center mb-4">
            <h2 className="fw-bold text-white">Welcome Back</h2>

            <p className="text-white mb-0">
             Meeting Summarizer 
            </p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* Email */}
            <div className="mb-3">

              <label
                htmlFor="email"
                className="form-label fw-semibold"
              >
                Email
              </label>

              <input
                type="email"
                className="form-control form-control-lg"
                id="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="example@gmail.com"
                autoComplete="email"
                required
              />

            </div>

            {/* Password */}
            <div className="mb-4">

              <label
                htmlFor="password"
                className="form-label fw-semibold"
              >
                Password
              </label>

              <input
                type="password"
                className="form-control form-control-lg"
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />

            </div>

            {/* Login */}
            <button
              className="btn btn-primary btn-lg w-100"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                  />
                  Logging in...
                </>
              ) : (
                `Login as ${
                  form.role === 'admin' ? 'Admin' : 'User'
                }`
              )}
            </button>

          </form>

          <p className="text-muted text-center mt-4 mb-0">
            Don't have an account?{' '}

            <Link
              to="/register"
              className="text-decoration-none fw-semibold"
            >
              Register here
            </Link>
          </p>

        </div>
      </div>

    </div>
  );
}