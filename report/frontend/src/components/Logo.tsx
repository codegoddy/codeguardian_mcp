import React from "react";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark";
}

export const Logo = ({ className = "", variant = "light" }: LogoProps) => {
  const isDark = variant === "dark";
  
  return (
    <div className={`flex items-center gap-3 group ${className}`}>
      {/* Icon: The Isometric Voxel (Building Block / Value Unit) */}
      <div className="relative w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
        <svg width="100%" height="100%" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 drop-shadow-lg">
          {/* Right Face */}
          <path d="M20 40V22L36 13V31L20 40Z" fill={isDark ? "#666666" : "#111111"} />
          
          {/* Left Face */}
          <path d="M20 40L4 31V13L20 22V40Z" fill={isDark ? "#888888" : "black"} />
          
          {/* Top Face (Lime - Brightest) */}
          <path d="M20 22L36 13L20 4L4 13L20 22Z" fill="#ccff00" className="group-hover:brightness-110 transition-all"/>
        </svg>
      </div>
      
      {/* Text: DevHQ */}
      <div className="flex flex-col leading-none">
        <span className={`font-black text-xl tracking-tighter uppercase ${isDark ? "text-white" : "text-black"}`}>
          DevHQ
        </span>
      </div>
    </div>
  );
};
