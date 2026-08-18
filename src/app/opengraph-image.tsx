import { ImageResponse } from "next/og";

// Next picks this up automatically for both og:image and twitter:image.
export const alt = "OrbitOS — The Calm Control Center for Digital Studios";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#050505",
          backgroundImage:
            "radial-gradient(1000px circle at 50% -20%, rgba(255,255,255,0.07), transparent 60%)",
          padding: "72px",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              backgroundColor: "#151515",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          />
          <div style={{ fontSize: "30px", color: "#ededed", letterSpacing: "-0.03em" }}>
            OrbitOS
          </div>
        </div>

        {/* Headline block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "17px",
              letterSpacing: "0.32em",
              color: "#666666",
              marginBottom: "28px",
            }}
          >
            STUDIO OPERATIONS
          </div>
          <div
            style={{
              fontSize: "78px",
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              color: "#ededed",
              maxWidth: "930px",
            }}
          >
            The Calm Control Center for Digital Studios.
          </div>
        </div>

        {/* Footer rule */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              width: "100%",
              height: "1px",
              backgroundColor: "rgba(255,255,255,0.09)",
              marginBottom: "26px",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              fontSize: "19px",
              color: "#7c7c7c",
            }}
          >
            <div>Know what needs attention, what&apos;s at risk, and who&apos;s working on what.</div>
            <div style={{ letterSpacing: "0.14em" }}>orbit-os.co.za</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
