const _ = require('lodash');

const moment = require('moment');
const Logger = require('../logger');
const Client = require('./client');
const ServerlessError = require('../error');
const retry = require('promise-retry')

function promiseRetry (fn) {
  const retryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1 * 1000,
    randomize: true
  }
  return retry(fn, retryOptions)
}

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
    this.logClient = this.buildLogClient();
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

  /**
   * 过滤日志信息
   */
  filterByKeywords (logsList = {}, { requestId, keyword, queryErrorLog = false }) {
    let logsClone = _.cloneDeep(logsList)

    if (requestId) {
      logsClone = _.pick(logsClone, [requestId])
    }

    if (keyword) {
      logsClone = _.pickBy(logsClone, (value, key) => {
        const replaceLog = value.message.replace(new RegExp(/(\r)/g), '\n')
        return replaceLog.indexOf(keyword) !== -1
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

  /**
   * 获取日志
   */
  async getLogs ({ projectName, logStoreName, timeStart, timeEnd, topic, query }) {
    const requestParams = {
      projectName,
      logStoreName,
      topic,
      query,
      from: timeStart,
      to: timeEnd
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

  /**
   * 获取实时日志
   * @param {*} projectName 
   * @param {*} logStoreName 
   * @param {*} topic 
   * @param {*} query 
   */
  async realtime (projectName, logStoreName, topic, query) {
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
        topic,
        query
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

  /**
   * 获取历史日志
   * @param {*} projectName 
   * @param {*} logStoreName 
   * @param {*} timeStart 
   * @param {*} timeEnd 
   * @param {*} topic 
   * @param {*} query 
   * @param {*} keyword 关键字过滤
   * @param {*} queryErrorLog 
   * @param {*} requestId 
   */
  async history (projectName, logStoreName, timeStart, timeEnd, topic, query, keyword, queryErrorLog = false, requestId) {
    const logsList = await this.getLogs({
      timeStart,
      timeEnd,
      projectName,
      logStoreName,
      topic,
      query
    })

    return this.filterByKeywords(replaceLineBreak(logsList), { keyword, requestId, queryErrorLog })
  }

  /**
   * 初始化日志配置
   * @param {*} logConfig 
   */
  async initLogConfig (logConfig) {
    const {
      Project: projectName,
      LogStore: logStoreName,
      Description: description
    } = logConfig;

    await this.makeSlsProject(projectName, description);
    await this.makeLogstore({
      projectName,
      logStoreName
    });
    await this.makeLogstoreIndex(projectName, logStoreName);

    return {
      project: projectName,
      logStore: logStoreName
    }
  }

  // 处理日志项目
  async makeSlsProject (projectName, description) {
    const projectExist = await this.slsProjectExist(projectName);

    let create = false;
    if (projectExist) {
      this.logger.info('Default sls project already exists');
    } else {
      this.logger.info('Generating default sls project');
      await this.createSlsProject(projectName, description);
      this.logger.info(`Default sls project generated: ${projectName}`);
      create = true;
    }

    return create;
  }
  // 检测日志项目是否存在
  async slsProjectExist (projectName) {
    let projectExist = true
    await promiseRetry(async (retry, times) => {
      try {
        await this.logClient.getProject(projectName);
      } catch (ex) {
        if (ex.code === 'Unauthorized') {
          new ServerlessError({
            message: `Log Service '${projectName}' may create by others, you should use a unique project name.`,
            name: 'Unauthorized'
          });
        } else if (ex.code !== 'ProjectNotExist') {
          this.logger.log(`error when getProject, projectName is ${projectName}, error is: \n${ex}`);
          this.logger.info(`Retry ${times} times`)
          retry(ex);
        } else { projectExist = false }
      }
    })
    return projectExist;
  }
  // 创建日志项目
  async createSlsProject (projectName, description) {
    await promiseRetry(async (retry, times) => {
      try {
        await this.logClient.createProject(projectName, {
          description
        })
      } catch (ex) {
        if (ex.code === 'InvalidAccessKeyId') {
          new ServerlessError({
            message: 'Failed to create sls project for log, error code is InvalidAccessKeyId, please confirm that you had enabled sls service: https://sls.console.aliyun.com/'
          });
          new ServerlessError(ex);
        } else if (ex.code === 'Unauthorized') {
          new ServerlessError(ex);
        } else if (ex.code === 'ProjectAlreadyExist') {
          new ServerlessError({
            message: `error: sls project ${projectName} already exist, it may be in other region or created by other users.`,
            name: 'ProjectAlreadyExist'
          });
        } else if (ex.code === 'ProjectNotExist') {
          new ServerlessError({
            message: `Please go to https://sls.console.aliyun.com/ to open the LogServce.`,
            name: 'ProjectNotExist'
          });
        } else {
          this.logger.warn(`Error when createProject, projectName is ${projectName}, error is: ${ex}`)
          this.logger.warn(`Retry ${times} times`)
          retry(ex);
        }
      }
    })
  }

  // 处理日志仓库
  async makeLogstore ({
    projectName,
    logStoreName,
    ttl = 3600,
    shardCount = 1
  }) {
    let exists = true
    await promiseRetry(async (retry, times) => {
      try {
        await this.logClient.getLogStore(projectName, logStoreName)
      } catch (ex) {
        if (ex.code !== 'LogStoreNotExist') {
          this.logger.log(`error when getLogStore, projectName is ${projectName}, logstoreName is ${logStoreName}, error is: \n${ex}`);
          this.logger.info(`Retry ${times} times`)
          retry(ex)
        } else { exists = false }
      }
    })

    if (!exists) {
      await promiseRetry(async (retry, times) => {
        try {
          this.logger.info(`Generating default log store: ${logStoreName}`);
          await this.logClient.createLogStore(projectName, logStoreName, {
            ttl,
            shardCount
          });
          this.logger.info('Default log store generated');
        } catch (ex) {
          if (ex.code === 'Unauthorized') {
            new ServerlessError(ex);
          }
          this.logger.log(`error when createLogStore, projectName is ${projectName}, logstoreName is ${logStoreName}, error is: \n${ex}`);
          this.logger.info(`Retry ${times} times`);
          retry(ex);
        }
      })
    } else {
      this.logger.info(`Default log store already exists: ${logStoreName}`);
      await promiseRetry(async (retry, times) => {
        try {
          await this.logClient.updateLogStore(projectName, logStoreName, {
            ttl,
            shardCount
          });
        } catch (ex) {
          this.logger.log(`error when updateLogStore, projectName is ${projectName}, logstoreName is ${logStoreName}, error is: \n${ex}`);
          if (ex.code === 'Unauthorized') {
            new ServerlessError(ex);
          }
          if (ex.code !== 'ParameterInvalid' && ex.message !== 'no parameter changed') {
            this.logger.info(`Retry ${times} times`)
            retry(ex)
          } else {
            new ServerlessError(ex);
          }
        }
      })
    }
  }

  // 开启索引
  async makeLogstoreIndex (projectName, logstoreName) {
    await promiseRetry(async (retry, times) => {
      try {
        try {
          await this.logClient.getIndexConfig(projectName, logstoreName);
          return
        } catch (ex) {
          if (ex.code !== 'IndexConfigNotExist') {
            this.logger.log(`error when getIndexConfig, projectName is ${projectName}, logstoreName is ${logstoreName}, error is: \n${ex}`);
            new ServerlessError(ex);
          }
        }

        // create default logStore index. index configuration is same with sls console.
        this.logger.log(`logStore index not exist, try to create a default index for project ${projectName} logStore ${logstoreName}`);
        this.logger.info('Generating log store index');
        await this.logClient.createIndex(projectName, logstoreName, {
          ttl: 10,
          line: {
            caseSensitive: false,
            chn: false,
            token: [...', \'";=()[]{}?@&<>/:\n\t\r']
          }
        });
        this.logger.info('Log store index generated');
        this.logger.log(`create default index success for project ${projectName} logStore ${logstoreName}`);
      } catch (ex) {
        this.logger.log(`error when createIndex, projectName is ${projectName}, logstoreName is ${logstoreName}, error is: \n${ex}`);

        this.logger.info(`Retry ${times} times`);
        retry(ex);
      }
    })
  }

  /**
   * 删除日志项目
   */
  async removeProject (projectName) {
    const projectExist = await this.slsProjectExist(projectName);
    if (!projectExist) { return };

    this.logger.info(`Deleting sls project: ${projectName}`);
    await this.logClient.deleteProject(projectName);
    this.logger.success('Delete sls project successfully.');
  }
}

module.exports = Logs;
