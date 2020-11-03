const _ = require('lodash');

const getUuid = require('uuid-by-string');
const moment = require('moment');
const inquirer = require('inquirer');
const Logger = require('../logger');
const Client = require('./client');

const isLogConfigAuto = (logConfig) => logConfig === 'Auto';
const generateDefaultLogConfig = (accountId, region) => ({
  project: `aliyun-fc-${region}-${getUuid(accountId)}`,
  logStore: 'function-log'
})
const replaceLineBreak = (logsList = {}) => {
  return _.mapValues(logsList, (value, key) => {
    value.message = value.message.replace(new RegExp(/(\r)/g), '\n');
    return value;
  })
}

class Logs extends Client {
  constructor (credentials, region) {
    super(credentials, region);
    this.slsClient = this.buildSlsClient();
    this.logger = new Logger();
  }

  sleep (ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  printLogs (historyLogs) {
    _.values(historyLogs).forEach((data) => {
      this.logger.info(`\n${data.message}`)
    })
  }

  // 计算日志仓库名称
  processLogAutoIfNeed (logConfig) {
    let projectName;
    let logStoreName;

    if (isLogConfigAuto(logConfig)) {
      const defaultLogConfig = generateDefaultLogConfig(this.accountId, this.region)

      projectName = defaultLogConfig.project
      logStoreName = defaultLogConfig.logStore
    } else {
      projectName = logConfig.Project
      logStoreName = logConfig.LogStore
    }

    return { projectName, logStoreName }
  }

  // 条件过滤
  filterByKeywords (logsList = {}, { requestId, query, queryErrorLog = false }) {
    let logsClone = _.cloneDeep(logsList)

    if (requestId) {
      logsClone = _.pick(logsClone, [requestId])
    }

    if (query) {
      logsClone = _.pickBy(logsClone, (value, key) => {
        const replaceLog = value.message.replace(new RegExp(/(\r)/g), '\n')
        return replaceLog.indexOf(query) !== -1
      })
    }

    if (queryErrorLog) {
      logsClone = _.pickBy(logsClone, (value, key) => {
        const replaceLog = value.message.replace(new RegExp(/(\r)/g), '\n')
        return replaceLog.indexOf(' [ERROR] ') !== -1 || replaceLog.indexOf('Error: ') !== -1
      })
    }

    return logsClone
  }

  // 获取日志
  async getLogs ({ projectName, logStoreName, timeStart, timeEnd, serviceName, functionName }) {
    const requestParams = {
      projectName,
      logStoreName,
      from: timeStart,
      to: timeEnd,
      topic: serviceName,
      query: functionName
    }

    let count;
    let xLogCount;
    let xLogProgress = 'Complete';

    let result;

    do {
      const response = await new Promise((resolve, reject) => {
        this.slsClient.getLogs(requestParams, (error, data) => {
          if (error) {
            reject(error);
          }
          resolve(data);
        })
      })
      const body = response.body;

      if (_.isEmpty(body)) {
        continue;
      }

      count = _.keys(body).length;

      xLogCount = response.headers['x-log-count'];
      xLogProgress = response.headers['x-log-progress'];

      let requestId;
      result = _.values(body).reduce((acc, cur) => {
        const currentMessage = cur.message;
        const found = currentMessage.match('(\\w{8}(-\\w{4}){3}-\\w{12}?)');

        if (!_.isEmpty(found)) {
          requestId = found[0];
        }

        if (requestId) {
          if (!_.has(acc, requestId)) {
            acc[requestId] = {
              timestamp: cur.__time__,
              time: moment.unix(cur.__time__).format('YYYY-MM-DD H:mm:ss'),
              message: ''
            }
          }
          acc[requestId].message = acc[requestId].message + currentMessage;
        }

        return acc;
      }, {})
    } while (xLogCount !== count && xLogProgress !== 'Complete')

    return result;
  }

  async realtime (projectName, logStoreName, serviceName, functionName) {
    let timeStart;
    let timeEnd;
    let times = 1800;

    const consumedTimeStamps = [];

    while (times > 0) {
      await this.sleep(1000);
      times = times - 1;

      timeStart = moment().subtract(10, 'seconds').unix();
      timeEnd = moment().unix();

      const pulledlogs = await this.getLogs({
        projectName,
        logStoreName,
        timeStart,
        timeEnd,
        serviceName,
        functionName
      });

      if (_.isEmpty(pulledlogs)) { continue }

      const notConsumedLogs = _.pickBy(pulledlogs, (data, requestId) => {
        return !_.includes(consumedTimeStamps, data.timestamp);
      })

      if (_.isEmpty(notConsumedLogs)) { continue }

      const replaceLogs = replaceLineBreak(notConsumedLogs);

      this.printLogs(replaceLogs);

      const pulledTimeStamps = _.values(replaceLogs).map((data) => {
        return data.timestamp;
      })

      consumedTimeStamps.push(...pulledTimeStamps);
    }
  }

  async history (projectName, logStoreName, timeStart, timeEnd, serviceName, functionName, query, queryErrorLog = false, requestId) {
    const logsList = await this.getLogs({
      timeStart,
      timeEnd,
      projectName,
      logStoreName,
      serviceName,
      functionName
    })

    return this.filterByKeywords(replaceLineBreak(logsList), { query, requestId, queryErrorLog })
  }
}

module.exports = Logs;
