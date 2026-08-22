import axios from "axios";

import { normalizeTeamName } from "../sportsbookEvents.service.js";

const CRICBUZZ_LIVE_HUB =
  "https://www.cricbuzz.com/cricket-match/live-scores";

const DEFAULT_PAGES = [
  "https://www.cricbuzz.com/live-cricket-scores/148327/aus-vs-ban-2nd-test-bangladesh-tour-of-australia-2026",
  "https://www.espncricinfo.com/series/bangladesh-in-australia-2026-1527258/australia-vs-bangladesh-2nd-test-1527274/live-cricket-score",
  "https://www.espncricinfo.com/series/top-end-t20-series-australia-2026-1548889/hyderabad-kingsmen-academy-vs-victoria-ca-xi-5th-match-1549027/live-cricket-score",
];

const TEAM_LINE =
  /\[([A-Za-z][A-Za-z0-9 .&'-]{1,50})\]\((?:https?:\/\/www\.espncricinfo\.com\/team\/)?[^)]+\)\s*(?:\(([\d.]+)(?:\/[\d.]+)?\s*ov[^)]*\)\s*)?(\d+)(?:\/(\d+))?/g;

const NOTE_LINE =
  /((?:Day\s+\d+[^\n.]*)|(?:[^.\n]{8,80}(?:lead|trail|need|won|require)[^\n.]*))/i;

const OG_SCORE =
  /([A-Z]{2,5})\s+(\d+)(?:\/(\d+))?(?:\s+\(([\d.]+)\))?\s+vs\s+([A-Z]{2,5})\s+(\d+)(?:\/(\d+))?(?:\s+\(([\d.]+)\))?/i;

const configuredPages = () => {
  const fromEnv = String(process.env.CRICKET_LIVE_SCORE_PAGES || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_PAGES;
};

const readerPrefix = () =>
  process.env.CRICKET_SCORE_READER_PREFIX || "https://r.jina.ai/";

const decodeEmbeddedJson = (html = "") =>
  String(html).replace(/\\"/g, '"').replace(/\\n/g, " ");

export const parseInningsScore = (runs, wickets, overs) => {
  const parsedRuns = Number(runs);
  const parsedWickets =
    wickets === undefined || wickets === null || wickets === ""
      ? null
      : Number(wickets);
  const parsedOvers =
    overs === undefined || overs === null || overs === ""
      ? null
      : Number(overs);

  return {
    runs: Number.isFinite(parsedRuns) ? parsedRuns : null,
    wickets: Number.isFinite(parsedWickets) ? parsedWickets : null,
    overs: Number.isFinite(parsedOvers) ? parsedOvers : null,
  };
};

const scorecardWindow = (markdown = "") => {
  const heading = markdown.lastIndexOf("- Live Cricket Score");
  if (heading >= 0) return markdown.slice(Math.max(0, heading - 120), heading + 3500);
  const hash = markdown.lastIndexOf("\n# ");
  if (hash >= 0) return markdown.slice(hash, hash + 4000);
  return markdown;
};

export const parseEspnLiveMarkdown = (markdown = "") => {
  const windows = [scorecardWindow(markdown), markdown];
  let teams = [];
  let body = windows[0];

  for (const candidate of windows) {
    teams = [];
    TEAM_LINE.lastIndex = 0;
    for (const match of candidate.matchAll(TEAM_LINE)) {
      const innings = parseInningsScore(match[3], match[4], match[2]);
      if (innings.runs === null) continue;
      teams.push({
        name: match[1].trim(),
        ...innings,
      });
      if (teams.length === 2) break;
    }
    if (teams.length === 2) {
      body = candidate;
      break;
    }
  }

  if (teams.length < 2) return null;

  const noteMatch = body.match(NOTE_LINE);
  const batting =
    teams[1].wickets !== null || teams[1].overs !== null
      ? teams[1].name
      : teams[0].wickets !== null || teams[0].overs !== null
        ? teams[0].name
        : teams[1].name;

  const note = noteMatch ? noteMatch[1].trim().replace(/\.$/, "") : "";
  return {
    teams,
    batting,
    note,
    stumps: isStumpsCricketCard({ note }),
    completed: isCompletedCricketCard({ note }),
  };
};

const teamFromInnings = (row = {}) => {
  const innings = parseInningsScore(row.score, row.wickets, row.overs);
  if (innings.runs === null || !row.batTeamName) return null;
  return { name: String(row.batTeamName).trim(), ...innings };
};

export const parseCricbuzzOgTitle = (html = "") => {
  const og =
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ||
    "";
  const match = og.replace(/\s+/g, " ").match(OG_SCORE);
  if (!match) return null;

  const teams = [
    {
      name: match[1],
      ...parseInningsScore(match[2], match[3], match[4]),
    },
    {
      name: match[5],
      ...parseInningsScore(match[6], match[7], match[8]),
    },
  ].filter((team) => team.runs !== null);

  if (teams.length < 2) return null;
  const batting =
    teams[0].wickets !== null && teams[0].wickets < 10
      ? teams[0].name
      : teams[1].name;
  return { teams, batting, note: "" };
};

export const isStumpsCricketCard = ({ state = "", note = "" } = {}) => {
  const text = `${state} ${note}`;
  if (/\b(won by|beat|beats|match over|complete)\b/i.test(text)) return false;
  return /^stumps$/i.test(String(state).trim()) || /\bstumps\b/i.test(text);
};

export const isCompletedCricketCard = ({ state = "", note = "" } = {}) => {
  const text = `${state} ${note}`;
  if (
    /\b(stumps|in progress|preview|lunch|tea|drinks|delayed|lead|trail|need|require|session)\b/i.test(
      text
    )
  ) {
    return false;
  }
  return (
    /^complete/i.test(String(state).trim()) ||
    /\b(won by|beat|beats|won the|match over|result)\b/i.test(note)
  );
};

export const parseCricbuzzLiveHtml = (html = "") => {
  const decoded = decodeEmbeddedJson(html);
  const listMatch = decoded.match(
    /"inningsScoreList"\s*:\s*(\[[\s\S]*?\])\s*,\s*"isMatchNotCovered"/
  );

  if (listMatch) {
    try {
      const innings = JSON.parse(listMatch[1]);
      const latestByTeam = new Map();
      for (const row of innings) {
        const team = teamFromInnings(row);
        if (team) latestByTeam.set(normalizeTeamName(team.name), team);
      }
      const teams = Array.from(latestByTeam.values());
      if (teams.length >= 2) {
        const battingRow =
          [...innings].reverse().find((row) => Number(row.wickets) < 10) ||
          innings.at(-1);
        const note =
          decoded.match(/"customStatus"\s*:\s*"([^"]+)"/)?.[1]?.replace(
            /\\/g,
            ""
          ) || "";
        const state =
          decoded.match(/"state"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\/g, "") ||
          "";
        return {
          teams,
          batting: battingRow?.batTeamName || teams[1].name,
          note,
          state,
          stumps: isStumpsCricketCard({ state, note }),
          completed: isCompletedCricketCard({ state, note }),
        };
      }
    } catch {
      // Fall through to the og:title line, which Cricbuzz keeps current.
    }
  }

  return parseCricbuzzOgTitle(html);
};

export const parseLiveScoreDocument = (text = "") =>
  parseCricbuzzLiveHtml(text) || parseEspnLiveMarkdown(text);

export const discoverCricbuzzLivePages = (html = "", events = []) => {
  if (!events.length) return [];

  const pages = [];
  const seen = new Set();
  const hrefRe = /href="(\/live-cricket-scores\/\d+\/([^"]+))"/g;

  for (const match of html.matchAll(hrefRe)) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);

    const slugTokens = new Set(
      String(match[2] || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    );

    const matchedEvents = events.filter((event) => {
      const hits = (event.competitors || []).filter((team) => {
        const aliases = [
          String(team.shortName || "").toLowerCase(),
          normalizeTeamName(team.shortName || team.name),
          normalizeTeamName(team.name),
        ].filter(Boolean);
        return aliases.some((alias) => slugTokens.has(alias));
      });
      return hits.length >= 2;
    });

    if (matchedEvents.length) {
      pages.push(`https://www.cricbuzz.com${path}`);
    }
  }

  return pages;
};

