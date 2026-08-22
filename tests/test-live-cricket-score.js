import assert from "node:assert/strict";

import {
  cardMatchesEvent,
  discoverCricbuzzLivePages,
  isCompletedCricketCard,
  isStumpsCricketCard,
  parseCricbuzzLiveHtml,
  parseEspnLiveMarkdown,
  parseInningsScore,
  scoreboardFromCard,
} from "../services/sportsbookProviders/liveCricketScoreProvider.js";

assert.deepEqual(parseInningsScore("151", "8", "34.3"), {
  runs: 151,
  wickets: 8,
  overs: 34.3,
});
assert.equal(parseInningsScore("64", null, null).wickets, null);

const markdown = `
# Australia vs Bangladesh, 2nd Test at Mackay - Live Cricket Score

![flag][Bangladesh](https://www.espncricinfo.com/team/bangladesh-25 "Bangladesh")

64

![flag][Australia](https://www.espncricinfo.com/team/australia-2 "Australia")

(34.3 ov) 151/8

Day 1 - Session 3: Australia lead by 87 runs.
`;

const card = parseEspnLiveMarkdown(markdown);
assert.equal(card.teams[0].name, "Bangladesh");
assert.equal(card.teams[0].runs, 64);
assert.equal(card.teams[0].wickets, null);
assert.equal(card.teams[1].name, "Australia");
assert.equal(card.teams[1].runs, 151);
assert.equal(card.teams[1].wickets, 8);
assert.equal(card.teams[1].overs, 34.3);
assert.match(card.note, /lead by 87/);

const event = {
  _id: "live-ban-aus",
  sportGroup: "cricket",
  sportKey: "cricket_test_match",
  status: "live",
  competitors: [
    { name: "Bangladesh", shortName: "BAN", role: "home" },
    { name: "Australia", shortName: "AUS", role: "away" },
  ],
  scoreboard: {
    home: 64,
    homeWickets: 10,
    away: 132,
    awayWickets: 4,
    awayOvers: 29,
    batting: "away",
    note: "stale",
  },
};

assert.equal(cardMatchesEvent(card, event), true);
const next = scoreboardFromCard(card, event);
assert.equal(next.away, 151);
assert.equal(next.awayWickets, 8);
assert.equal(next.awayOvers, 34.3);
assert.equal(next.home, 64);
assert.equal(next.homeWickets, 10);
assert.equal(next.batting, "away");

const cricbuzzHtml = `
<meta property="og:title" content="AUS 165/8 (39.1) vs BAN 64 (Nathan Lyon 10)">
"matchScoreDetails":{"matchId":148327,"inningsScoreList":[{"inningsId":1,"batTeamId":6,"batTeamName":"BAN","score":64,"wickets":10,"overs":34,"isDeclared":false,"isFollowOn":false,"ballNbr":204},{"inningsId":2,"batTeamId":4,"batTeamName":"AUS","score":165,"wickets":8,"overs":39.1,"isDeclared":false,"isFollowOn":false,"ballNbr":235}],"isMatchNotCovered":false,"customStatus":"Day 1: 3rd Session - Australia lead by 101 runs","state":"In Progress"}
`;
const liveCard = parseCricbuzzLiveHtml(cricbuzzHtml);
assert.equal(liveCard.teams.length, 2);
assert.equal(
  liveCard.teams.find((team) => team.name === "AUS").runs,
  165
);
assert.equal(
  liveCard.teams.find((team) => team.name === "AUS").overs,
  39.1
);
assert.equal(
  liveCard.teams.find((team) => team.name === "BAN").runs,
  64
);
assert.match(liveCard.note, /lead by 101/);
assert.equal(cardMatchesEvent(liveCard, event), true);
const fromCricbuzz = scoreboardFromCard(liveCard, event);
assert.equal(fromCricbuzz.away, 165);
assert.equal(fromCricbuzz.awayWickets, 8);
assert.equal(fromCricbuzz.awayOvers, 39.1);

const discovered = discoverCricbuzzLivePages(
  `<a title="Bangladesh vs Australia, 2nd Test - Live" href="/live-cricket-scores/148327/ban-vs-aus-2nd-test-bangladesh-tour-of-australia-2026"></a>`,
  [event]
);
assert.equal(
  discovered[0],
  "https://www.cricbuzz.com/live-cricket-scores/148327/ban-vs-aus-2nd-test-bangladesh-tour-of-australia-2026"
);

const t20Markdown = `
# Kingsmen vs Victoria CA, 5th Match at Darwin, Top End T20, Aug 22 2026 - Live Cricket Score

[Hyderabad Kingsmen Academy](https://www.espncricinfo.com/team/hyderabad-kingsmen-academy-1549016 "Hyderabad Kingsmen Academy")  147
[Victoria CA XI](https://www.espncricinfo.com/team/victoria-ca-xi-279182 "Victoria CA XI")  (17.5/20 ov, T:148) 139/5
Victoria CA need 9 runs in 13 balls.
`;
const t20Card = parseEspnLiveMarkdown(t20Markdown);
assert.equal(t20Card.teams[0].name, "Hyderabad Kingsmen Academy");
assert.equal(t20Card.teams[0].runs, 147);
assert.equal(t20Card.teams[1].name, "Victoria CA XI");
assert.equal(t20Card.teams[1].runs, 139);
assert.equal(t20Card.teams[1].wickets, 5);
assert.equal(t20Card.teams[1].overs, 17.5);
const t20Event = {
  sportGroup: "cricket",
  competitors: [
    { name: "HYK", shortName: "HYK" },
    { name: "Victoria", shortName: "VIC" },
  ],
};
assert.equal(cardMatchesEvent(t20Card, t20Event), true);
const t20Board = scoreboardFromCard(t20Card, t20Event);
assert.equal(t20Board.home, 147);
assert.equal(t20Board.away, 139);
assert.equal(t20Board.awayWickets, 5);
assert.equal(t20Board.awayOvers, 17.5);
assert.equal(t20Board.completed, false);
assert.equal(isCompletedCricketCard({ state: "In Progress", note: "Australia lead by 101" }), false);
assert.equal(isCompletedCricketCard({ state: "Complete", note: "Australia won by 8 wickets" }), true);
assert.equal(isStumpsCricketCard({ state: "Stumps", note: "Day 1: Stumps - Australia lead by 101 runs" }), true);
assert.equal(isStumpsCricketCard({ state: "In Progress", note: "Day 2: 1st Session" }), false);

const finishedHtml = `
"inningsScoreList":[{"inningsId":1,"batTeamName":"HYK","score":147,"wickets":10,"overs":20},{"inningsId":2,"batTeamName":"VIC","score":140,"wickets":10,"overs":19.2}],"isMatchNotCovered":false,"customStatus":"Hyderabad Kingsmen Academy won by 7 runs","state":"Complete"}
`;
const finishedCard = parseCricbuzzLiveHtml(finishedHtml);
assert.equal(finishedCard.completed, true);

console.log("live cricket score parser and matcher passed");
