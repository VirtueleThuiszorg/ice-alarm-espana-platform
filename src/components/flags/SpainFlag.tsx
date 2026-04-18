import { cn } from "@/lib/utils";

interface SpainFlagProps {
  className?: string;
}

export function SpainFlag({ className }: SpainFlagProps) {
  return (
    <svg
      viewBox="0 0 750 500"
      className={cn("w-full h-full", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Red top stripe */}
      <rect width="750" height="125" y="0" fill="#AA151B" />
      
      {/* Yellow middle stripe */}
      <rect width="750" height="250" y="125" fill="#F1BF00" />
      
      {/* Red bottom stripe */}
      <rect width="750" height="125" y="375" fill="#AA151B" />
      
      {/* Simplified coat of arms - centered in yellow band */}
      <g transform="translate(165, 175)">
        {/* Shield outline */}
        <rect x="0" y="0" width="60" height="70" rx="5" fill="#AA151B" stroke="#F1BF00" strokeWidth="3" />
        
        {/* Castle (Castile) */}
        <rect x="10" y="10" width="40" height="25" fill="#F1BF00" />
        <rect x="15" y="5" width="8" height="10" fill="#F1BF00" />
        <rect x="27" y="5" width="8" height="10" fill="#F1BF00" />
        <rect x="39" y="5" width="8" height="10" fill="#F1BF00" />
        
        {/* Crown on top */}
        <rect x="15" y="-10" width="30" height="8" fill="#F1BF00" rx="2" />
        <circle cx="20" cy="-15" r="4" fill="#F1BF00" />
        <circle cx="30" cy="-15" r="4" fill="#F1BF00" />
        <circle cx="40" cy="-15" r="4" fill="#F1BF00" />
      </g>
    </svg>
  );
}