export const cardMatchesEvent = (card, event) => {
  if (!card?.teams?.length || !event) return false;
  const eventNames = new Set(
    (event.competitors || [])
      .map((team) => normalizeTeamName(team.shortName || team.name))
      .filter(Boolean)
  );
  const cardNames = card.teams
    .map((team) => normalizeTeamName(team.name))
    .filter(Boolean);
  return cardNames.filter((name) => eventNames.has(name)).length >= 2;
};

export const scoreboardFromCard = (card, event) => {
  const previous = event.scoreboard || {};
  const [home, away] = event.competitors || [];
  const inningsFor = (team) =>
    (card.teams || []).find(
      (entry) =>
        normalizeTeamName(entry.name) ===
        normalizeTeamName(team?.shortName || team?.name)
    );

  const homeInnings = inningsFor(home);
  const awayInnings = inningsFor(away);
  const battingName = normalizeTeamName(card.batting || "");
  const batting =
    battingName &&
    battingName === normalizeTeamName(home?.shortName || home?.name)
      ? "home"
      : battingName &&
          battingName === normalizeTeamName(away?.shortName || away?.name)
        ? "away"
        : previous.batting || "";

  const closedWickets = (innings, isBatting) => {
    if (!innings) return null;
    if (innings.wickets !== null) return innings.wickets;
    if (!isBatting && innings.runs !== null) return 10;
    return null;
  };

  return {
    ...previous,
    home: homeInnings?.runs ?? previous.home,
    homeWickets: closedWickets(homeInnings, batting === "home") ?? previous.homeWickets,
    homeOvers: homeInnings?.overs ?? previous.homeOvers,
    away: awayInnings?.runs ?? previous.away,
    awayWickets: closedWickets(awayInnings, batting === "away") ?? previous.awayWickets,
    awayOvers: awayInnings?.overs ?? previous.awayOvers,
    batting,
    note: card.note || previous.note,
    stumps: Boolean(
      card.stumps ??
        isStumpsCricketCard({ state: card.state, note: card.note || previous.note })
    ),
    completed: Boolean(card.completed) || Boolean(previous.completed),
  };
};

