import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
} from "remotion";

interface IceAlarmVideoProps {
  headline: string;
  bullets: string[];
  ctaText: string;
  contactLine: string;
  logoUrl: string | null;
  primaryColor: string;
  duration: number;
  format: string;
  language: string;
}

export const IceAlarmVideo: React.FC<IceAlarmVideoProps> = ({
  headline,
  bullets,
  ctaText,
  contactLine,
  logoUrl,
  primaryColor,
  duration,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Calculate segment timings
  const headlineEnd = Math.floor(durationInFrames * 0.15);
  const bulletDuration = Math.floor((durationInFrames * 0.7) / Math.max(bullets.length, 1));
  const ctaStart = durationInFrames - Math.floor(fps * 3);

  // Background gradient
  const gradientStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${primaryColor}22 0%, #1a1a2e 50%, ${primaryColor}11 100%)`,
  };

  return (
    <AbsoluteFill style={gradientStyle}>
      {/* Logo watermark */}
      {logoUrl && (
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            opacity: 0.9,
          }}
        >
          <Img src={logoUrl} style={{ height: 60, objectFit: "contain" }} />
        </div>
      )}

      {/* Headline Section */}
      <Sequence from={0} durationInFrames={headlineEnd}>
        <HeadlineSection
          headline={headline}
          primaryColor={primaryColor}
          width={width}
          height={height}
        />
      </Sequence>

      {/* Bullet Points */}
      {bullets.map((bullet, index) => {
        const bulletStart = headlineEnd + index * bulletDuration;
        return (
          <Sequence
            key={index}
            from={bulletStart}
            durationInFrames={bulletDuration}
          >
            <BulletSection
              bullet={bullet}
              index={index}
              primaryColor={primaryColor}
              width={width}
              height={height}
            />
          </Sequence>
        );
      })}

      {/* CTA Section */}
      <Sequence from={ctaStart} durationInFrames={durationInFrames - ctaStart}>
        <CTASection
          ctaText={ctaText}
          contactLine={contactLine}
          primaryColor={primaryColor}
          width={width}
          height={height}
        />
      </Sequence>

      {/* Bottom bar with branding */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          backgroundColor: primaryColor,
        }}
      />
    </AbsoluteFill>
  );
};

// Headline component with animation
const HeadlineSection: React.FC<{
  headline: string;
  primaryColor: string;
  width: number;
  height: number;
}> = ({ headline, primaryColor, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 200, mass: 0.5 },
  });

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "10%",
      }}
    >
      <h1
        style={{
          fontSize: Math.min(width, height) * 0.08,
          fontWeight: 800,
          color: "white",
          textAlign: "center",
          textShadow: `0 4px 30px ${primaryColor}66`,
          transform: `scale(${scale})`,
          opacity,
          fontFamily: "system-ui, -apple-system, sans-serif",
          lineHeight: 1.2,
        }}
      >
        {headline}
      </h1>
    </AbsoluteFill>
  );
};

// Bullet point component
const BulletSection: React.FC<{
  bullet: string;
  index: number;
  primaryColor: string;
  width: number;
  height: number;
}> = ({ bullet, index, primaryColor, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame,
    fps,
    config: { damping: 80, stiffness: 150, mass: 0.8 },
  });

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Alternate slide direction
  const translateX = (1 - slideIn) * (index % 2 === 0 ? -100 : 100);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "10%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          transform: `translateX(${translateX}px)`,
          opacity,
        }}
      >
        {/* Bullet marker */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: primaryColor,
            flexShrink: 0,
          }}
        />
        <p
          style={{
            fontSize: Math.min(width, height) * 0.05,
            fontWeight: 600,
            color: "white",
            margin: 0,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {bullet}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// CTA component
const CTASection: React.FC<{
  ctaText: string;
  contactLine: string;
  primaryColor: string;
  width: number;
  height: number;
}> = ({ ctaText, contactLine, primaryColor, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 60, stiffness: 100, mass: 1 },
  });

  const pulse = Math.sin(frame * 0.15) * 0.05 + 1;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "10%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          transform: `scale(${scale * pulse})`,
        }}
      >
        {/* CTA Button */}
        <div
          style={{
            backgroundColor: primaryColor,
            padding: "24px 64px",
            borderRadius: 16,
            boxShadow: `0 8px 40px ${primaryColor}88`,
          }}
        >
          <span
            style={{
              fontSize: Math.min(width, height) * 0.06,
              fontWeight: 800,
              color: "white",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {ctaText}
          </span>
        </div>

        {/* Contact line */}
        {contactLine && (
          <span
            style={{
              fontSize: Math.min(width, height) * 0.035,
              fontWeight: 500,
              color: "white",
              opacity: 0.9,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {contactLine}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
