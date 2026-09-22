import type { Metadata } from "next"
import { SiteNav } from "@/components/site-nav"
import { ImageEditor } from "@/components/image-editor/image-editor"

export const metadata: Metadata = {
  title: "Image Editor — EmiratesAIWeather",
  description:
    "Upload a photo and edit it on an interactive canvas: adjust brightness, contrast, saturation, apply filter presets, rotate, flip and export — all processed locally in your browser.",
}

export default function EditorPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <span className="label-caps">Studio</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground text-balance">
            Interactive Image Editor
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
            Upload any photo to the canvas, then fine-tune it with live adjustments, filter presets and
            transforms. Everything runs locally in your browser — nothing is uploaded to a server.
          </p>
        </header>
        <ImageEditor />
      </main>
    </div>
  )
}
