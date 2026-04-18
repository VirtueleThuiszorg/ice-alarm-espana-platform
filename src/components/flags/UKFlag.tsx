import { cn } from "@/lib/utils";

interface UKFlagProps {
  className?: string;
}

export function UKFlag({ className }: UKFlagProps) {
  return (
    <svg
      viewBox="0 0 60 30"
      className={cn("w-full h-full", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Blue background */}
      <clipPath id="ukClip">
        <rect width="60" height="30" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      
      {/* White diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      
      {/* Red diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      
      {/* White cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      
      {/* Red cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
