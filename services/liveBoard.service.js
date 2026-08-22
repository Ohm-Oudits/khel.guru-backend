import { listHydratedSportsEvents } from "./sportsbookEvents.service.js";
import {
  emitLiveBoard,
  emitSportSnapshot,
} from "../socket/modules/sports/sports.emitter.js";

const slimMarkets = (markets = []) =>
  markets.map((market) => ({
    _id: market._id,
    title: market.title,
    marketType: market.marketType,
    providerMarketKey: market.providerMarketKey,
    status: market.status,
    selections: market.selections,
    latestSnapshotAt: market.latestSnapshotAt,
  }));

export const pushLiveBoards = async () => {
  const events = await listHydratedSportsEvents({
    status: "live",
    limit: 250,
  });

  for (const event of events) {
    emitLiveBoard({
      eventId: event._id,
      sportGroup: event.sportGroup,
      status: event.status,
      scoreboard: event.scoreboard || {},
      markets: slimMarkets(event.markets),
    });
  }

  return { pushed: events.length };
};

export const pushSportSnapshots = async (sportGroups = []) => {
  const unique = [...new Set(sportGroups.filter(Boolean))];
  let pushed = 0;
  for (const sportGroup of unique) {
    const events = await listHydratedSportsEvents({
      sportKey: sportGroup,
      limit: 250,
    });
    emitSportSnapshot({ sportKey: sportGroup, events });
    pushed += 1;
  }
  return { pushed };
};
