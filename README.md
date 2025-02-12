# Slack Game Results Announcer

A small script to announces the winners of NYT word games (Wordle, Connections, and Strands) to a Slack channel.

It looks through the recent history of a Slack channel to find the reported scores of players, then calculates the winners, and announces them to another (or the same) Slack channel.

## Slack Setup

You will need to create a Slack app in your desired workspace, which requires a Slack paid plan.

* See the [Slack QuickStart guide](https://api.slack.com/quickstart) on how to create an app and get an auth token.
* The bot will need the `chat:write` and `channels:history` scopes. It will also need `groups:history`, `im:history`, and 
`mpim:history` for private channels, direct messages, or group direct message, respectively.
* Copy the OAuth access token for when you run the app (see Usage below).
* Invite the app to the channel where it can find the messages with the game results, and invite it to the channel where it should post the announcements. (Usually these are the same channel.)

## Installation

You will need [Node.js & npm](https://nodejs.org) to build and run this script.

First run `npm install` to install the project's packages. Then build the project:

* Run `npm run build` to build the project normally.
* Run `npm run build:bundle` to build a self-contained file for use in AWS Lambda etc.

## Usage

Call the app with your Slack app's OAuth token:

```
export SLACK_TOKEN=YOUR_TOKEN_HERE
node dist/index.js SLACK_CHANNEL_SOURCE SLACK_CHANNEL_DESTINATION -1
```

* Replace `YOUR_TOKEN_HERE` with your apps' OAuth token.
* Replace `SLACK_CHANNEL_SOURCE` with the ID of the Slack channel that contains the players' results. You can find a channel's ID under its details. This should look something like `CI65S34LGVR`.
* Replace `SLACK_CHANNEL_DESTINATION` with the ID of the Slack channel where the announcements should be posted.
* The optional third parameter is a number that defines the day of games that should be announced. `0` (the default) is today's games, `-1` is yesterday's, and so on.
