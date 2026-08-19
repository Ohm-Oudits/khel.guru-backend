export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    const userRoles = req.user?.roles || [];

    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
