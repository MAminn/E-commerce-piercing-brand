import type { ClientSession } from "#root/backend/auth/shared/entities.js";
import { createContext } from "react";

export const AuthContext = createContext<{
  session: ClientSession | null;
  logout: () => void;
}>({ session: null, logout: () => {} });
