"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import { authenticatedApiCall } from "../../../../services/auth";

function GoogleCalendarCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        console.error("OAuth error:", error);
        router.push(`/integrations?error=${encodeURIComponent(error)}`);
        return;
      }

      if (!code) {
        router.push("/integrations?error=No authorization code received");
        return;
      }

      try {
        // Call backend to complete OAuth flow
        const response = await authenticatedApiCall(
          `/api/integrations/google-calendar/callback?code=${code}&state=${state}`,
          { method: "GET" }
        );

        if (response.success) {
          router.push("/integrations?success=true");
        } else {
          router.push(
            `/integrations?error=${encodeURIComponent(
              response.error || "Failed to connect Google Calendar"
            )}`
          );
        }
      } catch (err) {
        console.error("Failed to complete Google Calendar OAuth:", err);
        router.push(
          "/integrations?error=Failed to connect Google Calendar"
        );
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600">Connecting Google Calendar...</p>
      </div>
    </div>
  );
}

export default function GoogleCalendarCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <GoogleCalendarCallbackContent />
    </Suspense>
  );
}