const fetchPageMarkdown = async (pageUrl) => {
  const bust = `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  const direct = await axios
    .get(bust, {
      timeout: 12000,
      headers: {
        Accept: "text/html,application/json",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    })
    .catch(() => null);

  if (
    direct?.data &&
    typeof direct.data === "string" &&
    parseLiveScoreDocument(direct.data)
  ) {
    return direct.data;
  }

  const readerUrl = `${readerPrefix()}${pageUrl}`;
  const proxied = await axios.get(readerUrl, {
    timeout: 20000,
    headers: {
      Accept: "text/plain",
      "X-Cache-Tolerance": "0",
      "X-No-Cache": "true",
    },
  });
  return typeof proxied.data === "string" ? proxied.data : "";
};

export const fetchLiveCricketScorecards = async ({
  pages,
  events = [],
  fetchPage = fetchPageMarkdown,
} = {}) => {
  const configured = pages || configuredPages();
  const discovered = [];

  if (!pages && events.length) {
    try {
      const hub = await fetchPage(CRICBUZZ_LIVE_HUB);
      discovered.push(...discoverCricbuzzLivePages(hub, events));
    } catch (error) {
      console.warn(`Cricbuzz live hub failed: ${error.message}`);
    }
  }

  const cards = [];
  const seen = new Set();
  const allEventsCovered = () =>
    events.length > 0 &&
    events.every((event) => cards.some((card) => cardMatchesEvent(card, event)));

  for (const page of [...discovered, ...configured]) {
    if (seen.has(page)) continue;
    seen.add(page);
    if (allEventsCovered()) break;
    try {
      const document = await fetchPage(page);
      const card = parseLiveScoreDocument(document);
      if (card) cards.push({ ...card, source: page });
    } catch (error) {
      console.warn(`Live cricket score page failed (${page}): ${error.message}`);
    }
  }

  return cards;
};
