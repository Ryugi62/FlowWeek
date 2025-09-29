module.exports = {
  apps: [
    {
      name: 'flowweek-api',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/FlowWeek/apps/api',
      interpreter: '/usr/bin/node'
    },
    {
      name: 'flowweek-web',
      script: 'npm run preview -- --port 6868',
      cwd: '/home/ubuntu/FlowWeek/apps/web',
      interpreter: '/usr/bin/node'
    }
  ]
};