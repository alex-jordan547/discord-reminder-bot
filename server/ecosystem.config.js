module.exports = {
  apps: [
    {
      name: 'discord-reminder-bot',
      script: 'dist/index.js',
      instances: 1, // Discord bot should only have one instance
      exec_mode: 'fork',

      // Auto restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // Environment variables
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'DEBUG',
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'INFO',
      },

      // Logging
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Advanced PM2 configuration
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Health monitoring
      health_check_grace_period: 30000,

      // Merge logs from all instances
      merge_logs: true,

      // Cron restart (optional - restart every day at 3 AM)
      cron_restart: '0 3 * * *',

      // Node.js configuration
      node_args: '--max-old-space-size=512',
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/alex-jordan547/discord-reminder-bot.git',
      path: '/var/www/discord-reminder-bot',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
