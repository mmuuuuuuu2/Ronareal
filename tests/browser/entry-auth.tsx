import { createRoot } from "react-dom/client";
import AuthLayout from "@/app/(auth)/layout";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { OnboardingForm } from "@/components/auth/onboarding-form";

const which = new URLSearchParams(location.search).get("f");
const form = which === "register" ? <RegisterForm /> : which === "onboarding" ? <OnboardingForm /> : <LoginForm next="/dashboard" />;
createRoot(document.getElementById("root")!).render(<AuthLayout>{form}</AuthLayout>);
