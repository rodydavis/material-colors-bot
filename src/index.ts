#!/usr/bin/node

import "dotenv/config";

import { TwitterApi } from "twitter-api-v2";
// @ts-ignore
import puppeteer from "puppeteer";
import * as fs from "fs";

// const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
const client = new TwitterApi({
  appKey: process.env.TWITTER_CONSUMER_KEY,
  appSecret: process.env.TWITTER_CONSUMER_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});
const roClient = client.readOnly;
const api = client.v2;

async function getUsers() {
  const users = await roClient.v2.usersByUsernames([
    "everycolorbot",
    "EveryPalette",
  ]);
  return users.data;
}

async function getUserLastTweet(id: string) {
  const tweets = await api.userTimeline(id, {
    exclude: "retweets",
  });
  const lastTweet = tweets.data.data[0];
  return lastTweet;
}

function getColors(tweet: string) {
  if (tweet.includes("#")) {
    const regex = /#[0-9A-F]{6}/gi;
    const matches = tweet.match(regex) || [];
    return matches.map((match) => match.toLowerCase());
  }
  if (tweet.includes("0x")) {
    const regex = /0x[0-9A-F]{6}/gi;
    const matches = tweet.match(regex) || [];
    return matches.map((match) => match.replace("0x", "#").toLowerCase());
  }
  return [];
}

function generateUrl(options: {
  primary: string;
  secondary?: string;
  tertiary?: string;
  custom?: string[];
}) {
  const { primary, secondary, tertiary, custom } = options;
  const color = (color: string) => color.replace("#", "");
  let url = `https://material-foundation.github.io/material-theme-builder/#/custom?primary=${color(
    primary
  )}`;
  if (secondary) {
    url += `&secondary=${color(secondary)}`;
  }
  if (tertiary) {
    url += `&tertiary=${color(tertiary)}`;
  }
  if (custom) {
    url += `&customColors=${custom
      .map((value, i) => `custom-${i}:${color(value)}:1`)
      .join(",")}`;
  }
  url += "&mods=share";
  return url;
}

async function screenshotUrl(url: string, id: string) {
  console.log(`screenshotting ${url}`);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({
    width: 1400,
    height: 1300,
    deviceScaleFactor: 2,
  });
  await page.goto(url);
  const buffer = await page.screenshot({
    clip: {
      x: 760,
      y: 260,
      width: 625,
      height: 877,
    },
    type: "png",
  });
  await browser.close();
  const file = `./screenshots/${id}.png`;
  fs.writeFileSync(file, buffer);
  console.log(`Screenshot saved to ${file}`);
  return { file, buffer, url };
}

async function generateThemeFromTweet(id: string) {
  const tweet = await getUserLastTweet(id);
  const colors = getColors(tweet.text);
  if (colors.length === 0) return;
  if (colors.length === 1) {
    const url = generateUrl({ primary: colors[0] });
    const { file } = await screenshotUrl(url, tweet.id);
    return {
      colors,
      url,
      file,
      tweet,
    };
  }
  if (colors.length === 5) {
    const url = generateUrl({
      primary: colors[0],
      secondary: colors[1],
      tertiary: colors[2],
      custom: colors.slice(3),
    });
    const { file } = await screenshotUrl(url, tweet.id);
    return {
      colors,
      url,
      file,
      tweet,
    };
  }
}

async function main() {
  const users = await getUsers();
  for (const user of users) {
    const { url, colors, file, tweet } = await generateThemeFromTweet(user.id);

    const sb: string[] = [];
    sb.push(`Generated @materialdesign Theme 🎨`);
    sb.push(``);
    if (colors.length === 1) {
      sb.push(`Primary Color: ${colors[0]}`);
    } else if (colors.length > 1) {
      sb.push(`Primary Color: ${colors[0]}`);
      sb.push(`Secondary Color: ${colors[1]}`);
      sb.push(`Tertiary Color: ${colors[2]}`);
      sb.push(`Custom Colors: ${colors.slice(3).join(", ")}`);
    }
    sb.push(``);
    sb.push(`${url}`);

    const tweetText = sb.join("\n");
    const mediaId = await client.v1.uploadMedia(file);
    try {
      const newTweet = await api.tweet(tweetText, {
        media: {
          media_ids: [mediaId],
        },
        quote_tweet_id: tweet.id,
      });
      console.log(`Tweeted ${newTweet}`);
    } catch (error) {
      console.log('Error tweeting:', error);
    }
  }
}

main();
