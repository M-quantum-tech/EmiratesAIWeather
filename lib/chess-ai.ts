import { Chess } from "chess.js"

export type Difficulty = "easy" | "medium" | "hard"

// Centipawn material values.
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }

/**
 * Static evaluation from White's perspective (positive favours White).
 * Material + a light central-control bonus. Terminal states dominate.
 */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) return game.turn() === "w" ? -1_000_000 : 1_000_000
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) return 0

  let score = 0
  const board = game.board()
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f]
      if (!sq) continue
      const centreFile = Math.min(f, 7 - f)
      const centreRank = Math.min(r, 7 - r)
      const centre = (centreFile + centreRank) * 4 // 0..48
      const s = VALUE[sq.type] + centre
      score += sq.color === "w" ? s : -s
    }
  }
  return score
}

function minimax(game: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game)
  const moves = game.moves()

  if (maximizing) {
    let best = -Infinity
    for (const m of moves) {
      game.move(m)
      best = Math.max(best, minimax(game, depth - 1, alpha, beta, false))
      game.undo()
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    game.move(m)
    best = Math.min(best, minimax(game, depth - 1, alpha, beta, true))
    game.undo()
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/**
 * Pick the AI's move (AI plays Black, i.e. it minimises the White-perspective score).
 * Easy mixes in randomness for a beatable opponent; harder levels search deeper.
 */
export function chooseAiMove(fen: string, level: Difficulty): string | null {
  const game = new Chess(fen)
  const verbose = game.moves({ verbose: true })
  if (verbose.length === 0) return null

  // Easy: half the time just play a random legal move.
  if (level === "easy" && Math.random() < 0.5) {
    return verbose[Math.floor(Math.random() * verbose.length)].san
  }

  const depth = DEPTH[level]
  const aiIsBlack = game.turn() === "b"
  let bestVal = aiIsBlack ? Infinity : -Infinity
  let bestMoves: string[] = []

  for (const m of verbose) {
    game.move(m)
    // After the AI's move it's the opponent's turn; opponent maximises if AI is Black.
    const val = minimax(game, depth - 1, -Infinity, Infinity, aiIsBlack)
    game.undo()

    if (aiIsBlack) {
      if (val < bestVal) {
        bestVal = val
        bestMoves = [m.san]
      } else if (val === bestVal) {
        bestMoves.push(m.san)
      }
    } else {
      if (val > bestVal) {
        bestVal = val
        bestMoves = [m.san]
      } else if (val === bestVal) {
        bestMoves.push(m.san)
      }
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? verbose[0].san
}
