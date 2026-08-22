import Market from "../models/market.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { publishIngestChanges } from "../socket/modules/sports/sports.emitter.js";

const MIN_PRICE = 1.01;
const MAX_PRICE = 1000;

export const driftPrice = (price, rng = Math.random) => {
  if (price === null || price === undefined || price === "") return price;
  const current = Number(price);
  if (!Number.isFinite(current) || current <= 1) return current;

  let next = current * (1 + (rng() * 0.06 - 0.03));
  next = Math.min(MAX_PRICE, Math.max(MIN_PRICE, next));
  next = Number(next.toFixed(2));
  if (next === Number(current.toFixed(2))) {
    next = Number(
      Math.min(
        MAX_PRICE,
        Math.max(MIN_PRICE, current * (rng() < 0.5 ? 0.99 : 1.01))
      ).toFixed(2)
    );
  }
  return next;
};

export const driftSelections = (selections = [], rng = Math.random) => {
  let changed = false;
  const next = selections.map((selection) => {
    if (selection.status && selection.status !== "open") return selection;
    if (!Number.isFinite(Number(selection.priceDecimal))) return selection;
    const priceDecimal = driftPrice(selection.priceDecimal, rng);
    if (priceDecimal === selection.priceDecimal) return selection;
    changed = true;
    return {
      ...(typeof selection.toObject === "function" ? selection.toObject() : selection),
      priceDecimal,
      priceUpdatedAt: new Date(),
    };
  });
  return { selections: next, changed };
};

export const driftLiveEventOdds = async () => {
  const events = await SportsEvent.find(
    { status: "live" },
    { _id: 1, sportGroup: 1, sportKey: 1, status: 1, startTime: 1, scoreboard: 1 }
  );

  const changes = [];

  for (const event of events) {
    const markets = await Market.find({
      eventId: event._id,
      status: { $ne: "settled" },
    });

    const marketChanges = [];
    const nextMarkets = [];

    for (const market of markets) {
      const { selections, changed } = driftSelections(market.selections);
      if (!changed) {
        nextMarkets.push(market.toObject());
        continue;
      }

      market.selections = selections;
      market.latestSnapshotAt = new Date();
      market.markModified("selections");
      await market.save();

      const saved = market.toObject();
      nextMarkets.push(saved);
      marketChanges.push({
        marketId: market._id,
        providerMarketKey: market.providerMarketKey,
        marketType: market.marketType,
        changedBookmakers: [
          {
            bookmakerKey: "simbook",
            bookmakerTitle: "Simbook",
            capturedAt: new Date(),
            outcomes: selections.map((selection) => ({
              key: selection.key,
              name: selection.name,
              line: selection.line ?? null,
              priceDecimal: selection.priceDecimal,
            })),
          },
        ],
      });
    }

    if (!marketChanges.length) continue;

    changes.push({
      eventId: event._id,
      sportKey: event.sportKey,
      sportGroup: event.sportGroup,
      status: event.status,
      startTime: event.startTime,
      statusChanged: false,
      previousStatus: event.status,
      scoreboardChanged: false,
      scoreboard: event.scoreboard,
      marketChanges,
      markets: nextMarkets,
    });
  }

  publishIngestChanges(changes);
  if (changes.length) {
    console.log(`oddsSimLive events=${events.length} changed=${changes.length}`);
  }
  return { events: events.length, changed: changes.length };
};
