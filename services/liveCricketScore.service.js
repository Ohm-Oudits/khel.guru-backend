import SportsEvent from "../models/sportsEvent.model.js";
import { publishIngestChanges } from "../socket/modules/sports/sports.emitter.js";
import {
  cardMatchesEvent,
  fetchLiveCricketScorecards,
  scoreboardFromCard,
} from "./sportsbookProviders/liveCricketScoreProvider.js";

const scoreboardChanged = (previous = {}, next = {}) =>
  JSON.stringify(previous || {}) !== JSON.stringify(next || {});

export const applyLiveCricketScorecards = async (
  cards,
  { events } = {}
) => {
  const liveEvents =
    events ||
    (await SportsEvent.find(
      { status: "live", sportGroup: "cricket" },
      {
        competitors: 1,
        scoreboard: 1,
        sportGroup: 1,
        sportKey: 1,
        status: 1,
        startTime: 1,
      }
    ));

  const changes = [];
  let updated = 0;

  for (const event of liveEvents) {
    const card = cards.find((entry) => cardMatchesEvent(entry, event));
    if (!card) continue;

    const nextScoreboard = {
      ...scoreboardFromCard(card, event),
      liveSyncedAt: new Date().toISOString(),
    };
    if (!scoreboardChanged(event.scoreboard, nextScoreboard)) continue;

    let status = event.status;
    if (nextScoreboard.completed) {
      const { settleEvent } = await import("./betSettlement.service.js");
      const settled = await settleEvent(event._id, {
        actor: { type: "system" },
        finalScoreboard: nextScoreboard,
      });
      status = settled.skipped ? event.status : "settled";
    } else {
      await SportsEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            scoreboard: nextScoreboard,
            providerLastUpdate: new Date(),
          },
        }
      );
    }

    updated += 1;
    changes.push({
      eventId: event._id,
      sportKey: event.sportKey,
      sportGroup: event.sportGroup,
      status,
      startTime: event.startTime,
      statusChanged: status !== event.status,
      previousStatus: event.status,
      scoreboardChanged: true,
      scoreboard: nextScoreboard,
      marketChanges: [],
    });
  }

  publishIngestChanges(changes);
  return { fetched: cards.length, matched: liveEvents.length, updated };
};

export const runLiveCricketScorePoll = async () => {
  const events = await SportsEvent.find(
    { status: "live", sportGroup: "cricket" },
    {
      competitors: 1,
      scoreboard: 1,
      sportGroup: 1,
      sportKey: 1,
      status: 1,
      startTime: 1,
    }
  );
  const cards = await fetchLiveCricketScorecards({ events });
  const result = await applyLiveCricketScorecards(cards, { events });
  const summary = cards
    .map((card) =>
      (card.teams || [])
        .map(
          (team) =>
            `${team.name} ${team.runs}${
              team.wickets == null ? "" : `/${team.wickets}`
            }${team.overs == null ? "" : ` (${team.overs})`}`
        )
        .join(" vs ")
    )
    .filter(Boolean)
    .join(" | ");
  console.log(
    `cricketLive fetched=${result.fetched} matched=${result.matched} updated=${result.updated}${
      summary ? ` ${summary}` : ""
    }`
  );
  return result;
};
