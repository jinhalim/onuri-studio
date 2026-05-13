'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@/lib/editor';

const FADE_AFTER_MS = 1500;
const BASE_STROKE_WIDTH = 4;
const MIN_STROKE_WIDTH = 1.5;

export interface RemoteLaserStroke {
  strokeId: string;
  userId: string;
  color: string;
  /** 페이지 좌표(tldraw page coords) 시퀀스. */
  points: { x: number; y: number }[];
  /** pointer up 시점. null = 진행 중, 값 = 페이드 시작 시각. */
  completedAt: number | null;
  /** 마지막 broadcast/local 입력 시각. 'end' 가 누락된 stuck stroke cleanup 기준. */
  lastUpdatedAt: number;
}

interface RemoteLaserLayerProps {
  strokes: Map<string, RemoteLaserStroke>;
  editor: Editor | null;
}

// 본인 + 타인 의 레이저 stroke 모두 동일 컴포넌트로 SVG 렌더.
// - 사용자 색상 + drop-shadow 발광 (외곽 부드러움)
// - 곡선: quadratic Bezier through midpoints (점 사이 부드럽게)
// - 페이드: cubic ease-out (tldraw native 와 유사한 자연스러운 사라짐)
// - width 축소: 시간 지날수록 얇아짐 (라이브 느낌)

export function RemoteLaserLayer({ strokes, editor }: RemoteLaserLayerProps) {
  const [now, setNow] = useState(() => Date.now());

  // 페이드 애니메이션을 위해 50ms마다 시각 갱신 (60fps 가까이)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(interval);
  }, []);

  if (!editor || strokes.size === 0) return null;

  type Item = {
    stroke: RemoteLaserStroke;
    opacity: number;
    widthFactor: number;
    pathD: string;
  };
  const items: Item[] = [];

  for (const stroke of strokes.values()) {
    if (stroke.points.length === 0) continue;

    let opacity = 1;
    let widthFactor = 1;
    if (stroke.completedAt !== null) {
      const elapsed = now - stroke.completedAt;
      if (elapsed >= FADE_AFTER_MS) continue; // 페이드 완료
      const t = elapsed / FADE_AFTER_MS;
      // cubic ease-out: opacity 가 처음엔 천천히 그리고 마지막에 빨리
      opacity = Math.pow(1 - t, 2);
      // width 도 함께 축소 (4 → 1.5)
      widthFactor = 1 - t * (1 - MIN_STROKE_WIDTH / BASE_STROKE_WIDTH);
    }

    // 페이지 좌표 → 캔버스(뷰포트) 좌표 변환.
    // ⚠ pageToScreen 은 screenBounds.x/y 를 더해 "브라우저 페이지" 기준 좌표를 반환하므로
    // absolute inset-0 SVG 오버레이(캔버스 좌상단 기준) 에 그리면 헤더 높이만큼 어긋난다.
    // 캔버스 기준 좌표는 pageToViewport 사용.
    const screenPoints = stroke.points.map((p) => editor.pageToViewport(p));
    const pathD = pointsToSmoothPath(screenPoints);
    items.push({ stroke, opacity, widthFactor, pathD });
  }

  if (items.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
      {items.map(({ stroke, opacity, widthFactor, pathD }) => {
        const w = BASE_STROKE_WIDTH * widthFactor;
        return (
          <g key={stroke.strokeId} style={{ opacity }}>
            {/* 외곽 부드러움 (큰 blur) */}
            <path
              d={pathD}
              fill="none"
              stroke={stroke.color}
              strokeWidth={w * 3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.22}
              style={{ filter: 'blur(6px)' }}
            />
            {/* 중간 글로우 */}
            <path
              d={pathD}
              fill="none"
              stroke={stroke.color}
              strokeWidth={w * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
              style={{ filter: 'blur(2px)' }}
            />
            {/* 본 stroke (sharp) */}
            <path
              d={pathD}
              fill="none"
              stroke={stroke.color}
              strokeWidth={w}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 2px ${stroke.color})` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

// Uniform Catmull-Rom spline (τ=0.5) → cubic Bezier 변환.
// Catmull-Rom 은 모든 입력 점을 정확히 통과하므로, 네트워크로 듬성듬성 도착하는
// 원격 레이저 점에서도 midpoint-Bezier 처럼 "튀는" 현상 없이 부드러운 곡선을 만든다.
// 시작/끝 가상 점은 첫/마지막 점을 복제해서 처리.
function pointsToSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0]! : points[i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = i + 2 < points.length ? points[i + 2]! : points[i + 1]!;
    // 균등 Catmull-Rom → cubic Bezier 제어점
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
