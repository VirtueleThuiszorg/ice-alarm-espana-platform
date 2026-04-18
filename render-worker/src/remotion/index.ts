import { registerRoot } from "remotion";
import { IceAlarmVideo } from "./IceAlarmVideo";
import { Composition } from "remotion";

// Root component that registers all compositions
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="IceAlarmVideo"
        component={IceAlarmVideo}
        durationInFrames={450} // 15 seconds at 30fps (default)
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          headline: "ICE Alarm España",
          bullets: ["24/7 Emergency Response", "GPS Location Tracking", "Fall Detection"],
          ctaText: "Call Now",
          contactLine: "+34 900 123 456",
          logoUrl: null,
          primaryColor: "#E63946",
          duration: 15,
          format: "16:9",
          language: "en",
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
