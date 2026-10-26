"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading } from "@/components/ui/dialog-parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Image crop                                                         */
/*                                                                     */
/*  Before a picture or banner goes up, you choose what part of it    */
/*  shows: drag to move it, zoom to size it. The crop is drawn to a   */
/*  canvas at a fixed size, so what uploads is exactly the frame you  */
/*  saw, and Cloudinary never has to guess where the subject is.      */
/* ------------------------------------------------------------------ */

const MAX_ZOOM = 4;

interface ImageCropDialogProps {
  /** The image to crop; the dialog is open while this is set. */
  file: File | null;
  /** Width over height of the result: 1 for a picture, 3 for a banner. */
  aspect: number;
  /** Size of the uploaded image in pixels. */
  outputWidth: number;
  title: string;
  /** Corner radius of the frame, so it previews the shape it will show in. */
  frameClassName?: string;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}

/** Where the frame's centre sits in the image, in image pixels, and how far in. */
interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export function ImageCropDialog({
  file,
  aspect,
  outputWidth,
  title,
  frameClassName,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, zoom: 1 });
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setSaving(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The dialog mounts its content late, so the frame is measured through a
  // callback ref rather than an effect.
  const observer = useRef<ResizeObserver | null>(null);
  const setFrame = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    frameRef.current = node;
    if (!node) return;
    observer.current = new ResizeObserver(([entry]) => setFrameW(entry.contentRect.width));
    observer.current.observe(node);
  }, []);

  const frameH = frameW / aspect;
  // At zoom 1 the image just covers the frame.
  const baseScale = natural && frameW ? Math.max(frameW / natural.w, frameH / natural.h) : 1;

  /** Keeps the frame inside the image whatever the zoom. */
  const clamp = useCallback(
    (next: View): View => {
      if (!natural || !frameW) return next;
      const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
      const scale = baseScale * zoom;
      const halfW = frameW / 2 / scale;
      const halfH = frameH / 2 / scale;
      return {
        zoom,
        cx: Math.min(natural.w - halfW, Math.max(halfW, next.cx)),
        cy: Math.min(natural.h - halfH, Math.max(halfH, next.cy)),
      };
    },
    [natural, frameW, frameH, baseScale]
  );

  const setZoom = (zoom: number) => setView((v) => clamp({ ...v, zoom }));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const scale = baseScale * start.view.zoom;
    setView(
      clamp({
        ...start.view,
        cx: start.view.cx - (e.clientX - start.x) / scale,
        cy: start.view.cy - (e.clientY - start.y) / scale,
      })
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // React's wheel listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => clamp({ ...v, zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [clamp, frameW]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 10 / (baseScale * view.zoom);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setView((v) => clamp({ ...v, cx: v.cx + move[0], cy: v.cy + move[1] }));
    } else if (e.key === "+" || e.key === "=") {
      setZoom(view.zoom + 0.1);
    } else if (e.key === "-") {
      setZoom(view.zoom - 0.1);
    }
  };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img || !natural || !frameW || !file) return;
    setSaving(true);

    const scale = baseScale * view.zoom;
    const sw = frameW / scale;
    const sh = frameH / scale;
    const canvas = document.createElement("canvas");
    // Never upscale past the pixels the crop actually has.
    canvas.width = Math.round(Math.min(outputWidth, sw));
    canvas.height = Math.round(canvas.width / aspect);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, view.cx - sw / 2, view.cy - sh / 2, sw, sh, 0, 0, canvas.width, canvas.height);

    // WebP keeps transparency at a fraction of PNG's size; Safari falls
    // back to PNG, which the browser reports in the blob's type.
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          alert("Could not crop that image.");
          return;
        }
        const ext = blob.type.split("/")[1] ?? "png";
        const name = file.name.replace(/\.[^.]+$/, "") || "image";
        onConfirm(new File([blob], `${name}.${ext}`, { type: blob.type }));
      },
      "image/webp",
      0.92
    );
  };

  const scale = baseScale * view.zoom;
  const ready = natural && frameW > 0;

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent className={aspect > 1 ? "sm:max-w-[640px]" : "sm:max-w-[440px]"}>
        <DialogHeading icon={Crop} title={title} description="Drag to position. Zoom to size." />

        <div className={cn("mx-auto w-full", aspect === 1 && "max-w-[300px]")}>
          <div
            ref={setFrame}
            role="application"
            aria-label="Crop area. Arrow keys move the image, plus and minus zoom."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            style={{ aspectRatio: String(aspect) }}
            className={cn(
              "relative w-full cursor-grab touch-none select-none overflow-hidden bg-surface-hover/60 ring-1 ring-inset ring-line/[0.1] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              frameClassName
            )}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob, positioned by hand
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  setNatural({ w, h });
                  setView({ cx: w / 2, cy: h / 2, zoom: 1 });
                }}
                style={
                  ready
                    ? {
                        width: natural.w * scale,
                        height: natural.h * scale,
                        transform: `translate(${frameW / 2 - view.cx * scale}px, ${frameH / 2 - view.cy * scale}px)`,
                      }
                    : { opacity: 0 }
                }
                className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              />
            )}
            {/* Rule of thirds, to help line things up. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_calc(33.33%-0.5px),rgb(255_255_255/0.25)_calc(33.33%-0.5px),rgb(255_255_255/0.25)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.66%-0.5px),rgb(255_255_255/0.25)_calc(66.66%-0.5px),rgb(255_255_255/0.25)_calc(66.66%+0.5px),transparent_calc(66.66%+0.5px)),linear-gradient(to_bottom,transparent_calc(33.33%-0.5px),rgb(255_255_255/0.25)_calc(33.33%-0.5px),rgb(255_255_255/0.25)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.66%-0.5px),rgb(255_255_255/0.25)_calc(66.66%-0.5px),rgb(255_255_255/0.25)_calc(66.66%+0.5px),transparent_calc(66.66%+0.5px))]"
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(view.zoom - 0.25)}
              aria-label="Zoom out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="h-1 w-full cursor-pointer accent-[rgb(var(--ink))]"
            />
            <button
              type="button"
              onClick={() => setZoom(view.zoom + 0.25)}
              aria-label="Zoom in"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} isLoading={saving} disabled={!ready}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
