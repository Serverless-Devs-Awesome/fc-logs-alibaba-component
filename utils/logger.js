const { Log } = require('@serverless-devs/s-core');

class Logger extends Log {
  constructor(option) {
    super();
    this.option = option || { num: 0 };
  }

  log (message, option = {}) {
    option = Object.assign(this.option, option);
    super.log(message, option);
  }

  info (message, option = {}) {
    option = Object.assign(this.option, option);
    super.info(message, option);
  }

  warn (message, option = {}) {
    option = Object.assign(this.option, option);
    super.warn(message, option);
  }

  error (message, option = {}) {
    option = Object.assign(this.option, option);
    super.error(message, option);
  }

  success (message, option = {}) {
    option = Object.assign(this.option, option);
    super.success(message, option);
  }
}

module.exports = Logger;
