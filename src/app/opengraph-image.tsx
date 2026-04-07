/**
 * =============================================================================
 * 文件定位（全局 OG 图 - FG-13）
 * -----------------------------------------------------------------------------
 * 路径：src/app/opengraph-image.tsx
 *
 * 此文件使用 Next.js ImageResponse 生成站点级默认 Open Graph 图片。
 * 当页面没有提供自己的 OG 图片时，将回退到此全局 OG 图。
 * =============================================================================
 */
import { ImageResponse } from "next/og";

/** 生成 OG 图片的尺寸规格（1200x630 是标准 OG 规格）。 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * 生成全局默认 OG 图片。
 * 样式：深色背景 + 站点名称 + 副标题，符合文渊品牌调性。
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display       : "flex",
          flexDirection : "column",
          alignItems    : "center",
          justifyContent: "center",
          width         : "100%",
          height        : "100%",
          background    : "linear-gradient(135deg, #0f111a 0%, #1a1d2e 50%, #0f111a 100%)",
          color         : "#e2e8f0"
        }}
      >
        {/* 站点标志文字 */}
        <div
          style={{
            fontSize     : 120,
            fontWeight   : "bold",
            marginBottom : 24,
            color        : "#7c3aed",
            letterSpacing: "-0.02em"
          }}
        >
          淵
        </div>
        {/* 站点名称 */}
        <div
          style={{
            fontSize    : 64,
            fontWeight  : "bold",
            marginBottom: 16,
            color       : "#e2e8f0"
          }}
        >
          文渊
        </div>
        {/* 副标题 */}
        <div
          style={{
            fontSize: 28,
            color   : "#94a3b8"
          }}
        >
          AI 古典文学人物关系图谱
        </div>
      </div>
    ),
    { ...size }
  );
}
