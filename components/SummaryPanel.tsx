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
    
    // Split by literal "### " maintaining the header text
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

  // Modern styling mappings for specific sections
  const styleMaps: Record<string, { bg: string, text: string, shadow: string, border: string }> = {
    "Architecture": { 
        bg: "bg-fuchsia-500/10", 
        border: "border-fuchsia-500/30",
        text: "text-fuchsia-400", 
        shadow: "hover:shadow-[0_10px_30px_-10px_rgba(217,70,239,0.4)]" 
    },
    "Tech Stack": { 
        bg: "bg-cyan-500/10", 
        border: "border-cyan-500/30",
        text: "text-cyan-400", 
        shadow: "hover:shadow-[0_10px_30px_-10px_rgba(34,211,238,0.4)]" 
    },
    "Patterns": { 
        bg: "bg-emerald-500/10", 
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
    <div className="w-full mt-10">
      
      {/* Container for the horizontal cards */}
      <div className="flex flex-row flex-nowrap w-full overflow-x-auto gap-4 py-4 hide-scrollbar snap-x snap-mandatory pb-8 items-start">
        
        {sections.map((section, idx) => {
          let style = defaultStyle;
          // Attempt fuzzy matching for the style mapping 
          const matchedKey = Object.keys(styleMaps).find(k => section.title.includes(k));
          if (matchedKey) style = styleMaps[matchedKey];
          
          return (
            <div 
              key={idx} 
              className={`group overflow-hidden rounded-full transition-all duration-500 ease-in-out snap-center cursor-pointer flex-shrink-0 flex-grow-0
                         h-[100px] hover:h-[350px] w-[200px] hover:w-[450px] hover:rounded-[2rem]
                         border ${style.border} ${style.bg} ${style.shadow} backdrop-blur-sm
                         flex flex-col
              `}
            >
              {/* Header Box (Always visible) */}
              <div className="h-[100px] w-full flex items-center justify-center flex-shrink-0 px-6">
                <h3 className={`font-mono font-bold tracking-widest uppercase text-sm md:text-base ${style.text} whitespace-nowrap`}>
                  {section.title || "Section"}
                </h3>
              </div>

              {/* Collapsed Content Body (Revealed on hover via fixed height transition) */}
              <div className="px-8 pb-8 overflow-y-auto hide-scrollbar flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-200">
                  <div className="prose-glitch prose-sm h-full w-full">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.content}
                    </ReactMarkdown>
                  </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator Pill */}
        {streaming && sections.length === 0 && (
          <div className="h-[100px] w-[200px] rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center animate-pulse">
             <span className="font-mono text-emerald-400 text-sm tracking-widest uppercase">Loading...</span>
          </div>
        )}
      </div>
    </div>
  );
}
