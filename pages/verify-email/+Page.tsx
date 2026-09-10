import AnimatedContent from "#root/components/utils/AnimatedContent";
import { Button } from "#root/components/ui/button.jsx";
import { useState, useEffect } from "react";
import { authClient } from "#root/lib/auth-client";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "#root/hooks/useSearchParams";

export default function Page() {
  const [verificationStatus, setVerificationStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const params = useSearchParams();

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const token = params.get("token");
        if (!token) {
          setVerificationStatus("error");
          setErrorMessage("Missing verification token");
          return;
        }

        const result = await authClient.verifyEmail({ query: { token } });
        if (result.data) {
          setVerificationStatus("success");
        } else {
          setVerificationStatus("error");
          setErrorMessage(result.error?.message || "Verification failed");
        }
      } catch (error) {
        setVerificationStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during verification",
        );
      }
    };

    verifyEmail();
  }, [params]);

  return (
    <section className='w-full min-h-[90vh] flex justify-center items-center'>
      <AnimatedContent
        distance={100}
        direction='vertical'
        reverse={false}
        config={{ tension: 60, friction: 30 }}
        initialOpacity={0}
        animateOpacity
        scale={1}
        threshold={0.1}>
        <div className='w-full max-w-md p-8 bg-white rounded-lg shadow-md'>
          {verificationStatus === "loading" && (
            <div className='flex flex-col items-center justify-center py-8'>
              <Loader2 className='h-16 w-16 text-[#1B4571] animate-spin mb-4' />
              <h1 className='text-2xl font-bold text-center'>
                Verifying Your Email
              </h1>
              <p className='text-gray-500 text-center mt-2'>
                Please wait while we verify your email address...
              </p>
            </div>
          )}

          {verificationStatus === "success" && (
            <div className='flex flex-col items-center justify-center py-8'>
              <CheckCircle className='h-16 w-16 text-green-500 mb-4' />
              <h1 className='text-2xl font-bold text-center text-[#1B4571]'>
                Email Verified Successfully!
              </h1>
              <p className='text-gray-500 text-center mt-2 mb-6'>
                Your email has been verified. You can now log in to your account
                and access all features of Percé.
              </p>
              <Button className='w-full bg-[#1B4571] hover:bg-[#1B4571]/90'>
                <a href='/login'>Continue to Login</a>
              </Button>
            </div>
          )}

          {verificationStatus === "error" && (
            <div className='flex flex-col items-center justify-center py-8'>
              <XCircle className='h-16 w-16 text-red-500 mb-4' />
              <h1 className='text-2xl font-bold text-center text-red-600'>
                Verification Failed
              </h1>
              <p className='text-gray-500 text-center mt-2 mb-6'>
                {errorMessage ||
                  "We couldn't verify your email. The verification link may be invalid or expired."}
              </p>
              <Button className='w-full bg-[#1B4571] hover:bg-[#1B4571]/90'>
                <a href='/login'>Return to Login</a>
              </Button>
            </div>
          )}
        </div>
      </AnimatedContent>
    </section>
  );
}
