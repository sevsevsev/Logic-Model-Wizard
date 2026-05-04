import ChatInterface from "@/components/ChatInterface";
import LogicMirror from "@/components/LogicMirror";

export default function MainLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[linear-gradient(180deg,#f7fbff_0,#eef4f9_100%)]">
      {/* Left pane — Chat */}
      <aside className="w-full max-w-sm min-w-[300px] border-r border-[#9fc3da] flex flex-col shrink-0 shadow-[4px_0_18px_-16px_rgba(11,49,91,.8)] z-10">
        <ChatInterface />
      </aside>

      {/* Right pane — Logic Model Builder */}
      <main className="flex-1 overflow-hidden">
        <LogicMirror />
      </main>
    </div>
  );
}
