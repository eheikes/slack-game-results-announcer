import {
  WebClient,
  ErrorCode,
  CodedError,
  LogLevel
} from '@slack/web-api'
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse'
import commaNumber from 'comma-number'
import { Temporal } from 'temporal-polyfill'

// Read in the CLI arguments.
const args = process.argv.slice(2)
const channelSource = args[0]
const channelDestination = args[1]
const dayOffset = args[2] ? parseInt(args[2]) : 0
if (channelSource === undefined) {
  console.log('Error: SLACK_CHANNEL_SOURCE is not defined')
  process.exit(1)
}
if (channelDestination === undefined) {
  console.log('Error: SLACK_CHANNEL_DESTINATION is not defined')
  process.exit(1)
}

// Read the Slack token from the environment variables.
const token = process.env.SLACK_TOKEN

// Initialize the Slack client.
const web = new WebClient(token, {
  logLevel: LogLevel.DEBUG,
})

const referenceDate = Temporal.PlainDate.from('2025-01-01')

interface GameDefinition {
  /** name of the game (from the messages) */
  name: string
  /** puzzle number for the reference date */
  startNumber: number
  /** is the number comma-separated? */
  isCommaSeparated: boolean
  /** Function to score a message */
  scoreMessage: (message: string) => number
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
    const scoreString = matches.map(match => match[0]).map(emoji => {
      if (emoji === ':large_blue_circle:') {
        return '1'
      } else if (emoji === ':large_yellow_circle:') {
        return '5'
      } else { // :bulb: or unknown
        return '0'
      }
    }).join('')
    return Number(scoreString)
  },
})

;(async () => {
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
        return message.text?.includes(puzzleNumberFormatted) && message.text?.includes(game.name)
      })
      console.log('🔍 Found matching msgs:', matchingMessages)
      const winningMessages = matchingMessages.reduce((acc, message) => {
        if (acc.length === 0) {
          acc.push(message)
        } else {
          const currentScore = game.scoreMessage(acc[0]!.text || '')
          const newScore = game.scoreMessage(message.text || '')
          if (newScore > currentScore) {
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
      const usernames = winningMessages
        .map(message => message.user)
        .filter(user => user !== undefined)
        .map(userId => `<@${userId}>`)
      const announcement = `🏆 Congratulations ${usernames.join(' and ')} for winning ${game.name} #${puzzleNumberFormatted}! 🏆`
      console.log(announcement)
      await web.chat.postMessage({
        channel: channelDestination,
        text: announcement,
      })
    }

  } catch (error: any) {
    console.log('❗An error occurred:', error)
  }
})()
