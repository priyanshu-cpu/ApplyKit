import { useRef, type PointerEvent } from "react";
import { clamp, type Crop } from "../lib/image/geometry";
type Corner = "nw" | "ne" | "sw" | "se";
export default function CropEditor({
  url,
  crop,
  onChange,
  fixed = false,
}: {
  url: string;
  crop: Crop;
  onChange: (crop: Crop) => void;
  fixed?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    crop: Crop;
    corner?: Corner;
  } | null>(null);
  const move = (frame: Crop, dx: number, dy: number) => ({
    ...frame,
    x: clamp(frame.x + dx, 0, 100 - frame.w),
    y: clamp(frame.y + dy, 0, 100 - frame.h),
  });
  function resize(frame: Crop, dx: number, dy: number, corner: Corner) {
    const west = corner.endsWith("w"),
      north = corner.startsWith("n");
    const maxW = west ? frame.x + frame.w : 100 - frame.x;
    const maxH = north ? frame.y + frame.h : 100 - frame.y;
    const width = frame.w + (west ? -dx : dx);
    const height = frame.h + (north ? -dy : dy);
    const minW = Math.min(1, frame.w),
      minH = Math.min(1, frame.h);
    const scale = clamp(
      Math.abs(dx / frame.w) > Math.abs(dy / frame.h)
        ? width / frame.w
        : height / frame.h,
      Math.max(minW / frame.w, minH / frame.h),
      Math.min(maxW / frame.w, maxH / frame.h),
    );
    const w = fixed ? frame.w * scale : clamp(width, minW, maxW),
      h = fixed ? frame.h * scale : clamp(height, minH, maxH);
    return {
      x: west ? frame.x + frame.w - w : frame.x,
      y: north ? frame.y + frame.h - h : frame.y,
      w,
      h,
    };
  }
  function start(e: PointerEvent<HTMLDivElement>, corner?: Corner) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop, corner };
  }
  return (
    <div className="crop-stage" ref={stage}>
      <img src={url} alt="Image to crop" />
      <div
        className="crop-box"
        aria-label="Crop frame. Arrow keys move. Shift and arrow keys resize."
        role="group"
        tabIndex={0}
        style={{
          left: crop.x + "%",
          top: crop.y + "%",
          width: crop.w + "%",
          height: crop.h + "%",
        }}
        onPointerDown={(e) => start(e)}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerMove={(e) => {
          const before = drag.current;
          if (!before || !stage.current) return;
          const dx = ((e.clientX - before.x) / stage.current.clientWidth) * 100,
            dy = ((e.clientY - before.y) / stage.current.clientHeight) * 100;
          onChange(
            before.corner
              ? resize(before.crop, dx, dy, before.corner)
              : move(before.crop, dx, dy),
          );
        }}
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          )
            return;
          e.preventDefault();
          const dx =
              e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0,
            dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          onChange(
            e.shiftKey ? resize(crop, dx, dy, "se") : move(crop, dx, dy),
          );
        }}
      >
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <div
            className={"crop-handle " + corner}
            key={corner}
            aria-hidden="true"
            onPointerDown={(e) => start(e, corner)}
          />
        ))}
      </div>
    </div>
  );
}
