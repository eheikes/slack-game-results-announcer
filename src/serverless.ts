import { run } from './app'

exports.handler = async (_event: any, _context: any) => {
  console.log('Script started')
  const channelSource = process.env.SLACK_CHANNEL_SOURCE ?? ''
  const channelDestination = process.env.SLACK_CHANNEL_DESTINATION ?? ''
  const dayOffset = process.env.DAY_OFFSET ? parseInt(process.env.DAY_OFFSET) : 0
  await run(channelSource, channelDestination, dayOffset)
  console.log('Script completed')
  return {
    statusCode: 200,
    body: 'OK',
  }
}
