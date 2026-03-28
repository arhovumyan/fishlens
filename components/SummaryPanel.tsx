"use client";
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SummaryPanelProps {
  summary: string;
  streaming: boolean;
}

export default function SummaryPanel({ summary, streaming }: SummaryPanelProps) {
  // Parse sections based on "###" pattern introduced by prompt
  const sections = useMemo(() => {
    if (!summary) return [];
    
    const parts = summary.split(/\n?###\s+/);
    
    return parts
      .filter(part => part.trim().length > 0)
      .map(part => {
        const lines = part.trim().split('\n');
        const title = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();
        return { title, content };
      });
  }, [summary]);

  if (!summary && !streaming) return null;

  const styleMaps: Record<string, { bg: string, text: string, shadow: string, border: string }> = {
    "Architecture": { 
        bg: "bg-fuchsia-500/5", 
        border: "border-fuchsia-500/30",
        text: "text-fuchsia-400", 
        shadow: "hover:shadow-[0_10px_30px_-10px_rgba(217,70,239,0.4)]" 
    },
    "Tech Stack": { 
        bg: "bg-cyan-500/5", 
        border: "border-cyan-500/30",
        text: "text-cyan-400", 
        shadow: "hover:shadow-[0_10px_30px_-10px_rgba(34,211,238,0.4)]" 
    },
    "Patterns": { 
        bg: "bg-emerald-500/5", 
        border: "border-emerald-500/30",
        text: "text-emerald-400", 
        shadow: "hover:shadow-[0_10px_30px_-10px_rgba(16,185,129,0.4)]" 
    }
  };

  const defaultStyle = { 
      bg: "bg-zinc-800/40", 
      border: "border-zinc-700",
      text: "text-zinc-300", 
      shadow: "hover:shadow-[0_10px_30px_-10px_rgba(255,255,255,0.1)]" 
  };

  return (
    <div className="w-full mt-10 relative z-20">
      <div className="flex flex-row flex-wrap w-full gap-6 py-4 justify-center items-start relative min-h-[140px]">
        {sections.map((section, idx) => {
          let style = defaultStyle;
          const matchedKey = Object.keys(styleMaps).find(k => section.title.includes(k));
          if (matchedKey) style = styleMaps[matchedKey];
          
          return (
            <div key={idx} className="relative w-[220px] h-[100px] shrink-0 group">
              <div 
                className={`absolute top-0 left-1/2 -translate-x-1/2 overflow-hidden rounded-[2.5rem] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] cursor-pointer
                           h-[100px] hover:h-[350px] w-[220px] hover:w-[450px] z-10 hover:z-50
                           border ${style.border} ${style.bg} ${style.shadow} backdrop-blur-xl
                           flex flex-col shadow-lg hover:shadow-2xl bg-[#0b0f19]/80
                `}
              >
                <div className="h-[100px] w-full flex items-center justify-center shrink-0 px-6">
                  <h3 className={`font-mono font-bold tracking-widest uppercase text-sm md:text-base ${style.text} whitespace-nowrap`}>
                    {section.title || "Section"}
                  </h3>
                </div>
                <div className="px-8 pb-8 overflow-y-auto hide-scrollbar flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-150">
                    <div className="prose-glitch prose-sm h-full w-full">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {section.content}
                      </ReactMarkdown>
                    </div>
                </div>
              </div>
            </div>
          );
        })}

        {streaming && sections.length === 0 && (
          <div className="relative w-[220px] h-[100px] shrink-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[100px] w-[220px] rounded-[2.5rem] border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center animate-pulse">
               <span className="font-mono text-emerald-400 text-sm tracking-widest uppercase">Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
