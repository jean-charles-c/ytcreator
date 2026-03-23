/**
 * VideoPromptComposition — Minimal placeholder composition.
 * Renders a styled card with prompt data. This will be replaced
 * with real video generation logic (image sequences, AI video, etc.)
 * in future iterations.
 */
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface VideoPromptProps {
  prompt: string;
  sceneTitle: string;
  style: string;
  mood: string;
  durationSec: number;
  aspectRatio: string;
  cameraMovement: string;
  sceneMotion: string;
  narrativeFragment: string;
}

export const VideoPromptComposition: React.FC<VideoPromptProps> = ({
  prompt,
  sceneTitle,
  style,
  mood,
  cameraMovement,
  narrativeFragment,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance animation
  const titleY = interpolate(
    spring({ frame, fps, config: { damping: 20, stiffness: 180 } }),
    [0, 1],
    [60, 0],
  );
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const promptOpacity = interpolate(frame, [15, 40], [0, 1], {
    extrapolateRight: "clamp",
  });
  const promptY = interpolate(
    spring({ frame: frame - 10, fps, config: { damping: 25 } }),
    [0, 1],
    [40, 0],
  );

  // Exit animation
  const exitStart = durationInFrames - 20;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle background movement
  const bgX = interpolate(frame, [0, durationInFrames], [0, -30]);
  const bgY = interpolate(frame, [0, durationInFrames], [0, -15]);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        opacity: exitOpacity,
      }}
    >
      {/* Animated background grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.08) 0%, transparent 50%)",
          transform: `translate(${bgX}px, ${bgY}px)`,
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "80px",
        }}
      >
        {/* Scene title */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#e2e8f0",
            fontFamily: "sans-serif",
            textAlign: "center",
            transform: `translateY(${titleY}px)`,
            opacity: titleOpacity,
            marginBottom: 40,
            letterSpacing: "-0.02em",
          }}
        >
          {sceneTitle}
        </div>

        {/* Main prompt text */}
        <div
          style={{
            fontSize: 28,
            color: "#94a3b8",
            fontFamily: "sans-serif",
            textAlign: "center",
            maxWidth: 1200,
            lineHeight: 1.6,
            transform: `translateY(${promptY}px)`,
            opacity: promptOpacity,
          }}
        >
          {prompt}
        </div>

        {/* Metadata badges */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 60,
            opacity: interpolate(frame, [30, 50], [0, 0.7], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {[style, mood, cameraMovement].filter(Boolean).map((tag, i) => (
            <div
              key={i}
              style={{
                fontSize: 18,
                color: "#6366f1",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: 8,
                padding: "8px 20px",
                fontFamily: "monospace",
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* Narrative fragment */}
        {narrativeFragment && (
          <div
            style={{
              fontSize: 20,
              color: "#475569",
              fontFamily: "sans-serif",
              fontStyle: "italic",
              textAlign: "center",
              maxWidth: 1000,
              marginTop: 50,
              opacity: interpolate(frame, [40, 65], [0, 0.6], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            "{narrativeFragment}"
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
