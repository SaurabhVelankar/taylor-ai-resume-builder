import { BackgroundAura } from "@/components/BackgroundAura";
import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <BackgroundAura />
      <div className="relative z-10">
        <Workbench />
      </div>
    </main>
  );
}
