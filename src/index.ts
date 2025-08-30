import { run } from './app'

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

;(async () => {
  await run(channelSource, channelDestination, dayOffset)
})()
