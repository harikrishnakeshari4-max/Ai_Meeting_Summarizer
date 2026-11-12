import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import client from "./client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!localStorage.getItem("lf_token")) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await client.get("/auth/profile");
      setUser(data.user);
    } catch {
      localStorage.removeItem("lf_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = useCallback(async (email, password, role) => {
    const { data } = await client.post("/auth/login", { email: email.trim().toLowerCase(), password, role });
    localStorage.setItem("lf_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await client.post("/auth/register", payload);
    localStorage.setItem("lf_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("lf_token");
    setUser(null);
  }, []);

  // Memoised so consumers don't re-render on every provider render.
  const value = useMemo(
    () => ({ user, setUser, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export const useAuth = () => useContext(AuthContext);
