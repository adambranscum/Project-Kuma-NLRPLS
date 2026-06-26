module.exports = {
    apps: [
        {
            name: 'kuma-unified',
            script: 'server.js',
            cwd: __dirname,
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
