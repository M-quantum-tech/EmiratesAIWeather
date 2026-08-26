"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Chess, type Square } from "chess.js"
import { Cpu, Crown, RotateCcw, Undo2, Users } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { ChessPiece } from "@/components/games/chess-piece"
import { useRoster } from "@/components/players/register-panel"
import { chooseAiMove, type Difficulty } from "@/lib/chess-ai"
import { cn } from "@/lib/utils"

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const

type PieceColor = "w" | "b"
type PieceType = "p" | "n" | "b" | "r" | "q" | "k"
type Mode = "engine" | "local"

const LEVELS: { id: Difficulty; label: string; note: string }[] = [
  { id: "easy", label: "Easy", note: "Casual · makes mistakes" },
  { id: "medium", label: "Medium", note: "Looks 2 moves ahead" },
  { id: "hard", label: "Hard", note: "Looks 3 moves ahead" },
]

function squareName(row: number, col: number): Square {
  return `${FILES[col]}${8 - row}` as Square
}

export function ChessGame() {
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(gameRef.current.fen())
  const [selected, setSelected] = useState<Square | null>(null)
  const [targets, setTargets] = useState<Square[]>([])
  const [level, setLevel] = useState<Difficulty>("easy")
  const [thinking, setThinking] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [mode, setMode] = useState<Mode>("engine")
  const [whiteName, setWhiteName] = useState("")
  const [blackName, setBlackName] = useState("")

  const { players } = useRoster()
  const game = gameRef.current
  const board = useMemo(() => game.board(), [fen]) // eslint-disable-line react-hooks/exhaustive-deps

  const white = whiteName.trim() || "White"
  const black = blackName.trim() || "Black"

  const status = useMemo(() => {
    if (mode === "local") {
      if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? black : white} wins!`
      if (game.isStalemate()) return "Stalemate — it's a draw."
      if (game.isDraw()) return "Draw."
      const mover = game.turn() === "w" ? white : black
      if (game.isCheck()) return `${mover} is in check.`
      return `${mover} to move (${game.turn() === "w" ? "White" : "Black"}).`
    }
    if (game.isCheckmate()) return game.turn() === "w" ? "Checkmate — the engine wins." : "Checkmate — you win!"
    if (game.isStalemate()) return "Stalemate — it's a draw."
    if (game.isDraw()) return "Draw."
    if (thinking) return "Engine is thinking…"
    if (game.isCheck()) return game.turn() === "w" ? "You are in check." : "Engine is in check."
    return game.turn() === "w" ? "Your move (White)." : "Engine to move (Black)."
  }, [fen, thinking, mode, white, black]) // eslint-disable-line react-hooks/exhaustive-deps

  const runAiMove = useCallback((lvl: Difficulty) => {
    setThinking(true)
    // Defer so the "thinking" state paints before the (possibly heavy) search.
    setTimeout(() => {
      const san = chooseAiMove(gameRef.current.fen(), lvl)
      if (san) {
        const move = gameRef.current.move(san)
        if (move) setLastMove({ from: move.from as Square, to: move.to as Square })
      }
      setFen(gameRef.current.fen())
      setThinking(false)
    }, 180)
  }, [])

  const onSquareClick = useCallback(
    (sq: Square) => {
      if (thinking || game.isGameOver()) return
      // In engine mode only White (the human) moves; in local mode the side to move plays.
      if (mode === "engine" && game.turn() !== "w") return

      const turn = game.turn()
      const piece = game.get(sq)

      // Selecting one of the side-to-move's own pieces: show its legal targets.
      if (piece && piece.color === turn) {
        setSelected(sq)
        setTargets(game.moves({ square: sq, verbose: true }).map((m) => m.to as Square))
        return
      }

      // Attempting a move to a highlighted target.
      if (selected && targets.includes(sq)) {
        const move = game.move({ from: selected, to: sq, promotion: "q" })
        setSelected(null)
        setTargets([])
        if (move) {
          setLastMove({ from: move.from as Square, to: move.to as Square })
          setFen(game.fen())
          if (mode === "engine" && !game.isGameOver()) runAiMove(level)
        }
        return
      }

      setSelected(null)
      setTargets([])
    },
    [thinking, selected, targets, level, game, runAiMove, mode],
  )

  const newGame = useCallback(() => {
    gameRef.current = new Chess()
    setFen(gameRef.current.fen())
    setSelected(null)
    setTargets([])
    setLastMove(null)
    setThinking(false)
  }, [])

  const undo = useCallback(() => {
    if (thinking) return
    if (mode === "engine") {
      // Undo the engine reply and the player's move so it's the player's turn again.
      gameRef.current.undo()
      gameRef.current.undo()
    } else {
      gameRef.current.undo()
    }
    setFen(gameRef.current.fen())
    setSelected(null)
    setTargets([])
    setLastMove(null)
  }, [thinking, mode])

  const changeLevel = useCallback(
    (lvl: Difficulty) => {
      setLevel(lvl)
      newGame()
    },
    [newGame],
  )

  const changeMode = useCallback(
    (next: Mode) => {
      setMode(next)
      newGame()
    },
    [newGame],
  )

  const captured = useMemo(() => countCaptured(game), [fen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <h2 className="label-caps text-foreground/80">Chess</h2>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={thinking || game.history().length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            onClick={newGame}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            New game
          </button>
        </div>
      </header>

      {/* Mode selector: play the engine, or pass-and-play by name */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <span className="mr-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">Mode</span>
        <div role="tablist" aria-label="Chess mode" className="inline-flex rounded-md border border-border bg-card/60 p-0.5">
          <button
            role="tab"
            aria-selected={mode === "engine"}
            onClick={() => changeMode("engine")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
              mode === "engine" ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Cpu className="h-3 w-3" aria-hidden="true" />
            vs Engine
          </button>
          <button
            role="tab"
            aria-selected={mode === "local"}
            onClick={() => changeMode("local")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
              mode === "local" ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="h-3 w-3" aria-hidden="true" />
            Two players
          </button>
        </div>
      </div>

      {/* Engine difficulty (engine mode) or player names (local mode) */}
      {mode === "engine" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
          <span className="mr-1 flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            Level
          </span>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => changeLevel(l.id)}
              aria-pressed={level === l.id}
              title={l.note}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
                level === l.id
                  ? "bg-signal text-signal-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
          <span className="hidden font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground sm:inline">
            {LEVELS.find((l) => l.id === level)?.note}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-b border-border bg-secondary/40 px-3 py-2.5">
          <datalist id="chess-roster">
            {players.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <NameField label="White player" value={whiteName} onChange={setWhiteName} placeholder="White" />
          <NameField label="Black player" value={blackName} onChange={setBlackName} placeholder="Black" />
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Pick registered names — no phone shared. Pass the device each turn.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        {/* Board */}
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-md border border-border shadow-sm">
            {board.map((rankRow, r) =>
              rankRow.map((cell, c) => {
                const sq = squareName(r, c)
                const dark = (r + c) % 2 === 1
                const isSelected = selected === sq
                const isTarget = targets.includes(sq)
                const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
                return (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => onSquareClick(sq)}
                    aria-label={`${sq}${cell ? `, ${cell.color === "w" ? "white" : "black"} ${cell.type}` : ", empty"}`}
                    className={cn(
                      "relative flex aspect-square items-center justify-center text-3xl leading-none transition-colors sm:text-4xl",
                      dark ? "chess-dark" : "chess-light",
                      isLast && "ring-2 ring-inset ring-signal/70",
                    )}
                    style={{
                      background: dark ? "oklch(0.48 0.06 250)" : "oklch(0.88 0.03 85)",
                    }}
                  >
                    {isSelected ? <span className="absolute inset-0 bg-signal/40" aria-hidden="true" /> : null}
                    {isTarget ? (
                      <span
                        className={cn(
                          "absolute z-10 rounded-full",
                          cell ? "inset-1 border-2 border-signal/80" : "h-3 w-3 bg-signal/70",
                        )}
                        aria-hidden="true"
                      />
                    ) : null}
                    {cell ? (
                      <ChessPiece
                        type={cell.type as PieceType}
                        color={cell.color as PieceColor}
                        className="relative z-20 h-[78%] w-[78%] select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
                      />
                    ) : null}
                    {c === 0 ? (
                      <span className="pointer-events-none absolute left-0.5 top-0 text-[0.5rem] font-bold text-foreground/50">
                        {8 - r}
                      </span>
                    ) : null}
                    {r === 7 ? (
                      <span className="pointer-events-none absolute bottom-0 right-0.5 text-[0.5rem] font-bold text-foreground/50">
                        {FILES[c]}
                      </span>
                    ) : null}
                  </button>
                )
              }),
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-1 flex-col gap-3">
          <div
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm font-medium",
              game.isGameOver() ? "border-signal bg-signal/10 text-foreground" : "border-border bg-card text-foreground",
            )}
            aria-live="polite"
          >
            {status}
          </div>

          <div className="rounded-md border border-border bg-card px-3 py-2.5">
            <p className="label-caps mb-1.5 text-muted-foreground">How to play</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {mode === "engine"
                ? "You play White. Tap a piece to see its legal moves, then tap a highlighted square. Pawns auto-promote to a queen."
                : `Pass-and-play: ${white} (White) and ${black} (Black) share this screen and alternate turns. Tap a piece, then a highlighted square.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CaptureBox
              label={mode === "local" ? `${white} took` : "You captured"}
              pieces={captured.byWhite}
              color="b"
            />
            <CaptureBox
              label={mode === "local" ? `${black} took` : "Engine captured"}
              pieces={captured.byBlack}
              color="w"
            />
          </div>

          <p className="mt-auto font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Moves played: {game.history().length}
          </p>
        </div>
      </div>
    </Panel>
  )
}

function NameField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps text-muted-foreground">{label}</span>
      <input
        list="chess-roster"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={32}
        placeholder={placeholder}
        className="w-40 rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
      />
    </label>
  )
}

function CaptureBox({ label, pieces, color }: { label: string; pieces: PieceType[]; color: PieceColor }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="label-caps mb-1 truncate text-muted-foreground">{label}</p>
      <div className="flex min-h-[1.5rem] flex-wrap items-center gap-0.5">
        {pieces.length > 0 ? (
          pieces.map((t, i) => <ChessPiece key={`${t}${i}`} type={t} color={color} className="h-5 w-5" />)
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </div>
    </div>
  )
}

/** Captured pieces derived from the starting counts minus what's on the board. */
function countCaptured(game: Chess) {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
  const remain = { w: { ...start }, b: { ...start } }
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell && cell.type !== "k") remain[cell.color][cell.type]--
    }
  }
  const typesFor = (color: PieceColor): PieceType[] =>
    (["q", "r", "b", "n", "p"] as const).flatMap((t) =>
      Array.from({ length: Math.max(0, remain[color][t]) }, () => t as PieceType),
    )
  // Pieces missing from Black were captured by White, and vice versa.
  return { byWhite: typesFor("b"), byBlack: typesFor("w") }
}
