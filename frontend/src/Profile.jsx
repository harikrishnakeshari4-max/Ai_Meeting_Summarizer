import { useState } from 'react';
import { useAuth } from './Auth';
import client from './client';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { data } = await client.put("/auth/profile", {
  name: form.name.trim(),
  phone: form.phone.trim(),
});

// Update the local user context using the saved form values.
setUser((prev) => ({
  ...prev,
  name: form.name.trim(),
  phone: form.phone.trim(),
}));

setMessage(
  typeof data === "string"
    ? data
    : "Profile updated successfully."
);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update profile.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="page-container text-white narrow">

      <h2  className="text-center">My Profile</h2>
      <br></br>
      <div className="card text-white">
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>Joined:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
      </div>
      <br></br>

      <form className="card form text-white" onSubmit={handleSubmit}>
        <h3>Edit details</h3>
        {message && <div className="alert-success">{message}</div>}
        {error && <div className="alert-error">{error}</div>}

        <label>Full name</label>
        <input name="name" value={form.name} onChange={handleChange} />

        <label>Phone</label>
        <input name="phone" value={form.phone} onChange={handleChange} />

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
