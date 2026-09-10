import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { usePageContext } from "vike-react/usePageContext";

type Role = "admin" | "user" | "vendor" | "superadmin";

interface RoleContextType {
  userRole?: Role;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const pageContext = usePageContext();
  const userRole = pageContext.clientSession?.role;

  return (
    <RoleContext.Provider value={{ userRole }}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
