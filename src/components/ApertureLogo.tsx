import React from 'react';

interface ApertureLogoProps {
  variant?: 'full' | 'horizontal' | 'iconOnly' | 'stacked';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
  showSubtitle?: boolean;
}

export const ApertureLogoMark: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Aperture Logo Mark"
    >
      {/* Left leg of A */}
      <polygon
        points="52,14 12,106 32,106 62,37"
        fill="#1247A8"
      />
      
      {/* Right leg of A */}
      <polygon
        points="68,14 108,106 88,106 58,37"
        fill="#1247A8"
      />

      {/* Top Peak Join */}
      <polygon
        points="52,14 68,14 60,0"
        fill="#103F96"
      />

      {/* Faceted Translucent Cyan/Sky Prism Crossbar */}
      {/* Top facet */}
      <polygon
        points="38,62 82,62 90,70 30,70"
        fill="#A6C8F5"
        opacity="0.95"
      />
      {/* Lower angled facet with light refraction */}
      <polygon
        points="30,70 90,70 82,78 40,78"
        fill="#7CAAF0"
        opacity="0.9"
      />
      {/* Highlight edge */}
      <line
        x1="38"
        y1="62"
        x2="82"
        y2="62"
        stroke="#D4E5FC"
        strokeWidth="1.5"
      />
    </svg>
  );
};

export default function ApertureLogo({
  variant = 'horizontal',
  size = 'md',
  className = '',
  theme = 'auto',
  showSubtitle = false
}: ApertureLogoProps) {
  // Dimensions map
  const markDimensions = {
    xs: 20,
    sm: 26,
    md: 34,
    lg: 44,
    xl: 60
  };

  const titleSizes = {
    xs: 'text-xs tracking-[0.25em]',
    sm: 'text-sm tracking-[0.28em]',
    md: 'text-lg tracking-[0.3em]',
    lg: 'text-2xl tracking-[0.32em]',
    xl: 'text-3xl tracking-[0.35em]'
  };

  const subtitleSizes = {
    xs: 'text-[7px] tracking-[0.32em]',
    sm: 'text-[8.5px] tracking-[0.35em]',
    md: 'text-[10px] tracking-[0.38em]',
    lg: 'text-xs tracking-[0.4em]',
    xl: 'text-sm tracking-[0.42em]'
  };

  if (variant === 'iconOnly') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <ApertureLogoMark size={markDimensions[size]} />
      </div>
    );
  }

  const isDarkCanvas = theme === 'dark';
  const textColor = isDarkCanvas 
    ? 'text-white' 
    : theme === 'light' 
      ? 'text-[#1247A8]' 
      : 'text-[#1247A8] dark:text-white';

  const subtitleColor = isDarkCanvas 
    ? 'text-slate-300' 
    : theme === 'light' 
      ? 'text-[#1B4B9E]' 
      : 'text-[#1B4B9E] dark:text-sky-300';

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        <ApertureLogoMark size={markDimensions[size] * 1.3} className="mb-2" />
        <div className={`font-black font-sans uppercase font-stretch-expanded ${titleSizes[size]} ${textColor} leading-none`}>
          APERTURE
        </div>
        {showSubtitle && (
          <div className={`font-bold font-sans uppercase ${subtitleSizes[size]} ${subtitleColor} mt-1 leading-tight`}>
            VENTURE STUDIO
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      <ApertureLogoMark size={markDimensions[size]} />
      <div className="flex flex-col justify-center">
        <span className={`font-black font-sans uppercase font-stretch-expanded ${titleSizes[size]} ${textColor} leading-none drop-shadow-2xs`}>
          APERTURE
        </span>
        {showSubtitle && (
          <span className={`font-bold font-sans uppercase ${subtitleSizes[size]} ${subtitleColor} mt-0.5 leading-tight font-mono`}>
            VENTURE STUDIO
          </span>
        )}
      </div>
    </div>
  );
}
