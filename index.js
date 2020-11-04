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

  checkInput (region, serviceName, functionName, logConfig) {
    if (!region) {
      new ServerlessError({ code: 'RegionNotFount', message: 'Region is empty.' }, true)
    }

    if (!serviceName) {
      new ServerlessError({
        code: 'ServiceNameNotFount',
        message: 'Service Name is empty.'
      }, true);
    }

    if (!functionName) {
      new ServerlessError({
        code: 'FunctionNameNotFount',
        message: 'Function Name is empty.'
      }, true);
    }

    if (!logConfig) {
      new ServerlessError({
        code: 'LogNotFount',
        message: 'Log config is empty.'
      }, true);
    }
    const isAuto = typeof logConfig === 'string' && logConfig !== 'Auto';
    const isObj = typeof logConfig !== 'string' && !(logConfig.Project && logConfig.LogStore)
    if (isAuto || isObj) {
      new ServerlessError({
        code: 'LogConfigError',
        message: 'Missing Log definition in template.yml.\nRefer to https://github.com/Serverless-Devs-Awesome/fc-alibaba-component#log'
      }, true);
    }
  }

  async logs (inputs) {
    this.help(inputs, getHelp(inputs));

    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;

    const {
      Region: region,
      Service: serviceProp = {},
      Function: functionProp = {}
    } = properties;
    const serviceName = serviceProp.Name;
    const logConfig = serviceProp.Log;
    const functionName = functionProp.Name;

    this.checkInput(region, serviceName, functionName, logConfig);
    

    const logsClient = new Logs(credentials, region);
    const { projectName, logStoreName } = logsClient.processLogAutoIfNeed(logConfig);

    const args = this.args(inputs.Args, undefined, ['s', 'startTime', 'e', 'endTime'], undefined);

    const cmdParameters = args.Parameters || {};
    const {
      t,
      tail
    } = args.Parameters;
    if (t || tail) {
      await logsClient.realtime(projectName, logStoreName, serviceName, functionName)
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

      const query = cmdParameters.k || cmdParameters.keyword;
      const type = cmdParameters.t || cmdParameters.type;
      const requestId = cmdParameters.r || cmdParameters.requestId;

      const queryErrorLog = type === 'failed';

      const historyLogs = await logsClient.history(projectName, logStoreName, from, to, serviceName, functionName, query, queryErrorLog, requestId)

      logsClient.printLogs(historyLogs)
    }
  }

  async transformLogConfig(inputs) {
    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;
    const {
      Region: region,
      Service: serviceProp = {},
    } = properties;
    const logConfig = serviceProp.Log || {};

    const logsClient = new Logs(credentials, region);
    return await logsClient.transformLogConfig(logConfig);
  }
}

module.exports = LogsComponent;
