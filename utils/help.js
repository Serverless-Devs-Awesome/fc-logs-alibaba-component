
module.exports = (inputs) => ({

  description: `Usage: s ${inputs.Project.ProjectName} logs [options]

    Search logs from SLS`,

  args: [
    {
      name: '-s/--start-time',
      desc: 'query start time, like 2020-10-4 12:00:00'
    },
    {
      name: '-e/--end-time',
      desc: 'query end time, like 2020-10-4 13:00:00'
    },
    {
      name: '-k/--keyword',
      desc: 'keyword search.'
    },
    {
      name: '-r/--requestId',
      desc: 'requestId search.'
    },
    {
      name: '-t/--tail',
      desc: 'display log in real time'
    }
  ]
})