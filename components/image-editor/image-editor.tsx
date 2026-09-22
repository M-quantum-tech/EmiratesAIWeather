"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Download,
  FlipHorizontal2,
  FlipVertical2,
  ImageUp,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ControlSlider } from "./control-slider"

type Adjustments = {
  brightness: number
  contrast: number
  saturate: number
  grayscale: number
  sepia: number
  hue: number
  blur: number
  invert: number
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  hue: 0,
  blur: 0,
  invert: 0,
}

type Preset = {
  name: string
  adjustments: Partial<Adjustments>
}

const PRESETS: Preset[] = [
  { name: "Original", adjustments: {} },
  { name: "Vivid", adjustments: { saturate: 150, contrast: 115, brightness: 105 } },
  { name: "Desert", adjustments: { sepia: 35, saturate: 120, brightness: 105, contrast: 108 } },
  { name: "Cool", adjustments: { hue: 190, saturate: 115, brightness: 102 } },
  { name: "Noir", adjustments: { grayscale: 100, contrast: 125, brightness: 98 } },
  { name: "Vintage", adjustments: { sepia: 55, contrast: 90, brightness: 105, saturate: 85 } },
  { name: "Invert", adjustments: { invert: 100 } },
]

function buildFilter(a: Adjustments): string {
  return [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturate}%)`,
    `grayscale(${a.grayscale}%)`,
    `sepia(${a.sepia}%)`,
    `hue-rotate(${a.hue}deg)`,
    `invert(${a.invert}%)`,
    `blur(${a.blur}px)`,
  ].join(" ")
}

export function ImageEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [hasImage, setHasImage] = useState(false)
  const [fileName, setFileName] = useState<string>("")
  const [isDragging, setIsDragging] = useState(false)
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [activePreset, setActivePreset] = useState("Original")

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rot = ((rotation % 360) + 360) % 360
    const swap = rot === 90 || rot === 270
    canvas.width = swap ? img.naturalHeight : img.naturalWidth
    canvas.height = swap ? img.naturalWidth : img.naturalHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.filter = buildFilter(adjustments)
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()
  }, [adjustments, rotation, flipH, flipV])

  useEffect(() => {
    if (hasImage) draw()
  }, [draw, hasImage])

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imageRef.current = img
      setFileName(file.name)
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setRotation(0)
      setFlipH(false)
      setFlipV(false)
      setActivePreset("Original")
      setHasImage(true)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset.name)
    setAdjustments({ ...DEFAULT_ADJUSTMENTS, ...preset.adjustments })
  }

  const updateAdjustment = (key: keyof Adjustments, value: number) => {
    setActivePreset("Custom")
    setAdjustments((prev) => ({ ...prev, [key]: value }))
  }

  const resetAll = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setActivePreset("Original")
  }

  const clearImage = () => {
    imageRef.current = null
    setHasImage(false)
    setFileName("")
    resetAll()
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const base = fileName.replace(/\.[^.]+$/, "") || "image"
      a.download = `${base}-edited.png`
      a.click()
      URL.revokeObjectURL(url)
    }, "image/png")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Canvas / drop zone */}
      <section
        className="flex min-h-[420px] flex-col rounded-lg border border-border bg-panel"
        aria-label="Image canvas"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="label-caps truncate">
            {hasImage ? fileName : "No image loaded"}
          </span>
          {hasImage ? (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImageUp />
                Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={clearImage}>
                <Trash2 />
                Clear
              </Button>
            </div>
          ) : null}
        </div>

        <div className="relative flex flex-1 items-center justify-center p-4">
          {hasImage ? (
            <canvas
              ref={canvasRef}
              className="max-h-[62vh] max-w-full rounded-md object-contain shadow-lg"
            />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex h-full min-h-[360px] w-full flex-col items-center justify-center gap-4 rounded-md border-2 border-dashed transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary/20 hover:border-primary/60 hover:bg-secondary/40",
              )}
            >
              <span
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary text-primary transition-transform",
                  isDragging && "scale-110",
                )}
              >
                <Upload className="size-7" />
              </span>
              <span className="text-center">
                <span className="block text-sm font-medium text-foreground">
                  Drop a photo here or click to upload
                </span>
                <span className="mt-1 block font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                  PNG · JPG · WEBP · Processed locally
                </span>
              </span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="sr-only"
        />
      </section>

      {/* Controls */}
      <aside className="flex flex-col gap-4" aria-label="Editor controls">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="label-caps">Presets</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                disabled={!hasImage}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "rounded-md border px-2 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  activePreset === preset.name
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-caps">Transform</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={!hasImage}
              onClick={() => setRotation((r) => r - 90)}
              aria-label="Rotate left"
            >
              <RotateCcw />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!hasImage}
              onClick={() => setRotation((r) => r + 90)}
              aria-label="Rotate right"
            >
              <RotateCw />
            </Button>
            <Button
              variant={flipH ? "default" : "outline"}
              size="icon"
              disabled={!hasImage}
              onClick={() => setFlipH((v) => !v)}
              aria-label="Flip horizontal"
            >
              <FlipHorizontal2 />
            </Button>
            <Button
              variant={flipV ? "default" : "outline"}
              size="icon"
              disabled={!hasImage}
              onClick={() => setFlipV((v) => !v)}
              aria-label="Flip vertical"
            >
              <FlipVertical2 />
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="label-caps">Adjust</span>
            <button
              type="button"
              disabled={!hasImage}
              onClick={resetAll}
              className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Reset
            </button>
          </div>
          <div className={cn("space-y-4", !hasImage && "pointer-events-none opacity-40")}>
            <ControlSlider label="Brightness" value={adjustments.brightness} min={0} max={200} unit="%" defaultValue={100} onChange={(v) => updateAdjustment("brightness", v)} />
            <ControlSlider label="Contrast" value={adjustments.contrast} min={0} max={200} unit="%" defaultValue={100} onChange={(v) => updateAdjustment("contrast", v)} />
            <ControlSlider label="Saturation" value={adjustments.saturate} min={0} max={200} unit="%" defaultValue={100} onChange={(v) => updateAdjustment("saturate", v)} />
            <ControlSlider label="Hue" value={adjustments.hue} min={0} max={360} unit="°" defaultValue={0} onChange={(v) => updateAdjustment("hue", v)} />
            <ControlSlider label="Grayscale" value={adjustments.grayscale} min={0} max={100} unit="%" defaultValue={0} onChange={(v) => updateAdjustment("grayscale", v)} />
            <ControlSlider label="Sepia" value={adjustments.sepia} min={0} max={100} unit="%" defaultValue={0} onChange={(v) => updateAdjustment("sepia", v)} />
            <ControlSlider label="Blur" value={adjustments.blur} min={0} max={20} step={0.5} unit="px" defaultValue={0} onChange={(v) => updateAdjustment("blur", v)} />
          </div>
        </div>

        <Button size="lg" disabled={!hasImage} onClick={download} className="w-full">
          <Download />
          Download PNG
        </Button>
      </aside>
    </div>
  )
}
