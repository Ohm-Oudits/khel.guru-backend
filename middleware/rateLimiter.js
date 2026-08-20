import dotenv from "dotenv";
dotenv.config();

// Simple in-memory rate limiter (for production, use Redis)
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanup();
  }

  // Clean up old entries every minute
  cleanup() {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 minutes

      for (const [key, data] of this.requests.entries()) {
        if (now - data.resetTime > windowMs) {
          this.requests.delete(key);
        }
      }
    }, 60000);

    if (typeof cleanupInterval.unref === "function") {
      cleanupInterval.unref();
    }
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 minutes
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000;

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    const requestData = this.requests.get(identifier);

    // Reset if window has passed
    if (now > requestData.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    // Increment counter
    requestData.count++;

    if (requestData.count > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: requestData.resetTime,
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - requestData.count,
      resetTime: requestData.resetTime,
    };
  }
}

const rateLimiter = new RateLimiter();

// General rate limiter middleware
export const apiLimiter = (req, res, next) => {
  const identifier = req.ip;
  const result = rateLimiter.isAllowed(identifier);

  // Set rate limit headers
  res.set({
    "X-RateLimit-Limit": process.env.RATE_LIMIT_MAX_REQUESTS || 100,
    "X-RateLimit-Remaining": result.remaining || 0,
    "X-RateLimit-Reset": result.resetTime
      ? new Date(result.resetTime).toISOString()
      : "",
  });

  if (!result.allowed) {
    res.set("Retry-After", result.retryAfter);
    return res.status(429).json({
      success: false,
      error: "Too many requests, please try again later",
      retryAfter: result.retryAfter,
    });
  }

  next();
};

// Strict rate limiter for authentication endpoints
export const authLimiter = (req, res, next) => {
  const identifier = `${req.ip}:auth`;
  const result = rateLimiter.isAllowed(identifier);

  // More restrictive limits for auth endpoints
  const authMaxRequests = 10;

  if (result.count > authMaxRequests) {
    return res.status(429).json({
      success: false,
      error: "Too many authentication attempts, please try again later",
      retryAfter: result.retryAfter,
    });
  }

  next();
};

// Game-specific rate limiter
export const gameLimiter = (req, res, next) => {
  const userId = req.user?.id || req.ip;
  const identifier = `${userId}:game`;
  const result = rateLimiter.isAllowed(identifier);

  // Game-specific limits
  const gameMaxRequests = 500; // More lenient for game actions

  if (result.count > gameMaxRequests) {
    return res.status(429).json({
      success: false,
      error: "Too many game requests, please slow down",
      retryAfter: result.retryAfter,
    });
  }

  next();
};
