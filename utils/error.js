
class ServerlessError {
  constructor({ code, message }) {
    throw new Error({ code, message });
  }

}

module.exports = ServerlessError;