const { Component } = require('@serverless-devs/s-core');
const ServerlessError = require('./utils/error');
const Logs = require('./utils/logs');
const Logger = require('./utils/logger');

const getHelp = require('./utils/help');
const moment = require('moment');

class LogsComponent extends Component {
  constructor() {
    super();
    this.logger = new Logger()
  }

  async logs (inputs) {
    this.help(inputs, getHelp(inputs));

    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;

    const {
      Region: region,
      LogConfig: logConfig,
      Topic: topic,
      Query: query
    } = properties;

    const logsClient = new Logs(credentials, region);
    const projectName = logConfig.Project;
    const logStoreName = logConfig.LogStore;

    const args = this.args(inputs.Args, undefined, ['s', 'startTime', 'e', 'endTime'], undefined);
    const cmdParameters = args.Parameters || {};
    const { t, tail } = args.Parameters;
    if (t || tail) {
      await logsClient.realtime(projectName, logStoreName, topic, query);
    } else {
      let from = moment().subtract(20, 'minutes').unix();
      let to = moment().unix();
      if ((cmdParameters.s || cmdParameters.startTime) && (cmdParameters.e || cmdParameters.endTime)) {
        from = (new Date(cmdParameters.s || cmdParameters.startTime)).getTime() / 1000;
        to = (new Date(cmdParameters.e || cmdParameters.endTime)).getTime() / 1000;
      } else {
        // 20 minutes ago
        this.logger.warn('By default, find logs within 20 minutes...\n');
      }

      const keyword = cmdParameters.k || cmdParameters.keyword;
      const type = cmdParameters.t || cmdParameters.type;
      const requestId = cmdParameters.r || cmdParameters.requestId;

      const queryErrorLog = type === 'failed';

      const historyLogs = await logsClient.history(projectName, logStoreName, from, to, topic, query, keyword, queryErrorLog, requestId)

      logsClient.printLogs(historyLogs)
    }
  }

  async create (inputs) {
    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;
    const {
      Region: region,
      LogConfig: logConfig,
    } = properties;

    const logsClient = new Logs(credentials, region);
    return await logsClient.initLogConfig(logConfig);
  }

  async remove (inputs) {
    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;
    const {
      Region: region,
      LogConfig: logConfig,
    } = properties;

    const logsClient = new Logs(credentials, region);
    return await logsClient.removeProject(logConfig.Project);
  }
}

module.exports = LogsComponent;
