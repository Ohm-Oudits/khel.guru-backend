import { io } from "../../socket.js";

// Every emitter no-ops when the socket server is not initialized (tests,
// scripts) — `io` is a live binding that setupSocket assigns at boot.

const sportsNamespace = () => (io ? io.of("/sports") : null);

const toEventRooms = (nsp, { eventId, sportGroup }) => {
  let cursor = nsp.to(`sports:event:${eventId}`);
  if (sportGroup) {
    cursor = cursor.to(`sports:sport:${sportGroup}`);
  }
  return cursor;
};

export const emitOddsUpdate = ({
  eventId,
  sportGroup,
  marketId,
  providerMarketKey,
  marketType,
  bookmakerKey,
  outcomes,
  capturedAt,
}) => {
  const nsp = sportsNamespace();
  if (!nsp) return;

  toEventRooms(nsp, { eventId, sportGroup }).emit("odds_update", {
    eventId,
    sportGroup,
    marketId,
    providerMarketKey,
    marketType,
    bookmakerKey,
    outcomes,
    capturedAt,
  });
};

export const emitEventState = ({
  eventId,
  sportGroup,
  status,
  previousStatus = null,
  startTime = null,
}) => {
  const nsp = sportsNamespace();
  if (!nsp) return;

  toEventRooms(nsp, { eventId, sportGroup }).emit("event_state", {
    eventId,
    sportGroup,
    status,
    previousStatus,
    startTime,
  });
};

export const emitScoreboardUpdate = ({ eventId, sportGroup, scoreboard }) => {
  const nsp = sportsNamespace();
  if (!nsp) return;

  toEventRooms(nsp, { eventId, sportGroup }).emit("scoreboard_update", {
    eventId,
    sportGroup,
    scoreboard,
  });
};

export const emitMarketSuspended = ({ eventId, sportGroup, marketId, status }) => {
  const nsp = sportsNamespace();
  if (!nsp) return;

  toEventRooms(nsp, { eventId, sportGroup }).emit("market_suspended", {
    eventId,
    sportGroup,
    marketId,
    status,
  });
};

// Bet settlement notifications go to the user's private room on the default
// namespace, joined at connection time in socket/socket.js.
export const emitBetSettled = ({
  userId,
  betId,
  result,
  payout,
  balanceAfter,
  selectionName,
  eventName,
}) => {
  if (!io) return;

  io.to(`user:${userId}`).emit("bet_settled", {
    betId,
    result,
    payout,
    balanceAfter,
    selectionName,
    eventName,
  });
};

// Fan a full ingest change report out to the affected rooms. Only genuine
// changes reach this point — the ingest layer filters unchanged feeds.
export const publishIngestChanges = (changes = []) => {
  if (!io || !changes.length) return;

  for (const change of changes) {
    if (change.statusChanged) {
      emitEventState({
        eventId: change.eventId,
        sportGroup: change.sportGroup,
        status: change.status,
        previousStatus: change.previousStatus,
        startTime: change.startTime,
      });
    }

    if (change.scoreboardChanged) {
      emitScoreboardUpdate({
        eventId: change.eventId,
        sportGroup: change.sportGroup,
        scoreboard: change.scoreboard,
      });
    }

    for (const marketChange of change.marketChanges || []) {
      for (const bookmaker of marketChange.changedBookmakers || []) {
        emitOddsUpdate({
          eventId: change.eventId,
          sportGroup: change.sportGroup,
          marketId: marketChange.marketId,
          providerMarketKey: marketChange.providerMarketKey,
          marketType: marketChange.marketType,
          bookmakerKey: bookmaker.bookmakerKey,
          outcomes: bookmaker.outcomes,
          capturedAt: bookmaker.capturedAt,
        });
      }
    }
  }
};
