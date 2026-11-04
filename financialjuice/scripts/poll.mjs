import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const FJ_INFO_TOKEN = process.env.FJ_INFO_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BARK_DEVICE_KEY = process.env.BARK_DEVICE_KEY;

if (!FJ_INFO_TOKEN || !ANTHROPIC_API_KEY || !BARK_DEVICE_KEY) {
  throw new Error('Missing required env vars: FJ_INFO_TOKEN, ANTHROPIC_API_KEY, BARK_DEVICE_KEY');
}

const STATE_PATH = new URL('../state.json', import.meta.url);

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastSeenId: 0 };
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

async function fetchHeadlines() {
  const url = `https://live.financialjuice.com/FJService.asmx/Startup?info=${encodeURIComponent(FJ_INFO_TOKEN)}&TimeOffset=1&tabID=0&oldID=0&TickerID=0&FeedCompanyID=0&strSearch=&extraNID=0`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/json; charset=utf-8',
      origin: 'https://www.financialjuice.com',
      referer: 'https://www.financialjuice.com/',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`financialjuice request failed: HTTP ${res.status}. Session token likely expired — re-capture FJ_INFO_TOKEN from the browser.`);
  }

  const outer = await res.json();
  const data = JSON.parse(outer.d);
  return data.News ?? [];
}

async function classifyHeadlines(headlines) {
  const prompt = `You are a financial markets monitor. Below is a list of news headlines with their IDs. For EACH headline, decide if it describes news significant enough to cause a sudden, material move in major markets (equities, bonds, FX, commodities, crypto) within minutes — e.g. surprise central bank action, war/geopolitical shock, major bank/corporate failure, surprise inflation/jobs/GDP data, unscheduled resignation or death of a major leader, major unscheduled M&A or bankruptcy of a mega-cap company. Ignore routine news, scheduled/in-line data, analyst opinions, minor corporate updates, and recaps of news already priced in.

Respond with ONLY a JSON array (no prose, no markdown fences), one object per headline, in this exact shape:
[{"newsId": <number>, "major": <boolean>, "reason": "<short reason, under 15 words>"}]

Headlines:
${headlines
  .map(
    (h) =>
      `ID ${h.NewsID}: ${h.Title.trim()}${h.Description ? ' — ' + h.Description.replace(/<[^>]+>/g, '').slice(0, 200) : ''}`
  )
  .join('\n')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic request failed: HTTP ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const text = json.content.map((b) => b.text ?? '').join('').trim();
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(cleaned);
}

async function sendAlert(headline) {
  const title = encodeURIComponent('Market Alert');
  const body = encodeURIComponent(headline.Title.trim().slice(0, 200));
  const url = `https://api.day.app/${BARK_DEVICE_KEY}/${title}/${body}?sound=alarm.caf&group=market-news&url=${encodeURIComponent(headline.EURL || '')}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Bark notification failed for NewsID ${headline.NewsID}: HTTP ${res.status}`);
  }
}

async function main() {
  const state = loadState();
  const news = await fetchHeadlines();
  const newItems = news.filter((n) => n.NewsID > state.lastSeenId).sort((a, b) => a.NewsID - b.NewsID);

  if (newItems.length === 0) {
    console.log('No new headlines.');
    return;
  }

  console.log(`Found ${newItems.length} new headline(s).`);
  const verdicts = await classifyHeadlines(newItems);
  const verdictMap = new Map(verdicts.map((v) => [v.newsId, v]));

  for (const item of newItems) {
    const verdict = verdictMap.get(item.NewsID);
    if (verdict?.major) {
      console.log(`MAJOR: [${item.NewsID}] ${item.Title.trim()} — ${verdict.reason}`);
      await sendAlert(item);
    } else {
      console.log(`skip: [${item.NewsID}] ${item.Title.trim()}`);
    }
  }

  state.lastSeenId = Math.max(...newItems.map((n) => n.NewsID), state.lastSeenId);
  saveState(state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
