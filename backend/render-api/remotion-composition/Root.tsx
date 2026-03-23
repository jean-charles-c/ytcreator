/**
 * Root — Remotion composition registration.
 * The "video-prompt" composition renders a single video segment
 * from structured VideoPrompt data passed as inputProps.
 */
import React from "react";
import { Composition } from "remotion";
import { VideoPromptComposition } from "./VideoPromptComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="video-prompt"
        component={VideoPromptComposition}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: "Default scene",
          sceneTitle: "Untitled",
          style: "cinematic",
          mood: "",
          durationSec: 5,
          aspectRatio: "16:9",
          cameraMovement: "static",
          sceneMotion: "moderate",
          narrativeFragment: "",
        }}
        calculateMetadata={({ props }) => {
          const fps = 30;
          const dur = Math.max(1, Math.min(60, props.durationSec || 5));
          const w = props.aspectRatio === "9:16" ? 1080
            : props.aspectRatio === "1:1" ? 1080
            : props.aspectRatio === "4:3" ? 1440
            : props.aspectRatio === "21:9" ? 2520
            : 1920;
          const h = props.aspectRatio === "9:16" ? 1920
            : props.aspectRatio === "1:1" ? 1080
            : props.aspectRatio === "4:3" ? 1080
            : props.aspectRatio === "21:9" ? 1080
            : 1080;
          return {
            durationInFrames: dur * fps,
            fps,
            width: w,
            height: h,
          };
        }}
      />
    </>
  );
};
