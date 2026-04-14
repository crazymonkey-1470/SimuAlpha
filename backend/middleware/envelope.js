/**
 * Response Envelope Middleware
 * Adds res.success() and res.fail() helpers to standardize API responses.
 */

function envelope(req, res, next) {
  res.success = (data, meta = {}) => {
    return res.json({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), ...meta },
    });
  };

  res.fail = (error, status = 400, details = null) => {
    res.status(status);
    return res.json({
      success: false,
      error,
      details,
      meta: { timestamp: new Date().toISOString() },
    });
  };

  next();
}

module.exports = { envelope };
