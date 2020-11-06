
class ServerlessError {
  constructor(e) {
    if (e instanceof Error) {
      throw e;
    } else {
      const { code, message } = e;
      const err = new Error(message);
      err.name = code;
      throw err;
    }
  }
}

module.exports = ServerlessError;