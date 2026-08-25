'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  Loader2,
  Lock,
  Unlock,
  Move,
} from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  altText?: string;
  onCropComplete: (cropped: { url: string; alt: string; width: number; height: number }) => void;
}

export function ImageCropModal({
  open,
  onOpenChange,
  imageUrl,
  altText = '',
  onCropComplete,
}: Props) {
  const [targetWidth, setTargetWidth] = useState<number>(800);
  const [targetHeight, setTargetHeight] = useState<number>(600);
  const [aspectLocked, setAspectLocked] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<number>(800 / 600);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [saving, setSaving] = useState<boolean>(false);
  const [naturalDim, setNaturalDim] = useState<{ width: number; height: number }>({ width: 800, height: 600 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load natural dimensions when image changes or modal opens
  useEffect(() => {
    if (!open || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 600;
      setNaturalDim({ width: w, height: h });

      // Default target width & height to exact natural dimensions
      setTargetWidth(w);
      setTargetHeight(h);
      setAspectRatio(w / (h || 1));
      setAspectLocked(false);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    };
  }, [open, imageUrl]);

  // Handle Width change with custom value support
  const handleWidthChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val)) {
      setTargetWidth(0);
      return;
    }
    setTargetWidth(val);
    if (aspectLocked && aspectRatio > 0) {
      setTargetHeight(Math.round(val / aspectRatio));
    }
  };

  // Handle Height change with custom value support
  const handleHeightChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val)) {
      setTargetHeight(0);
      return;
    }
    setTargetHeight(val);
    if (aspectLocked && aspectRatio > 0) {
      setTargetWidth(Math.round(val * aspectRatio));
    }
  };

  const toggleAspectLock = () => {
    if (!aspectLocked) {
      const w = targetWidth > 0 ? targetWidth : naturalDim.width;
      const h = targetHeight > 0 ? targetHeight : naturalDim.height;
      setAspectRatio(w / (h || 1));
      setAspectLocked(true);
    } else {
      setAspectLocked(false);
    }
  };

  // Reset to original exact dimensions & center framing
  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setTargetWidth(naturalDim.width);
    setTargetHeight(naturalDim.height);
    setAspectRatio(naturalDim.width / (naturalDim.height || 1));
    setAspectLocked(false);
    toast.info('Reset to original image size');
  };

  // Pan / Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support for dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  // Apply Crop: Renders to offscreen canvas and uploads to CMS
  const handleApplyCrop = async () => {
    if (!imageUrl) return;
    setSaving(true);

    try {
      const container = containerRef.current;
      const img = imageRef.current;
      if (!container || !img) throw new Error('Preview not ready');

      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      const outW = targetWidth > 0 ? targetWidth : naturalDim.width;
      const outH = targetHeight > 0 ? targetHeight : naturalDim.height;

      // Create an export canvas with target dimensions
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      // Calculate source image coordinates corresponding to the visible container box
      const scaleX = naturalDim.width / imgRect.width;
      const scaleY = naturalDim.height / imgRect.height;

      const sourceX = (containerRect.left - imgRect.left) * scaleX;
      const sourceY = (containerRect.top - imgRect.top) * scaleY;
      const sourceW = containerRect.width * scaleX;
      const sourceH = containerRect.height * scaleY;

      // Load full-resolution image for pixel-perfect export
      const fullImg = new Image();
      fullImg.crossOrigin = 'anonymous';
      fullImg.src = imageUrl;

      await new Promise<void>((resolve, reject) => {
        if (fullImg.complete) resolve();
        fullImg.onload = () => resolve();
        fullImg.onerror = reject;
      });

      // Draw cropped slice onto target canvas
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        fullImg,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        outW,
        outH
      );

      // Convert canvas to Blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.9);
      });

      if (!blob) throw new Error('Failed to generate image file');

      // Upload cropped derivative
      const ext = 'webp';
      const filename = `cropped-${Date.now()}.${ext}`;
      const file = new File([blob], filename, { type: 'image/webp' });

      const formData = new FormData();
      formData.append('file', file);
      const token = Cookies.get('np_token') || '';

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to save cropped image');
      const uploaded = await res.json();

      toast.success('Image cropped and saved successfully');
      onCropComplete({
        url: uploaded.url || uploaded.webpUrl,
        alt: altText,
        width: outW,
        height: outH,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Crop failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-w-[95vw] w-full p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Crop className="h-5 w-5 text-indigo-400" />
            Image Crop & Resize
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Adjust custom width & height, zoom level, and drag to frame your image perfectly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-2">
          {/* Left Column: Interactive Crop Viewport (2 cols) */}
          <div className="md:col-span-2 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Move className="h-3.5 w-3.5" />
                Drag to Reposition
              </span>
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Output: {targetWidth || naturalDim.width} × {targetHeight || naturalDim.height} px
              </span>
            </div>

            {/* Crop Window Container */}
            <div
              ref={containerRef}
              className="relative w-full h-72 sm:h-80 rounded-lg border border-border bg-black/60 overflow-hidden select-none cursor-grab active:cursor-grabbing flex items-center justify-center"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
            >
              {/* Grid overlay for framing guide */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 opacity-30 border border-white/40">
                <div className="border-r border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-b border-white/40" />
                <div className="border-r border-white/40" />
                <div className="border-r border-white/40" />
                <div />
              </div>

              {/* Transformed Image */}
              {imageUrl ? (
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Crop preview"
                  draggable={false}
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                  }}
                  className="max-h-full max-w-full object-contain pointer-events-none"
                />
              ) : (
                <div className="text-xs text-muted-foreground">No image loaded</div>
              )}
            </div>

            {/* Zoom Slider Bar */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <ZoomIn className="h-3.5 w-3.5 text-indigo-400" />
                  Zoom Level
                </Label>
                <span className="font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-foreground">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>

                <input
                  type="range"
                  min={0.5}
                  max={3.5}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.1).toFixed(2))))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Dimensions & Controls (1 col) */}
          <div className="flex flex-col justify-between space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
            <div className="space-y-4">
              <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Crop Dimensions
              </span>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="crop-w" className="text-xs font-medium">Width (px)</Label>
                  <Input
                    id="crop-w"
                    type="number"
                    value={targetWidth === 0 ? '' : targetWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    placeholder={String(naturalDim.width)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="crop-h" className="text-xs font-medium">Height (px)</Label>
                  <Input
                    id="crop-h"
                    type="number"
                    value={targetHeight === 0 ? '' : targetHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    placeholder={String(naturalDim.height)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAspectLock}
                  className="w-full text-xs gap-1.5 h-8 font-medium justify-start"
                >
                  {aspectLocked ? <Lock className="h-3.5 w-3.5 text-indigo-400" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                  {aspectLocked ? 'Aspect Ratio Locked' : 'Lock Aspect Ratio'}
                </Button>
              </div>

              {/* Quick Aspect Presets */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-[11px] text-muted-foreground block">Preset Ratios</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setTargetWidth(600);
                      setTargetHeight(600);
                      setAspectRatio(1);
                      setAspectLocked(true);
                    }}
                  >
                    1:1 Square
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setTargetWidth(800);
                      setTargetHeight(600);
                      setAspectRatio(4 / 3);
                      setAspectLocked(true);
                    }}
                  >
                    4:3 Standard
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setTargetWidth(1200);
                      setTargetHeight(675);
                      setAspectRatio(16 / 9);
                      setAspectLocked(true);
                    }}
                  >
                    16:9 Banner
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 font-semibold text-indigo-400 hover:text-indigo-300"
                    onClick={() => {
                      setTargetWidth(naturalDim.width);
                      setTargetHeight(naturalDim.height);
                      setAspectRatio(naturalDim.width / (naturalDim.height || 1));
                      setAspectLocked(true);
                      setZoom(1);
                      setPosition({ x: 0, y: 0 });
                    }}
                    title={`Original Exact Dimensions (${naturalDim.width}×${naturalDim.height}px)`}
                  >
                    OG Image
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5 h-8 font-medium"
                onClick={handleReset}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to OG Size
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between w-full">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>

          <Button
            type="button"
            className="text-xs gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4"
            onClick={handleApplyCrop}
            disabled={saving || !imageUrl}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Cropping & Saving…' : 'Apply & Save Crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
