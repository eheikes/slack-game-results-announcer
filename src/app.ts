import {
  WebClient,
  ErrorCode,
  CodedError,
  LogLevel
} from '@slack/web-api'
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse'
import { User } from '@slack/web-api/dist/types/response/UsersInfoResponse'
import commaNumber from 'comma-number'
import { Temporal } from 'temporal-polyfill'

// Initialize the user cache.
const usersCache = new Map<string, User | null>()

// Read the Slack token from the environment variables.
const token = process.env.SLACK_TOKEN

// Initialize the Slack client.
const web = new WebClient(token, {
  logLevel: LogLevel.DEBUG,
})

const referenceDate = Temporal.PlainDate.from('2025-01-01')

interface GameDefinition {
  /** name of the game (from the messages) */
  name: string | RegExp
  /** name of the game (for displaying) */
  readableName?: string
  /** puzzle number for the reference date */
  startNumber: number
  /** is the number comma-separated? */
  isCommaSeparated: boolean
  /** Function to score a message */
  scoreMessage: (message: string) => number
  /** Is a lower score better? */
  isScoringReversed?: boolean
}

const baseConnectionsScore = (row: string): number => {
  if (row === ':large_yellow_square:'.repeat(4)) {
    return 1
  }
  if (row === ':large_green_square:'.repeat(4)) {
    return 2
  }
  if (row === ':large_blue_square:'.repeat(4)) {
    return 3
  }
  if (row === ':large_purple_square:'.repeat(4)) {
    return 4
  }
  return 0
}

const scorePips = (message: string) => {
  let score = 0
  const match = message.match(/(\d+):(\d+)/)
  if (match) {
    score += parseInt(match[0]) * 60 + parseInt(match[1]!) // convert to seconds
  }
  return score
}

const getUserName = (user?: User): string => {
  return user?.profile?.real_name || user?.profile?.display_name || '<Unknown User>'
}

const getName = async (id: string): Promise<string> => {
  // First check the cache.
  const cachedUser = usersCache.get(id)
  if (cachedUser) {
    return getUserName(cachedUser)
  }

  // Look up the user via the Slack API.
  const result = await web.users.info({ user: id })
  const user = result.user
  const name = getUserName(user)

  // Cache the user and return the name.
  usersCache.set(id, user ?? null)
  return name
}

const games = new Map<string, GameDefinition>()
games.set('Wordle', {
  name: 'Wordle',
  startNumber: 1292,
  isCommaSeparated: true,
  scoreMessage: (message: string) => {
    let score = 0
    const match = message.match(/(\d+)\/6/)
    if (match) {
      score += (6 - parseInt(match[1]!)) * 10
    }
    return score
  },
})
games.set('Connections', {
  name: 'Connections',
  startNumber: 570,
  isCommaSeparated: false,
  scoreMessage: (message: string) => {
    // See https://www.nytimes.com/2024/02/19/us/how-i-designed-my-perfect-connections-solve.html
    let score = 0
    const matches = Array.from(message.matchAll(/^(:.+?:){4}$/gm))
    for (const [index, match] of matches.entries()) {
      const baseScore = baseConnectionsScore(match[0])
      const multiplier = Math.max(4 - index, 0)
      score += baseScore * multiplier
    }
    return score
  },
})
games.set('Strands', {
  name: 'Strands',
  startNumber: 304,
  isCommaSeparated: false,
  scoreMessage: (message: string) => {
    const matches = Array.from(message.matchAll(/(:.+?:)/g))
    const emojis = matches.map(match => match[0])
    let score = 0
    for (const [index, emoji] of emojis.entries()) {
      if (emoji === ':large_blue_circle:') {
        score += 1
      } else if (emoji === ':large_yellow_circle:') {
        const emojiWithoutClues = emojis.filter(e => e !== ':bulb:')
        const indexDisregardingClues = emojiWithoutClues.indexOf(':large_yellow_circle:')
        score += (emojiWithoutClues.length - indexDisregardingClues) * 0.1 // tiebreaker only
      } else if (emoji === ':bulb:') {
        score -= 1
      }
    }
    return score
  },
})
games.set('PipsEasy', {
  readableName: 'Pips Easy',
  name: /Pips.*Easy/,
  startNumber: -228,
  isCommaSeparated: false,
  scoreMessage: scorePips,
})
games.set('PipsMedium', {
  readableName: 'Pips Medium',
  name: /Pips.*Medium/,
  startNumber: -228,
  isCommaSeparated: false,
  scoreMessage: scorePips,
})
games.set('PipsHard', {
  readableName: 'Pips Hard',
  name: /Pips.*Hard/,
  startNumber: -228,
  isCommaSeparated: false,
  scoreMessage: scorePips,
})

export const run = async (channelSource: string, channelDestination: string, dayOffset: number): Promise<void> => {
  try {
    // Get all recent messages.
    const result = await web.conversations.history({
      channel: channelSource,
      oldest: String((Date.now() / 1000) - 72 * 60 * 60),
    })

    // Determine the offset from the reference date.
    const duration = Temporal.Now.plainDateISO().since(referenceDate)
    const daysSinceReference = duration.days

    // Announce the winners for each game.
    for (const game of games.values()) {
      const puzzleNumber = game.startNumber + daysSinceReference + dayOffset
      const puzzleNumberFormatted = game.isCommaSeparated ? commaNumber(puzzleNumber) : String(puzzleNumber)
      console.log('👀 Looking for game #', puzzleNumberFormatted, 'for', game.name)

      const matchingMessages = (result.messages || []).filter((message) => {
        return message.text?.includes(puzzleNumberFormatted) && (
          game.name instanceof RegExp ?
            game.name.test(message.text || '') :
            message.text?.includes(game.name)
        )
      })
      console.log('🔍 Found matching msgs:', matchingMessages)
      if (matchingMessages.length === 0) {
        console.log('0️⃣ No messages found, so no winner this time')
        continue
      }
      if (matchingMessages.length === 1) {
        console.log('1️⃣ Only one message found, so they win by default')
        continue
      }

      const winningMessages = matchingMessages.reduce((acc, message) => {
        if (acc.length === 0) {
          acc.push(message)
        } else {
          const currentScore = game.scoreMessage(acc[0]!.text || '')
          const newScore = game.scoreMessage(message.text || '')
          if (game.isScoringReversed ? newScore < currentScore : newScore > currentScore) {
            acc[0] = message
          } else if (newScore === currentScore) {
            acc.push(message)
          }
        }
        return acc
      }, [] as MessageElement[])
      console.log('🖩 Winning msgs:', winningMessages)

      if (winningMessages.length === 0) {
        continue
      }

      // Post the winner for each game.
      const gameName = game.readableName || game.name
      const usernames = await Promise.all(
        winningMessages
          .map(message => message.user)
          .filter(user => user !== undefined)
          .map(userId => getName(userId))
      )
      const winners = winningMessages.length === matchingMessages.length ? '*everyone*' : `*${usernames.join('* and *')}*`
      const announcement = `🏆 Congratulations ${winners} for winning ${gameName} #${puzzleNumberFormatted}! 🏆`
      console.log(announcement)
      await web.chat.postMessage({
        channel: channelDestination,
        text: announcement,
      })
    }

  } catch (error: any) {
    console.log('❗An error occurred:', error)
  }
}
