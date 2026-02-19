"use client";

import { useRef, useEffect, useState } from "react";

interface StickyScrollItem {
  title: string;
  description: string;
  content?: React.ReactNode;
  color_bg: string;
  color_text: string;
  rotate: number;
}

interface StickyScrollProps {
  content: StickyScrollItem[];
}

export const StickyScroll = ({ content }: StickyScrollProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      // Use requestAnimationFrame for smooth updates
      if (rafRef.current) return;
      
      rafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const containerHeight = rect.height;
        
        // Calculate progress through the section
        const scrolled = -rect.top;
        const scrollable = containerHeight - windowHeight;
        const newProgress = Math.max(0, Math.min(1, scrolled / scrollable));
        
        // Only update if progress changed significantly (reduces re-renders)
        if (Math.abs(newProgress - lastScrollRef.current) > 0.001) {
          lastScrollRef.current = newProgress;
          setProgress(newProgress);
        }
        
        rafRef.current = null;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative h-[350vh] bg-transparent"
    >
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        <div className="relative w-full max-w-4xl px-4">
          {content.map((item, index) => (
             <Card 
                key={index} 
                item={item} 
                index={index} 
                progress={progress}
             />
          ))}
        </div>
      </div>
    </div>
  );
};

const Card = ({
  item,
  index,
  progress,
}: {
  item: StickyScrollItem;
  index: number;
  progress: number;
}) => {
  // Calculate card state based on scroll progress
  const rangeStart = index === 0 ? 0 : 0.2 + (index - 1) * 0.35;
  const rangeEnd = index === 0 ? 0 : rangeStart + 0.25;
  
  // Calculate interpolated values
  let opacity = 1;
  let scale = 1;
  let y = 0;
  
  if (index > 0) {
    // Clamp progress to range
    const clampedProgress = Math.max(rangeStart, Math.min(rangeEnd, progress));
    const localProgress = (clampedProgress - rangeStart) / (rangeEnd - rangeStart);
    
    // Smooth easing
    const easedProgress = easeOutCubic(localProgress);
    
    opacity = Math.max(0, Math.min(1, localProgress * 10)); // Quick fade in
    scale = 0.9 + (easedProgress * 0.1);
    y = 400 - (easedProgress * 400);
  }

  return (
    <div
      style={{
        opacity, 
        transform: `translateY(${y}px) scale(${scale}) rotate(${item.rotate}deg) translateZ(0)`,
        zIndex: index,
        willChange: index === 0 ? 'auto' : 'transform, opacity',
      }}
      className={`absolute top-0 left-0 w-full p-8 md:p-12 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] rounded-sm origin-top ${item.color_bg} ${item.color_text}`}
    >
        {item.content}
    </div>
  );
};

// Smooth easing function
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
