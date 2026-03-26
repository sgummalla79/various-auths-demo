// -----------------------------------------------
// Role Guard Middleware
//
// Logs: required roles vs actual role
// -----------------------------------------------
const requireRole = (...roles) => (req, res, next) => {
  const userRole = req.user?.role;

  if (!roles.includes(userRole)) {
    console.warn(`[${req.requestId}] Role ❌ — required: [${roles.join('|')}] got: ${userRole}`);
    return res.status(403).json({ error: `Role required: ${roles.join(' or ')}` });
  }

  console.log(`[${req.requestId}] Role ✅ ${userRole} allowed for [${roles.join('|')}]`);
  next();
};

module.exports = requireRole;