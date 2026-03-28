"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";

function useGlitchText(text: string, active: boolean) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      return;
    }
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const glitched = text
        .split("")
        .map((ch, i) => {
          if (ch === " ") return " ";
          if (Math.random() < 0.15 && frame < 20) {
            return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          }
          return ch;
        })
        .join("");
      setDisplay(glitched);
      if (frame > 25) {
        setDisplay(text);
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [text, active]);

  return display;
}

export default function LandingPage() {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [booted, setBooted] = useState(false);

  const title = useGlitchText("GLITCH.EXE", hovered);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="retro-desktop min-h-screen pb-14 flex flex-col">
      {/* Titlebar */}
      <div className="retro-shell sticky top-0 z-50 border-b-2 border-black/50">
        <div className="retro-titlebar px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="retro-led" />
            <span className="font-bold tracking-wide uppercase">
              GLITCH.EXE :: BOOT SEQUENCE
            </span>
          </div>
          <div className="text-xs font-bold">
            {now.toLocaleDateString()} {now.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div
          className={`transition-all duration-700 ${booted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          {/* Logo window */}
          <div className="retro-window max-w-[620px] w-full mx-auto">
            <div className="retro-titlebar retro-titlebar-hot px-3 py-1.5 flex items-center justify-between">
              <span className="font-bold">System :: Welcome</span>
              <span className="text-[11px] blink">v95.1</span>
            </div>

            <div className="retro-window-body text-center space-y-6 py-8">
              {/* Big title with glitch effect */}
              <h1
                className="text-5xl font-black tracking-tight leading-none select-none"
                style={{ fontFamily: "'Lucida Console', 'Courier New', monospace" }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {title}
              </h1>

              <p className="text-sm font-bold uppercase tracking-widest text-[#000080]">
                Codebase Brain Scanner
              </p>

              {/* Description panel */}
              <div className="retro-panel-inset p-4 text-left mx-4">
                <p className="text-[13px] leading-relaxed">
                  Drop a public GitHub repo and GLITCH breaks it down like a
                  classic hacker toy: <strong>repo map</strong>,{" "}
                  <strong>cross-file connections</strong>,{" "}
                  <strong>live AI explainers</strong>, and{" "}
                  <strong>starter issues</strong> — all tuned to your skill
                  level.
                </p>
              </div>

              {/* Feature bullets */}
              <div className="grid grid-cols-2 gap-2 mx-4">
                {[
                  { icon: ">>", label: "Parses imports, exports & calls" },
                  { icon: "::", label: "AI summaries per file" },
                  { icon: "##", label: "Dependency tree visualization" },
                  { icon: "!!", label: "Issues ranked by difficulty" },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="retro-panel-inset p-2 text-left flex items-start gap-2"
                  >
                    <span
                      className="text-[#000080] font-bold text-xs shrink-0 mt-px"
                      style={{ fontFamily: "'Lucida Console', monospace" }}
                    >
                      {f.icon}
                    </span>
                    <span className="text-[12px] leading-snug">{f.label}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <div className="pt-2">
                <button
                  onClick={() => router.push("/analyze")}
                  className="retro-button retro-button-primary text-lg px-10 py-3 tracking-wider"
                >
                  LAUNCH ANALYZER
                </button>
              </div>

              <p className="text-[11px] text-[#555] uppercase tracking-wide">
                Junior / Mid / Senior skill modes available
              </p>
            </div>
          </div>

          {/* Bottom info posters */}
          <div className="max-w-[620px] mx-auto mt-6 grid grid-cols-3 gap-3">
            <div className="retro-poster" style={{ background: "#fffacd" }}>
              <h3>How?</h3>
              <p>
                Paste a URL. We fetch the code, parse the AST, and stream AI
                explanations live.
              </p>
            </div>
            <div className="retro-poster" style={{ background: "#d4f5ff" }}>
              <h3>Why?</h3>
              <p>
                Onboard to unknown repos in minutes instead of hours. Zero
                setup required.
              </p>
            </div>
            <div className="retro-poster" style={{ background: "#ffd4e8" }}>
              <h3>Who?</h3>
              <p>
                Built for devs joining new teams, reviewing OSS, or exploring
                codebases for fun.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Taskbar */}
      <div className="retro-taskbar">
        <div className="retro-task-start">Start</div>
        <div className="retro-task-item">GLITCH.EXE</div>
        <div className="retro-task-clock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
