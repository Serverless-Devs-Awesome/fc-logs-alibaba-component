const Logger = require('./logger');

class ServerlessError {
  constructor({ code, message }, throwError = true) {
    const logger = new Logger();
    if (throwError) {
      const err = new Error(message);
      err.name = code;
      throw err;
    } else {
      logger.error(message);
    }
  }
}

module.exports = ServerlessError;