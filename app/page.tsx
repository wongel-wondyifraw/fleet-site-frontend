import { DesktopLogin } from "@/components/login/DesktopLogin";
import { LoginRedirectGate } from "@/components/login/LoginRedirectGate";
import { MobileLogin } from "@/components/login/MobileLogin";

export default function Home() {
  return (
    <LoginRedirectGate>
      <MobileLogin />
      <DesktopLogin />
    </LoginRedirectGate>
  );
}
