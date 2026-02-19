import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../contexts/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, isInitialized } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if we're initialized, done loading, AND not authenticated
    if (isInitialized && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isInitialized, router]);

   // Wait for authentication initialization to complete (background process)
   if (!isInitialized || isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
         <LoadingSpinner size="md" color="black" />
       </div>
     );
   }

   // Show loading while redirecting if not authenticated
   if (!isAuthenticated) {
     return (
       <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
         <LoadingSpinner size="md" color="black" />
       </div>
     );
   }

   return <>{children}</>;
 }
