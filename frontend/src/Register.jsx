import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './Auth';
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const validate = () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      return 'Name, email, and password are required.';
    }

    if (form.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      return 'Please enter a valid email address.';
    }

    if (form.phone && !/^[0-9]{10}$/.test(form.phone)) {
      return 'Please enter a valid 10-digit phone number.';
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await register({
        ...form,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: 'user',
      });

      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Registration failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container min-vh-100 d-flex align-items-center justify-content-center py-5">
      <div
        className="card shadow-sm border-0"
        style={{ maxWidth: '500px', width: '100%' }}
      >
        <div className="card-body p-4 p-md-5">

          <div className="text-center mb-4">
            <h2 className="text-white ">Create an Account</h2>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* Name */}
            <div className="mb-3">
              <label htmlFor="name" className="form-label fw-semibold">
                Full Name
              </label>

              <input
                id="name"
                type="text"
                name="name"
                className="form-control"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your name"
                autoComplete="name"
              />
            </div>

            {/* Email */}
            <div className="mb-3">
              <label htmlFor="email" className="form-label fw-semibold">
                Email
              </label>

              <input
                id="email"
                type="email"
                name="email"
                className="form-control"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            {/* Phone */}
            <div className="mb-3">
              <label htmlFor="phone" className="form-label fw-semibold">
                Phone
                <span className="text-muted fw-normal"> (optional)</span>
              </label>

              <input
                id="phone"
                type="tel"
                name="phone"
                className="form-control"
                value={form.phone}
                onChange={handleChange}
                placeholder="Enter your pno"
                maxLength="10"
                autoComplete="tel"
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label htmlFor="password" className="form-label fw-semibold">
                Password
              </label>

              <input
                id="password"
                type="password"
                name="password"
                className="form-control"
                value={form.password}
                onChange={handleChange}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />

              <div className="form-text">
                Password must contain at least 6 characters.
              </div>
            </div>

            {/* Register button */}
            <button
              type="submit"
              className="btn btn-primary w-100 py-2"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Creating account...
                </>
              ) : (
                'Register'
              )}
            </button>
          </form>

          <div className="text-center mt-4">
            <p className="text-muted mb-0">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-decoration-none fw-semibold"
              >
                Login here
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

