import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";
import { TIMEOUTS } from "@/config/constants";

type StaffRole = "super_admin" | "admin" | "call_centre_supervisor" | "call_centre" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isStaff: boolean;
  staffRole: StaffRole;
  isSupervisor: boolean;
  memberId: string | null;
  partnerId: string | null;
  isPartner: boolean;
  roleLoadFailed: boolean;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  retryRoleLoad: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isPartner, setIsPartner] = useState(false);
  const [roleLoadFailed, setRoleLoadFailed] = useState(false);
  
  // Prevent duplicate role fetches
  const fetchInProgress = useRef(false);
  const lastFetchedUserId = useRef<string | null>(null);

  // Timeout for role fetch - 8s to prevent premature failures on slow connections
  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Role fetch timed out after ${ms}ms`)), ms)
      ),
    ]);
  };
  
  const ROLE_FETCH_TIMEOUT = TIMEOUTS.ROLE_FETCH;

  const fetchUserRole = async (userId: string) => {
    // Prevent duplicate fetches for the same user
    if (fetchInProgress.current && lastFetchedUserId.current === userId) {
      return;
    }
    
    // Clear previous role state first to avoid stale data when switching accounts
    setIsStaff(false);
    setStaffRole(null);
    setMemberId(null);
    setPartnerId(null);
    setIsPartner(false);
    setRoleLoadFailed(false);
    
    fetchInProgress.current = true;
    lastFetchedUserId.current = userId;

    try {
      // Single RPC call to get all role info - replaces 5 separate calls
      const { data, error } = await supabase.rpc("get_user_role_info", { _user_id: userId });

      if (error) throw error;

      const roleInfo = data as {
        is_staff: boolean;
        staff_role: StaffRole;
        is_partner: boolean;
        partner_id: string | null;
        member_id: string | null;
      };

      // Set Sentry user context for error tracking
      setSentryUser({
        id: userId,
        role: roleInfo.is_staff ? (roleInfo.staff_role || "staff") : roleInfo.is_partner ? "partner" : "member",
      });

      if (roleInfo.is_staff && roleInfo.staff_role) {
        setIsStaff(true);
        setStaffRole(roleInfo.staff_role);
        // Preserve memberId too for dual-role accounts (staff + member)
        // so staff users can still access member-facing pages like /dashboard/profile.
        setMemberId(roleInfo.member_id ?? null);
        // Preserve partner data if user holds both staff AND partner roles
        if (roleInfo.is_partner && roleInfo.partner_id) {
          setPartnerId(roleInfo.partner_id);
          setIsPartner(true);
        } else {
          setPartnerId(null);
          setIsPartner(false);
        }
        return;
      }

      if (roleInfo.is_partner && roleInfo.partner_id) {
        setPartnerId(roleInfo.partner_id);
        setIsPartner(true);
        setIsStaff(false);
        setStaffRole(null);
        setMemberId(null);
        return;
      }

      if (roleInfo.member_id) {
        setMemberId(roleInfo.member_id);
        setIsStaff(false);
        setStaffRole(null);
        setPartnerId(null);
        setIsPartner(false);
        return;
      }

      // User exists but is neither staff, partner, nor member yet
    } catch (error) {
      console.error("Error fetching user role:", error);
      setRoleLoadFailed(true);
    } finally {
      fetchInProgress.current = false;
    }
  };

  const refreshAuth = async () => {
    setRoleLoadFailed(false);
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      try {
        await withTimeout(fetchUserRole(session.user.id), ROLE_FETCH_TIMEOUT);
      } catch (e) {
        console.error("[AuthContext] Role fetch failed on refresh:", e);
        setRoleLoadFailed(true);
      }
    }
  };

  const retryRoleLoad = async () => {
    if (user) {
      setIsLoading(true);
      setRoleLoadFailed(false);
      try {
        await withTimeout(fetchUserRole(user.id), ROLE_FETCH_TIMEOUT);
      } catch (e) {
        console.error("[AuthContext] Role fetch failed on retry:", e);
        setRoleLoadFailed(true);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let initialFetchDone = false;

    // Get initial session FIRST, then set up listener
    const initializeAuth = async () => {
      setIsLoading(true);
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          try {
            await withTimeout(fetchUserRole(session.user.id), ROLE_FETCH_TIMEOUT);
          } catch (e) {
            console.error("[AuthContext] Initial role fetch failed:", e);
            if (isMounted) setRoleLoadFailed(true);
          }
        }
      } catch (e) {
        console.error("[AuthContext] Session fetch failed:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          initialFetchDone = true;
        }
      }
    };

    // Initialize auth first
    initializeAuth();

    // Set up auth state listener AFTER initial fetch starts
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        // Skip INITIAL_SESSION and early events before our initial fetch completes
        if (event === 'INITIAL_SESSION') {
          return;
        }

        // For SIGNED_IN during initial load, skip if we're already handling it
        if (event === 'SIGNED_IN' && !initialFetchDone) {
          return;
        }

        // Handle actual auth changes after initial load
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Only refetch if this is a NEW sign-in (not the initial one)
          if (session?.user && session.user.id !== lastFetchedUserId.current) {
            setIsLoading(true);
            setSession(session);
            setUser(session?.user ?? null);

            try {
              await withTimeout(fetchUserRole(session.user.id), ROLE_FETCH_TIMEOUT);
            } catch (e) {
              console.error("[AuthContext] Role fetch failed:", e);
              if (isMounted) setRoleLoadFailed(true);
            }
            
            if (isMounted) {
              setIsLoading(false);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setIsStaff(false);
          setStaffRole(null);
          setMemberId(null);
          setPartnerId(null);
          setIsPartner(false);
          setIsLoading(false);
          lastFetchedUserId.current = null;
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearSentryUser();
    setUser(null);
    setSession(null);
    setIsStaff(false);
    setStaffRole(null);
    setMemberId(null);
    setPartnerId(null);
    setIsPartner(false);
    setRoleLoadFailed(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isStaff,
        staffRole,
        isSupervisor: staffRole === "call_centre_supervisor" || staffRole === "admin" || staffRole === "super_admin",
        memberId,
        partnerId,
        isPartner,
        roleLoadFailed,
        signOut: handleSignOut,
        refreshAuth,
        retryRoleLoad,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
