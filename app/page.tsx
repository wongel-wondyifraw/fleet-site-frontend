import { DesktopLogin } from "@/components/login/DesktopLogin";
import { MobileLogin } from "@/components/login/MobileLogin";

export default function Home() {
  return (
    <>
      <MobileLogin />
      <DesktopLogin />
    </>
  );
}
